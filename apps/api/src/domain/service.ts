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
  k1ErrorVsMpe,
  resolveApplicableTests,
  resolveMpe,
  solveFamily,
  validateProfile,
  validateObservations,
  validateSoftwareIdentification,
  type InstrumentProfile,
  type Issue,
  type RulePack,
  type Variant,
  type Verdict,
  type WeighingObservation,
} from "@tulasetu/engine";

import type { Db } from "../db/open.js";
import { appendEvent, verifyChain, readEvents } from "../db/events.js";
import { rebuildProjection, type ReportProjection } from "./events.js";
import { canTransition, type Guard, type ReportState, type RoleId } from "./lifecycle.js";
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

  // Blocking issues are error-severity findings from the most recent profile or observation
  // event. Warnings do not block; an officer may knowingly proceed past one.
  const blocking = readEvents(ctx.db, reportId).some((e) => {
    if (e.event_type !== "PROFILE_UPDATED" && e.event_type !== "OBSERVATIONS_RECORDED") return false;
    const p = JSON.parse(e.payload) as { issues?: Issue[] };
    return (p.issues ?? []).some((i) => i.severity === "error");
  });
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
