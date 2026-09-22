/**
 * The report service — where the engine meets the repository.
 *
 * Every mutation goes the same way: check the capability, check the lifecycle, run the pure
 * engine function, append an event, rebuild the projection. Nothing writes to `reports` or
 * `report_forms` directly, because those are derived; the log is the record.
 *
 * `now` is injected rather than read from the clock. ISO/IEC 17025 §7.8 asks when an
 * observation was recorded, so the timestamp is data the caller supplies (from the request,
 * or from a bench device), not an ambient side effect — which also makes every path here
 * reproducible in a test.
 */

import {
  checkModuleCompatibility,
  k1ErrorVsMpe,
  mpeBandTable,
  runForm,
  findTestRule,
  type FormRow,
  type FormExtras,
  resolveApplicableTests,
  resolveMpe,
  solveFamily,
  validateProfile,
  validateObservations,
  validateSoftwareIdentification,
  type InstrumentProfile,
  type Issue,
  type ModuleCompatibilityInput,
  type RulePack,
  type Variant,
  type Verdict,
  type WeighingObservation,
} from "@taraazu/engine";

import type { Db } from "../db/open.js";
import { appendEvent, verifyChain, readEvents } from "../db/events.js";
import { rebuildProjection, type ReportProjection } from "./events.js";
import { canTransition, type Guard, type ReportState, type RoleId } from "./lifecycle.js";
import { renderReport, loadFormsFile, type RenderFormat, type RenderedReport } from "./render.js";
import {
  generateKeyPair,
  signHash,
  verifySignature,
  type SignatureRecord,
} from "./signing.js";
import {
  AttachmentError,
  getAttachment,
  listAttachments,
  readAttachmentBytes,
  storeAttachment,
  type AttachmentKind,
  type AttachmentRow,
  type Confidentiality,
} from "./attachments.js";
import { can, canReadReport, canWriteReport, type Principal } from "./rbac.js";

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

const forbidden = (msg: string) => new ServiceError(403, "FORBIDDEN", msg);
const notFound = (id: string) => new ServiceError(404, "NOT_FOUND", `No report ${id}.`);
const badRequest = (code: string, msg: string) => new ServiceError(400, code, msg);

export interface ServiceContext {
  db: Db;
  pack: RulePack;
  /** ISO 8601 timestamp for this operation. */
  now: string;
  /** Where attachment bytes are written. Content-addressed within it. */
  attachmentRoot?: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getReport(ctx: ServiceContext, principal: Principal, id: string): ReportProjection {
  const row = ctx.db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as
    | ReportProjection
    | undefined;
  if (!row) throw notFound(id);
  const access = canReadReport(principal, row);
  if (!access.allowed) throw forbidden(access.reason ?? "Access denied.");
  return row;
}

export function getReportForms(ctx: ServiceContext, principal: Principal, id: string) {
  getReport(ctx, principal, id); // access check
  return ctx.db
    .prepare("SELECT * FROM report_forms WHERE report_id = ? ORDER BY form_id")
    .all(id);
}

/**
 * The report's history, and whether it is intact.
 *
 * Returned together deliberately: a history you cannot verify is just a list, and a
 * verification with nothing to look at is not auditable.
 */
export function getAuditTrail(ctx: ServiceContext, principal: Principal, id: string) {
  getReport(ctx, principal, id);
  if (!can(principal, "audit:verify")) throw forbidden("Role cannot read the audit trail.");
  const events = readEvents(ctx.db, id);
  return {
    verification: verifyChain(ctx.db, id),
    events: events.map((e) => ({
      version: e.version,
      eventType: e.event_type,
      actorId: e.actor_id,
      recordedAt: e.recorded_at,
      hash: e.hash,
      payload: JSON.parse(e.payload),
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateReportInput {
  reportId: string;
  applicationNo?: string;
  profile: "IN_Sch7A" | "OIML_R76" | "BOTH";
  feePaidInr?: number;
}

export function createReport(
  ctx: ServiceContext,
  principal: Principal,
  input: CreateReportInput,
): ReportProjection {
  if (!can(principal, "report:create")) throw forbidden(`Role ${principal.role} cannot create reports.`);
  const exists = ctx.db.prepare("SELECT 1 FROM reports WHERE id = ?").get(input.reportId);
  if (exists) throw badRequest("DUPLICATE_REPORT", `Report ${input.reportId} already exists.`);

  // MA-05: a negative fee was accepted, and feeds straight into the Rule 4(9) annual return's
  // feesRealisedInr total (stats.ts), so it would silently understate a lab's own statutory
  // figure. Only >= 0 is enforced, not a specific amount: AoM Rule 19 names two testing-fee
  // figures (docs/PRD.md: Rs 10,000 mechanical / Rs 25,000 digital-electronic, 2019 amendment),
  // but the instrument's mechanical/electronic nature isn't known at creation time (the profile
  // is a separate, later PUT), and Rule 19's Fifth Schedule also covers GATC verification fees
  // (Rs 50 - Rs 15,000) and possible future amendments -- pinning the check to the two current
  // testing-fee figures would reject legitimate values this codebase has no way to enumerate
  // exhaustively. A negative amount, in contrast, is never legitimate under any of those.
  if (input.feePaidInr !== undefined && (!Number.isFinite(input.feePaidInr) || input.feePaidInr < 0)) {
    throw badRequest(
      "E_NEGATIVE_FEE",
      `feePaidInr must be zero or a positive amount (got ${input.feePaidInr}).`,
    );
  }

  appendEvent(ctx.db, {
    reportId: input.reportId,
    eventType: "REPORT_CREATED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: {
      labId: principal.labId,
      // The pack is pinned at creation. A later pack update must never retroactively change
      // an issued result — the report says which rules produced it.
      rulesetId: ctx.pack.ruleset_id,
      rulesetVersion: String(ctx.pack["version"] ?? ""),
      profile: input.profile,
      ...(input.applicationNo ? { applicationNo: input.applicationNo } : {}),
      ...(input.feePaidInr !== undefined ? { feePaidInr: input.feePaidInr } : {}),
    },
  });
  return rebuildProjection(ctx.db, input.reportId)!;
}

export interface SetProfileResult {
  report: ReportProjection;
  issues: Issue[];
  applicable: ReturnType<typeof resolveApplicableTests>;
}

/**
 * Record the instrument profile, then re-resolve which forms apply.
 *
 * The two are one operation because they must not drift: a profile change that leaves a stale
 * test list behind would produce a report claiming tests the instrument no longer needs, or
 * silently omitting ones it now does.
 *
 * Validation issues are recorded and returned, not thrown. An officer entering a profile that
 * fails Table 3 needs to see why while they type; refusing the write would lose the entry.
 * The lifecycle guard is what stops an invalid report progressing.
 */
export function setInstrumentProfile(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  profile: InstrumentProfile,
  expectedVersion?: number,
): SetProfileResult {
  const report = getReport(ctx, principal, reportId);
  const write = canWriteReport(principal, report, "report:edit_profile");
  if (!write.allowed) throw forbidden(write.reason ?? "Cannot edit this report.");

  const issues = [
    ...validateProfile(profile, ctx.pack),
    ...(profile.softwareChecksum
      ? validateSoftwareIdentification(profile.softwareChecksum, {
          // The owner matters: the defect the register actually contains is one checksum
          // shared by *two different manufacturers* (certificates #259 and #300). The same
          // manufacturer declaring the same software on a second model is ordinary, and
          // flagging it would train officers to ignore the warning.
          ...(profile.manufacturer ? { owner: profile.manufacturer } : {}),
          knownChecksums: knownChecksums(ctx.db, reportId),
        })
      : []),
  ];

  const maxCapacityG = maxCapacityInGrams(profile);

  appendEvent(ctx.db, {
    reportId,
    eventType: "PROFILE_UPDATED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    payload: { profile, maxCapacityG, issues },
  });

  const applicable = resolveApplicableTests(profile, ctx.pack);
  appendEvent(ctx.db, {
    reportId,
    eventType: "APPLICABILITY_RESOLVED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: { tests: applicable },
  });

  return { report: rebuildProjection(ctx.db, reportId)!, issues, applicable };
}

/**
 * Software checksums already recorded elsewhere in this repository.
 *
 * The national register contains one checksum value shared by two different manufacturers
 * (docs/certificates/certificates-analysis.md). Feeding the neighbours in lets the validator
 * catch that class of defect — a duplicate is invisible to any check that sees one value at
 * a time.
 */
function knownChecksums(db: Db, excludeReportId: string): Record<string, string> {
  const rows = db
    .prepare(
      `SELECT id, manufacturer, json_extract(instrument_json, '$.softwareChecksum') AS ck
         FROM reports
        WHERE id != ? AND ck IS NOT NULL`,
    )
    .all(excludeReportId) as { id: string; manufacturer: string | null; ck: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.ck] = r.manufacturer ?? r.id;
  return out;
}

function maxCapacityInGrams(p: InstrumentProfile): number {
  const factor = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 }[p.unit];
  return Math.max(...p.ranges.map((r) => r.max)) * factor;
}

export interface RecordObservationsInput {
  formId: string;
  testId?: string;
  rangeIndex?: number;
  /**
   * The rows exactly as the printed form lays them out: values keyed by the column keys the
   * form declares. Not a weighing-shaped array — form 12.1's rows carry an amplitude and a
   * significant-fault flag, form 4.2's a displacement in millimetres.
   */
  rows?: FormRow[];
  /** Header values that are part of the observation but are not columns (test load, Utest). */
  extras?: FormExtras;
  /** Legacy weighing-shaped body, still accepted so existing callers keep working. */
  observations?: WeighingObservation[];
  zeroError?: number;
  environment?: unknown[];
}

/**
 * A weighing row's load/indication/additionalLoad, coerced from a numeric-looking string to
 * a number if that's what it is.
 *
 * Mirrors `validateObservations`'s own internal coercion (packages/engine/src/validate.ts)
 * but is applied here, to the actual `rows` that get persisted and fed to the kernel — fixing
 * the string-vs-number mismatch only inside validateObservations's private copy would leave
 * `runForm` and the audit log holding the original string. AD-05 / F9: a browser `<input>`
 * control's value is a string, and this is what stopped a perfectly finite reading like "777"
 * being reported (and logged) as E_NON_FINITE_VALUE instead of the real finding for it.
 */
function coerceWeighingRow(row: FormRow): FormRow {
  const coerce = (v: FormRow[string]): FormRow[string] =>
    typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  const out: FormRow = { ...row };
  for (const field of ["load", "indication", "additionalLoad"] as const) {
    if (out[field] !== undefined) out[field] = coerce(out[field]);
  }
  return out;
}

/**
 * Record observations for one R 76-2 form and compute its result.
 *
 * The kernel is chosen by the rule pack, never by this function: `runForm` looks up which
 * kernel the pack names for the form and feeds it the rows under the column keys the printed
 * form declares. Before that, this ran `k1ErrorVsMpe` on everything, which meant a creep form
 * and a disturbance form both came back with an error-against-mpe verdict — a real answer to a
 * question neither form asks.
 *
 * Validation happens *before* anything is appended (AD-05 / F9). A blocking (error-severity)
 * finding on a weighing row — an out-of-range load, a non-finite value — is not a metrology
 * result to record, it is a data-entry problem to fix and resubmit; the mpe resolver cannot
 * even compute an answer for it. So the request is refused outright, with the specific issue
 * code that describes it, and nothing is written to the append-only log. This used to append
 * the raw observation first and only then attempt the computation, which meant a rejected
 * attempt was still permanently logged (and, because `runForm` throws a bare `Error` rather
 * than reporting an `Issue`, under whatever generic status that produced) — worse, still,
 * when the value that made the row invalid was itself mis-typed as non-finite (see
 * `coerceWeighingRow`), the log recorded the wrong reason for the rejection.
 *
 * Once a request passes validation, the raw observations are still appended *before* the
 * computed result, as two separate events. That ordering is the ISO/IEC 17025 §7.8
 * requirement in practice: what the officer read off the instrument is recorded when made,
 * and the derivation is a separate, later record — so a change in how we compute can never
 * look like a change in what was observed.
 */
export function recordWeighingObservations(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: RecordObservationsInput,
): { verdict: Verdict; issues: Issue[]; rows: unknown[]; summary?: unknown[]; notes?: string[] } {
  const report = getReport(ctx, principal, reportId);
  const write = canWriteReport(principal, report, "report:record_observations");
  if (!write.allowed) throw forbidden(write.reason ?? "Cannot record observations.");

  const profile = report.instrument_json
    ? (JSON.parse(report.instrument_json) as InstrumentProfile)
    : null;
  if (!profile) {
    throw badRequest(
      "NO_PROFILE",
      "Record the instrument profile before entering observations — the mpe cannot be " +
        "resolved without the accuracy class and the weighing ranges.",
    );
  }

  const rule = findTestRule(ctx.pack, input.formId);
  if (!rule) {
    throw badRequest(
      "UNKNOWN_FORM",
      `No test in rule pack ${ctx.pack.ruleset_id} corresponds to form ${input.formId}.`,
    );
  }

  // A caller may post either the form-shaped rows or the older weighing array. The weighing
  // array is only meaningful for a form whose columns are the weighing columns, so converting
  // it for, say, form 12.1 would be inventing data — hence the check rather than a silent map.
  let rows: FormRow[];
  if (input.rows) {
    rows = input.rows;
  } else if (input.observations) {
    if (rule.kernel !== "K1") {
      throw badRequest(
        "WRONG_OBSERVATION_SHAPE",
        `Form ${input.formId} is decided by kernel ${rule.kernel}, not by the error-against-mpe ` +
          `check, so it does not take load/indication rows. Post \`rows\` keyed by the columns ` +
          `form ${input.formId} prints.`,
      );
    }
    rows = input.observations.map((o) => ({ ...o })) as FormRow[];
  } else {
    throw badRequest("NO_OBSERVATIONS", "No observations were supplied for this form.");
  }

  // The weighing-shaped validator only speaks about load/indication rows, so both the
  // coercion and the validation are applied only where those are what the form holds.
  if (rule.kernel === "K1") {
    rows = rows.map(coerceWeighingRow);
  }
  const issues =
    rule.kernel === "K1"
      ? validateObservations(profile, rows as unknown as WeighingObservation[])
      : [];

  // A blocking finding means there is nothing valid to record or compute from — refuse before
  // writing anything, with the finding's own code and message (not a generic one).
  const blocking = issues.find((iss) => iss.severity === "error");
  if (blocking) {
    throw badRequest(blocking.code, blocking.message);
  }

  const extras: FormExtras = { ...(input.extras ?? {}) };
  if (input.zeroError !== undefined) extras["zeroError"] = input.zeroError;

  // Computed before anything is appended: if the engine itself refuses (e.g. a non-K1 form
  // whose extras or rows the kernel cannot resolve an mpe or a fault threshold for), the
  // request is rejected the same way — cleanly, and with nothing left in the log — rather
  // than the raw observation having already been written by the time the throw happens.
  let result: ReturnType<typeof runForm>;
  try {
    result = runForm({ formId: input.formId, profile, rows, extras }, ctx.pack, loadFormsFile());
  } catch (err) {
    throw badRequest(
      "E_COMPUTE_FAILED",
      err instanceof Error ? err.message : "The engine could not compute a result for this form.",
    );
  }

  appendEvent(ctx.db, {
    reportId,
    eventType: "OBSERVATIONS_RECORDED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: {
      formId: input.formId,
      ...(input.rangeIndex !== undefined ? { rangeIndex: input.rangeIndex } : {}),
      rows,
      ...(Object.keys(extras).length > 0 ? { extras } : {}),
      ...(input.environment ? { environment: input.environment } : {}),
      issues,
    },
  });

  appendEvent(ctx.db, {
    reportId,
    eventType: "FORM_RESULT_COMPUTED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: {
      formId: input.formId,
      testId: result.testId,
      kernel: result.kernel,
      ...(input.rangeIndex !== undefined ? { rangeIndex: input.rangeIndex } : {}),
      verdict: result.verdict,
      // The environmental header travels with the computed form, so a reader of the record
      // gets the conditions the readings were taken in without replaying the event log. The
      // entry screen showed empty boxes on a recorded form for exactly this reason.
      result: { ...result, ...(input.environment ? { environment: input.environment } : {}) },
    },
  });

  rebuildProjection(ctx.db, reportId);
  return {
    verdict: result.verdict,
    issues,
    rows: result.rows,
    summary: result.summary,
    notes: result.notes,
  };
}

/** Resolve an mpe without recording anything — for live feedback as an officer types. */
export function previewMpe(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  load: number,
) {
  const report = getReport(ctx, principal, reportId);
  if (!report.instrument_json) throw badRequest("NO_PROFILE", "No instrument profile recorded yet.");
  const profile = JSON.parse(report.instrument_json) as InstrumentProfile;
  return resolveMpe(profile, load, ctx.pack);
}

export function runFamilySolver(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  variants: Variant[],
) {
  getReport(ctx, principal, reportId);
  return solveFamily(variants, ctx.pack);
}

/**
 * The family solver with no report attached.
 *
 * Pure: it reads only the variants and the rule pack, and records nothing. Requiring a report
 * would be an access check guarding no data, and a laboratory quoting for a family before any
 * report exists is the ordinary case.
 */
/**
 * Everything the registration wizard's live panel needs, from one call.
 *
 * The browser must never compute a permissible error — that guarantee is the reason a verdict
 * on screen is the verdict on the report. But an officer entering a profile needs to see the
 * consequences *before* saving: whether the class and Max are a legal combination, what the
 * bands will be, and which tests the instrument attracts. So the preview is a real engine call
 * on an unsaved profile: pure, records nothing, and returns exactly what the report would use.
 */
export function previewProfile(ctx: ServiceContext, profile: InstrumentProfile) {
  const issues = [
    ...validateProfile(profile, ctx.pack),
    ...(profile.softwareChecksum ? validateSoftwareIdentification(profile.softwareChecksum) : []),
  ];

  // A profile with a blocking defect cannot be resolved against — asking for the bands of an
  // instrument whose class and e are contradictory would return arithmetic, not an answer.
  const blocking = issues.some((i) => i.severity === "error");

  return {
    issues,
    bands: blocking ? [] : mpeBandTable(profile, ctx.pack),
    applicable: blocking ? [] : resolveApplicableTests(profile, ctx.pack),
    blocking,
  };
}

export function solveFamilyStandalone(ctx: ServiceContext, variants: Variant[]) {
  return solveFamily(variants, ctx.pack);
}

/**
 * Annex F module compatibility, standing alone.
 *
 * Also pure. A laboratory asked "can this indicator drive that load cell" long before a report
 * exists — that is the question the modular approach is for.
 */
export function checkModulesStandalone(ctx: ServiceContext, input: ModuleCompatibilityInput) {
  return checkModuleCompatibility(input, ctx.pack);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Which guards this report currently satisfies.
 *
 * The state machine declares what a transition needs; this answers it from the data. Keeping
 * the two apart is what lets `lifecycle.ts` stay a pure function with no database access.
 */
export function satisfiedGuards(ctx: ServiceContext, reportId: string): Guard[] {
  const guards: Guard[] = [];

  const forms = ctx.db
    .prepare("SELECT applicable, verdict FROM report_forms WHERE report_id = ?")
    .all(reportId) as { applicable: number; verdict: string | null }[];
  const applicable = forms.filter((f) => f.applicable === 1);
  if (applicable.length > 0 && applicable.every((f) => f.verdict)) {
    guards.push("all_applicable_forms_complete");
  }

  // Blocking issues are error-severity findings that still stand.
  //
  // "Still stand" is the whole subtlety. The log is append-only, so a superseded entry is
  // still in it — but it has been amended, and ISO/IEC 17025 §7.8 asks that the original be
  // *retained*, not that it keep governing. Scanning every historical event would mean an
  // officer who once recorded a bad checksum could never validate the report again, however
  // many times they corrected it. So only the latest profile, and the latest observations per
  // form, are consulted.
  //
  // Warnings never block; an officer may knowingly proceed past one.
  const events = readEvents(ctx.db, reportId);

  const latestProfile = [...events].reverse().find((e) => e.event_type === "PROFILE_UPDATED");
  const latestObservationsByForm = new Map<string, Issue[]>();
  for (const e of events) {
    if (e.event_type !== "OBSERVATIONS_RECORDED") continue;
    const p = JSON.parse(e.payload) as { formId?: string; issues?: Issue[] };
    if (p.formId) latestObservationsByForm.set(p.formId, p.issues ?? []);
  }

  const profileIssues = latestProfile
    ? ((JSON.parse(latestProfile.payload) as { issues?: Issue[] }).issues ?? [])
    : [];

  const blocking =
    profileIssues.some((i) => i.severity === "error") ||
    [...latestObservationsByForm.values()].some((issues) =>
      issues.some((i) => i.severity === "error"),
    );
  if (!blocking) guards.push("no_blocking_validation_issues");

  const open = ctx.db
    .prepare("SELECT COUNT(*) AS n FROM deficiencies WHERE report_id = ? AND resolved_at IS NULL")
    .get(reportId) as { n: number };
  if (open.n === 0) guards.push("all_deficiencies_resolved");

  const locked = ctx.db.prepare("SELECT locked_hash FROM reports WHERE id = ?").get(reportId) as
    | { locked_hash: string | null }
    | undefined;
  if (locked?.locked_hash) guards.push("final_pdf_rendered");

  return guards;
}

export interface TransitionInput {
  to: ReportState;
  /** Required when moving to LOCKED — the record copy's hash. */
  pdfSha256?: string;
  note?: string;
  expectedVersion?: number;
}

export function transitionReport(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: TransitionInput,
): ReportProjection {
  const report = getReport(ctx, principal, reportId);

  // Locking is the one transition that supplies its own guard: the hash arrives with the
  // request, so record it before asking whether the guard is met.
  const guards = satisfiedGuards(ctx, reportId);
  if (input.to === "LOCKED" && input.pdfSha256) guards.push("final_pdf_rendered");

  const check = canTransition(
    report.status as ReportState,
    input.to,
    principal.role as RoleId,
    guards,
  );
  if (!check.allowed) throw forbidden(check.reason ?? "Transition not permitted.");

  appendEvent(ctx.db, {
    reportId,
    eventType: check.transition!.event,
    actorId: principal.userId,
    recordedAt: ctx.now,
    ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
    payload: {
      to: input.to,
      basis: check.transition!.basis,
      ...(input.pdfSha256 ? { pdfSha256: input.pdfSha256 } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
  });

  return rebuildProjection(ctx.db, reportId)!;
}

/**
 * Render a report, and record that it was rendered.
 *
 * The rendering itself is a read, but it is *logged*, because a report leaving the building is
 * an event a laboratory needs in its history — "which copy did the applicant receive, and when"
 * is exactly the question a dispute turns on. The hash of the produced bytes goes into the log
 * with it, so any copy can later be matched back to the render that made it.
 */
export async function renderReportForDownload(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  format: RenderFormat,
): Promise<RenderedReport> {
  const report = getReport(ctx, principal, reportId);

  let rendered: RenderedReport;
  try {
    rendered = await renderReport(ctx.db, report, format, { generatedAt: ctx.now });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Two distinct "Chromium is not where we expected it" failures, told apart by environment
    // rather than by guessing from the message alone:
    //  - locally / on a bench install, `playwright`'s own browser is missing — Playwright's
    //    launch error says so in those words ("Executable doesn't exist at ...");
    //  - on Vercel, `packages/renderers/src/pdf.ts` drives `@sparticuz/chromium` instead, and a
    //    packaging problem there (wrong `includeFiles`, too little memory to unpack it in time)
    //    fails as an ordinary filesystem or launch error mentioning "chromium" — worth telling
    //    apart from an unrelated 500, since the fix is an operator action, not a code bug.
    const looksLikeMissingChromium =
      /executable doesn't exist|browserType\.launch|chromium/i.test(message);
    if (format === "pdf" && looksLikeMissingChromium) {
      const onVercel = process.env["VERCEL"] === "1";
      // The raw failure only goes to the server log — an officer's 503 stays short and
      // actionable, but whoever deployed this needs the real reason available somewhere.
      console.error(`[taraazu] PDF rendering could not start Chromium: ${message}`);
      throw new ServiceError(
        503,
        "RENDERER_UNAVAILABLE",
        onVercel
          ? "PDF rendering could not start Chromium on this deployment. This is an operator " +
              "problem, not yours — check the function's bundled files and memory in the " +
              "Vercel project settings (see docs/DEPLOY.md), or download the DOCX or JSON " +
              "instead."
          : "PDF rendering needs Chromium, which is not installed on this server. " +
              "Run `npx playwright install chromium`, or download the DOCX or JSON instead.",
      );
    }
    throw new ServiceError(500, "RENDER_FAILED", `Could not render the ${format}: ${message}`);
  }

  appendEvent(ctx.db, {
    reportId,
    eventType: "REPORT_RENDERED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: { format, sha256: rendered.sha256, byteLength: rendered.bytes.byteLength },
  });
  rebuildProjection(ctx.db, reportId);

  return rendered;
}

/**
 * Render the PDF and lock the report to it in one step.
 *
 * Deliberately one operation. Rendering and locking as two calls leaves a window in which the
 * report could change between them, and the hash recorded would then belong to a document
 * nobody has — which is precisely the failure the hash exists to prevent.
 */
export async function renderAndLock(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
): Promise<{ report: ReportProjection; sha256: string }> {
  const before = getReport(ctx, principal, reportId);
  if (!can(principal, "report:lock")) {
    throw forbidden(`Role ${principal.role} cannot lock a report.`);
  }

  // Check the move is legal *before* rendering, so a refusal costs nothing and the officer
  // gets the state machine's own explanation.
  const check = canTransition(
    before.status as ReportState,
    "LOCKED",
    principal.role as RoleId,
    [...satisfiedGuards(ctx, reportId), "final_pdf_rendered"],
  );
  if (!check.allowed) throw forbidden(check.reason ?? "The report cannot be locked yet.");

  const rendered = await renderReportForDownload(ctx, principal, reportId, "pdf");
  const report = transitionReport(ctx, principal, reportId, {
    to: "LOCKED",
    pdfSha256: rendered.sha256,
  });
  return { report, sha256: rendered.sha256 };
}

/**
 * Attach a file to a report (FR14).
 *
 * The hash goes into the append-only log, so the report's history records not merely that a
 * drawing was attached but *which* drawing — a filename can be reused, a hash cannot.
 */
export function addAttachment(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: {
    kind: AttachmentKind;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    confidentiality?: Confidentiality;
  },
  storageRoot: string,
): AttachmentRow {
  const report = getReport(ctx, principal, reportId);
  const write = canWriteReport(principal, report, "attachment:upload");
  if (!write.allowed) throw forbidden(write.reason ?? "Cannot attach files to this report.");

  let row: AttachmentRow;
  try {
    row = storeAttachment(ctx.db, storageRoot, {
      reportId,
      kind: input.kind,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      ...(input.confidentiality ? { confidentiality: input.confidentiality } : {}),
      uploadedBy: principal.userId,
      uploadedAt: ctx.now,
    });
  } catch (err) {
    if (err instanceof AttachmentError) throw new ServiceError(400, err.code, err.message);
    throw err;
  }

  appendEvent(ctx.db, {
    reportId,
    eventType: "ATTACHMENT_ADDED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: {
      attachmentId: row.id,
      kind: row.kind,
      filename: row.filename,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      confidentiality: row.confidentiality,
    },
  });
  rebuildProjection(ctx.db, reportId);

  return row;
}

export function listReportAttachments(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
): AttachmentRow[] {
  getReport(ctx, principal, reportId);
  return listAttachments(ctx.db, reportId);
}

/**
 * Read one attachment's bytes.
 *
 * A `confidential` file needs the capability as well as access to the report — Rule 16(2)
 * makes submitted models and drawings closed to public inspection, and "can see the report"
 * is not the same permission as "can see the manufacturer's circuit diagram".
 */
export function readAttachment(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  attachmentId: string,
): { row: AttachmentRow; bytes: Uint8Array } {
  getReport(ctx, principal, reportId);

  const row = getAttachment(ctx.db, reportId, attachmentId);
  if (!row) throw new ServiceError(404, "NOT_FOUND", `No attachment ${attachmentId} on report ${reportId}.`);

  if (row.confidentiality === "confidential" && !can(principal, "attachment:read_confidential")) {
    throw forbidden(
      "This attachment is marked confidential. Submitted models and drawings are not open to " +
        "inspection (AoM Rule 16(2)); reading them needs a reviewing role.",
    );
  }

  try {
    return { row, bytes: readAttachmentBytes(row) };
  } catch (err) {
    if (err instanceof AttachmentError) {
      // A missing or altered file is a 500-class fact about the store, not a bad request.
      throw new ServiceError(err.code === "FILE_MISSING" ? 410 : 500, err.code, err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Digital signatures (FR16)
// ---------------------------------------------------------------------------

/**
 * Register the officer's public key.
 *
 * The private half is generated and returned once, here, and never stored — which is the
 * closest a demonstration can get to a DSC token without one. A deployment registers a public
 * key whose private half already lives on the officer's card, and this endpoint takes only the
 * public half.
 */
export function registerSigningKey(
  ctx: ServiceContext,
  principal: Principal,
  publicKeyPem?: string,
): { publicKeyPem: string; privateKeyPem?: string; generated: boolean } {
  if (publicKeyPem) {
    ctx.db.prepare("UPDATE users SET public_key = ? WHERE id = ?").run(publicKeyPem, principal.userId);
    return { publicKeyPem, generated: false };
  }

  const pair = generateKeyPair();
  ctx.db.prepare("UPDATE users SET public_key = ? WHERE id = ?").run(pair.publicKeyPem, principal.userId);
  // Returned once and not retained. If it is lost, a new key is registered; past signatures
  // stay verifiable because they are checked against the key that made them.
  return { publicKeyPem: pair.publicKeyPem, privateKeyPem: pair.privateKeyPem, generated: true };
}

/**
 * Sign the report's current head — the latest event in its chain.
 *
 * Because each event's hash covers the previous one, a signature over the head commits the
 * signer to the entire history behind it. There is nothing to sign "the report" separately.
 *
 * The signature is recorded as its own event rather than written onto the event it covers,
 * because the log is append-only: an entry is never modified after the fact, not even to
 * countersign it.
 */
export function signReport(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: { signature?: string; privateKeyPem?: string },
): { signedVersion: number; hash: string; signature: string } {
  getReport(ctx, principal, reportId);

  const user = ctx.db
    .prepare("SELECT public_key FROM users WHERE id = ?")
    .get(principal.userId) as { public_key: string | null } | undefined;
  if (!user?.public_key) {
    throw badRequest(
      "NO_SIGNING_KEY",
      "No signing key is registered for this officer. Register one before signing.",
    );
  }

  const events = readEvents(ctx.db, reportId);
  const head = events[events.length - 1];
  if (!head) throw badRequest("NOTHING_TO_SIGN", "This report has no records to sign.");

  // Either the officer's device produced the signature (the real case) or, for a
  // demonstration, the caller hands over a private key and the server signs with it. The
  // second is a convenience, never a security property, and the route says so.
  const signature = input.signature ?? (input.privateKeyPem ? signHash(head.hash, input.privateKeyPem) : null);
  if (!signature) {
    throw badRequest(
      "NO_SIGNATURE",
      "Provide either a detached `signature` over the report's head hash, or a `privateKeyPem` " +
        "for the demonstration signer.",
    );
  }

  const check = verifySignature(head.hash, signature, user.public_key);
  if (!check.ok) throw badRequest("BAD_SIGNATURE", check.reason ?? "The signature did not verify.");

  appendEvent(ctx.db, {
    reportId,
    eventType: "REPORT_SIGNED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    // The signer's public key travels *with* the signature.
    //
    // Verification used to look the key up on the user, which meant an officer who rotated
    // their key silently invalidated every signature they had ever made — the report would
    // show a red "does not verify" against a signature that was, in fact, perfectly good at
    // the time. A signature is an assertion about a moment, so the key that made it belongs in
    // the record of that moment, not in a row that can move underneath it.
    payload: { signedVersion: head.version, signedHash: head.hash, publicKey: user.public_key },
    signature,
  });
  rebuildProjection(ctx.db, reportId);

  return { signedVersion: head.version, hash: head.hash, signature };
}

/**
 * Every signature on a report, re-verified, together with the state of the chain beneath them.
 *
 * Both halves are returned because either alone misleads. Verification runs on read rather
 * than being trusted from when it was recorded — a stored "verified" flag is an assertion, and
 * the point of a signature is that the assertion can be re-checked.
 *
 * The subtler half: a signature commits its signer to the event hash as it stood, and that
 * stored hash does not change when someone rewrites the row it describes. So a tampered report
 * can still carry a **cryptographically valid** signature — what fails is the chain, because
 * the recorded hash no longer matches the recomputed one. Returning the signatures without the
 * chain's verdict would show green ticks over altered data, which is worse than showing
 * nothing. The two travel together.
 */
export function getSignatures(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
): { chain: ReturnType<typeof verifyChain>; trustworthy: boolean; signatures: SignatureRecord[] } {
  getReport(ctx, principal, reportId);
  const events = readEvents(ctx.db, reportId);
  const chain = verifyChain(ctx.db, reportId);

  const signatures = events
    .filter((e) => e.event_type === "REPORT_SIGNED" && e.signature)
    .map((e) => {
      const payload = JSON.parse(e.payload) as {
        signedVersion: number; signedHash: string; publicKey?: string;
      };
      const user = ctx.db
        .prepare("SELECT full_name, role_id, public_key FROM users WHERE id = ?")
        .get(e.actor_id) as { full_name: string; role_id: string; public_key: string | null } | undefined;

      // The key recorded with the signature, where there is one: it is the key that actually
      // made this signature. The user's current key is the fallback for events written before
      // the key was carried in the payload, and it is only correct while nobody has rotated.
      const key = payload.publicKey ?? user?.public_key ?? null;
      const check = key
        ? verifySignature(payload.signedHash, e.signature!, key)
        : { ok: false, reason: "The signer has no registered public key." };

      // Signed under a key the officer has since replaced.
      //
      // Reported, but not as a failure. A signature made with a key that was valid at the time
      // is valid; treating rotation as invalidity would turn a laboratory's whole archive red
      // the first time anyone renewed a DSC — which under the Indian regime is every year or
      // two — and would say "tampered" about records that had not changed. Revocation is a
      // separate question from verification, and answering it by silently failing the maths
      // conflates the two. So the fact is surfaced and the reader decides what it means.
      const keyRotated =
        Boolean(payload.publicKey) &&
        Boolean(user?.public_key) &&
        payload.publicKey !== user?.public_key;

      return {
        eventVersion: payload.signedVersion,
        eventType: e.event_type,
        actorId: e.actor_id,
        actorName: user?.full_name ?? e.actor_id,
        role: user?.role_id ?? "—",
        recordedAt: e.recorded_at,
        hash: payload.signedHash,
        signature: e.signature!,
        verified: check.ok,
        ...(keyRotated ? { keyRotated: true } : {}),
        ...(check.reason ? { reason: check.reason } : {}),
      };
    });

  return {
    chain,
    // A signature is only worth anything if the record it covers is intact. One broken link
    // anywhere in the chain devalues every signature on the report, however well each verifies
    // on its own.
    trustworthy: chain.ok && signatures.length > 0 && signatures.every((s) => s.verified),
    signatures,
  };
}

export interface ChecklistAnswerInput {
  checklistId: string;
  answers: { index: number; ref?: string; answer: "yes" | "no" | "na"; remark?: string }[];
}

/**
 * Record checklist responses.
 *
 * Answers are appended, not replaced. Changing an answer emits a new event and the projection
 * takes the later one; the earlier answer stays in the log, which is what ISO/IEC 17025 §7.8
 * asks for — the original is retained, the amendment is dated and attributed.
 *
 * Items are addressed by their index within the checklist rather than by the clause they cite,
 * because several items legitimately cite the same clause. Keying on the reference would let
 * one answer silently stand for several questions.
 */
export function recordChecklistAnswers(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: ChecklistAnswerInput,
): { recorded: number } {
  const report = getReport(ctx, principal, reportId);
  const write = canWriteReport(principal, report, "report:record_observations");
  if (!write.allowed) throw forbidden(write.reason ?? "Cannot record checklist answers.");

  if (!input.checklistId) throw badRequest("NO_CHECKLIST", "checklistId is required.");
  if (!Array.isArray(input.answers) || input.answers.length === 0) {
    throw badRequest("NO_ANSWERS", "Provide at least one answer.");
  }
  for (const a of input.answers) {
    if (!Number.isInteger(a.index) || a.index < 0) {
      throw badRequest("BAD_ITEM_INDEX", `Item index must be a non-negative integer (got ${a.index}).`);
    }
    if (!["yes", "no", "na"].includes(a.answer)) {
      throw badRequest("BAD_ANSWER", `Answer must be yes, no or na (got ${JSON.stringify(a.answer)}).`);
    }
  }

  appendEvent(ctx.db, {
    reportId,
    eventType: "CHECKLIST_ANSWERED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: { checklistId: input.checklistId, answers: input.answers },
  });
  rebuildProjection(ctx.db, reportId);

  return { recorded: input.answers.length };
}

export function getChecklistAnswers(ctx: ServiceContext, principal: Principal, reportId: string) {
  getReport(ctx, principal, reportId);
  return ctx.db
    .prepare(
      `SELECT checklist_id, item_index, item_ref, answer, remark, updated_at
         FROM report_checklist_answers WHERE report_id = ?
        ORDER BY checklist_id, item_index`,
    )
    .all(reportId);
}

export interface DeficiencyInput {
  id: string;
  formId?: string;
  severity: "major" | "minor" | "observation";
  text: string;
}

export function raiseDeficiency(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: DeficiencyInput,
): void {
  const report = getReport(ctx, principal, reportId);
  if (!can(principal, "report:raise_deficiency")) {
    throw forbidden(`Role ${principal.role} cannot raise deficiencies.`);
  }
  if (report.lab_id !== principal.labId && !can(principal, "report:read_any_lab")) {
    throw forbidden("Report belongs to another laboratory.");
  }

  ctx.db
    .prepare(
      `INSERT INTO deficiencies (id, report_id, form_id, severity, text, raised_by, raised_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.id, reportId, input.formId ?? null, input.severity, input.text, principal.userId, ctx.now);

  appendEvent(ctx.db, {
    reportId,
    eventType: "DEFICIENCY_RAISED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: { deficiencyId: input.id, severity: input.severity, text: input.text, formId: input.formId },
  });
  rebuildProjection(ctx.db, reportId);
}

/**
 * Every deficiency raised against a report, open and closed.
 *
 * Closed ones are returned too: a deficiency that was raised and answered is part of what
 * happened to the report, and a screen that showed only the open ones would say a report had a
 * clean history when it had a corrected one.
 */
export function listDeficiencies(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
): {
  id: string; formId: string | null; severity: string; text: string;
  raisedBy: string; raisedAt: string; resolvedAt: string | null; resolution: string | null;
}[] {
  getReport(ctx, principal, reportId);
  const rows = ctx.db
    .prepare(
      `SELECT d.id, d.form_id, d.severity, d.text, d.raised_at, d.resolved_at, d.resolution,
              COALESCE(u.full_name, d.raised_by) AS raised_by
         FROM deficiencies d
         LEFT JOIN users u ON u.id = d.raised_by
        WHERE d.report_id = ?
        ORDER BY d.raised_at`,
    )
    .all(reportId) as {
      id: string; form_id: string | null; severity: string; text: string;
      raised_at: string; resolved_at: string | null; resolution: string | null; raised_by: string;
    }[];
  return rows.map((r) => ({
    id: r.id,
    formId: r.form_id,
    severity: r.severity,
    text: r.text,
    raisedBy: r.raised_by,
    raisedAt: r.raised_at,
    resolvedAt: r.resolved_at,
    resolution: r.resolution,
  }));
}

/**
 * Resolve a deficiency: record what was done about it, so `all_deficiencies_resolved` can
 * become true and the report can be recommended.
 *
 * Deliberately NOT gated by `canWriteReport` (the report-data freeze, F1): resolving a
 * deficiency is part of the deficiency workflow, not an edit to profile/observations/checklist
 * data, and it is exactly the action a report in DEFICIENCY or SUBMITTED (after the lab has
 * fixed the underlying data and resubmitted, per the deficiency loop test) needs to allow. The
 * capability check mirrors `raiseDeficiency`'s: whoever may raise a deficiency or record report
 * data may also mark one resolved — the lab (MA) writes the resolution text, a reviewing
 * officer may also close one they judge no longer applies.
 */
export function resolveDeficiency(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  deficiencyId: string,
  resolution: string,
): void {
  const report = getReport(ctx, principal, reportId);
  if (!can(principal, "report:record_observations") && !can(principal, "report:raise_deficiency")) {
    throw forbidden(`Role ${principal.role} cannot resolve deficiencies.`);
  }
  if (report.lab_id !== principal.labId && !can(principal, "report:read_any_lab")) {
    throw forbidden("Report belongs to another laboratory.");
  }

  const info = ctx.db
    .prepare(
      `UPDATE deficiencies SET resolved_by = ?, resolved_at = ?, resolution = ?
        WHERE id = ? AND report_id = ? AND resolved_at IS NULL`,
    )
    .run(principal.userId, ctx.now, resolution, deficiencyId, reportId);
  if (info.changes === 0) {
    throw badRequest("NO_OPEN_DEFICIENCY", `No open deficiency ${deficiencyId} on report ${reportId}.`);
  }

  appendEvent(ctx.db, {
    reportId,
    eventType: "DEFICIENCY_RESOLVED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: { deficiencyId, resolution },
  });
  rebuildProjection(ctx.db, reportId);
}
