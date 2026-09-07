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
} from "@tulasetu/engine";

import type { Db } from "../db/open.js";
import { appendEvent, verifyChain, readEvents } from "../db/events.js";
import { rebuildProjection, type ReportProjection } from "./events.js";
import { canTransition, type Guard, type ReportState, type RoleId } from "./lifecycle.js";
import { renderReport, type RenderFormat, type RenderedReport } from "./render.js";
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
  observations: WeighingObservation[];
  zeroError?: number;
  environment?: unknown[];
}

/**
 * Record observations for a K1-shaped form and compute its result.
 *
 * The raw observations are appended *before* the computed result, as two separate events.
 * That ordering is the ISO/IEC 17025 §7.8 requirement in practice: what the officer read off
 * the instrument is recorded when made, and the derivation is a separate, later record — so
 * a change in how we compute can never look like a change in what was observed.
 */
export function recordWeighingObservations(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  input: RecordObservationsInput,
): { verdict: Verdict; issues: Issue[]; rows: unknown[] } {
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

  const issues = validateObservations(profile, input.observations);

  appendEvent(ctx.db, {
    reportId,
    eventType: "OBSERVATIONS_RECORDED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: {
      formId: input.formId,
      ...(input.rangeIndex !== undefined ? { rangeIndex: input.rangeIndex } : {}),
      observations: input.observations,
      ...(input.zeroError !== undefined ? { zeroError: input.zeroError } : {}),
      ...(input.environment ? { environment: input.environment } : {}),
      issues,
    },
  });

  const result = k1ErrorVsMpe(
    {
      profile,
      observations: input.observations,
      ...(input.zeroError !== undefined ? { zeroError: input.zeroError } : {}),
    },
    ctx.pack,
  );

  appendEvent(ctx.db, {
    reportId,
    eventType: "FORM_RESULT_COMPUTED",
    actorId: principal.userId,
    recordedAt: ctx.now,
    payload: {
      formId: input.formId,
      ...(input.testId ? { testId: input.testId } : {}),
      ...(input.rangeIndex !== undefined ? { rangeIndex: input.rangeIndex } : {}),
      verdict: result.verdict,
      result,
    },
  });

  rebuildProjection(ctx.db, reportId);
  return { verdict: result.verdict, issues, rows: result.rows };
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
    if (format === "pdf" && /executable doesn't exist|browserType\.launch/i.test(message)) {
      throw new ServiceError(
        503,
        "RENDERER_UNAVAILABLE",
        "PDF rendering needs Chromium, which is not installed on this server. " +
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

export function resolveDeficiency(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  deficiencyId: string,
  resolution: string,
): void {
  const report = getReport(ctx, principal, reportId);
  const write = canWriteReport(principal, report, "report:record_observations");
  if (!write.allowed) throw forbidden(write.reason ?? "Cannot modify this report.");

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
