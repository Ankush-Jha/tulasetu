/**
 * The report event vocabulary, and the reducer that projects it into queryable tables.
 *
 * The log is the truth; `reports` and `report_forms` are a cache of it. That inversion is what
 * makes ISO/IEC 17025 §7.8 cheap to satisfy: an amendment is a new event, the original event
 * is still there, and "who changed this and when" is answered by reading rows rather than by
 * maintaining a parallel audit table that can drift from the data it describes.
 *
 * A practical consequence worth stating: because projections are derived, `rebuildProjection`
 * can drop and replay them at any time. If the reducer has a bug, fixing the reducer fixes
 * history — no migration, no lost observations.
 */

export const EVENT_TYPES = [
  "REPORT_CREATED",
  "PROFILE_UPDATED",
  "RULEPACK_PINNED",
  "APPLICABILITY_RESOLVED",
  "OBSERVATIONS_RECORDED",
  "FORM_RESULT_COMPUTED",
  "ENVIRONMENT_RECORDED",
  "ATTACHMENT_ADDED",
  "DEFICIENCY_RAISED",
  "DEFICIENCY_RESOLVED",
  "NOTE_ADDED",
  // Lifecycle transitions (see lifecycle.ts for who may emit which).
  "OBSERVATIONS_COMPLETED",
  "VALIDATED",
  "REOPENED",
  "SUBMITTED_FOR_REVIEW",
  "RETURNED_TO_LAB",
  "RECOMMENDED_TO_DIRECTOR",
  "REMITTED_FOR_FURTHER_TESTS",
  "REOPENED_AFTER_REMIT",
  "PROVISIONAL_CERTIFICATE_ISSUED",
  "REPORT_LOCKED",
  "CERTIFICATE_ISSUED",
  "PUBLISHED",
  "APPROVAL_REVOKED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

import type { Db } from "../db/open.js";
import { readEvents } from "../db/events.js";
import { TRANSITIONS, type ReportState } from "./lifecycle.js";

/** state-changing event -> resulting state, derived from the transition table. */
const STATE_AFTER: Record<string, ReportState> = Object.fromEntries(
  TRANSITIONS.map((t) => [t.event, t.to]),
);

export interface ReportProjection {
  id: string;
  lab_id: string;
  status: ReportState;
  ruleset_id: string;
  ruleset_version: string | null;
  profile: string;
  application_no: string | null;
  manufacturer: string | null;
  model: string | null;
  accuracy_class: string | null;
  max_capacity_g: number | null;
  instrument_json: string | null;
  overall_verdict: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  fee_paid_inr: number | null;
  locked_hash: string | null;
  version: number;
}

/**
 * Replay one report's events into the projection tables.
 *
 * Deletes and rewrites only the projection rows for this report — never the log.
 */
export function rebuildProjection(db: Db, reportId: string): ReportProjection | null {
  const events = readEvents(db, reportId);
  if (events.length === 0) return null;

  const first = events[0]!;
  const state: ReportProjection = {
    id: reportId,
    lab_id: "",
    status: "DRAFT",
    ruleset_id: "",
    ruleset_version: null,
    profile: "OIML_R76",
    application_no: null,
    manufacturer: null,
    model: null,
    accuracy_class: null,
    max_capacity_g: null,
    instrument_json: null,
    overall_verdict: null,
    created_by: first.actor_id,
    created_at: first.recorded_at,
    updated_at: first.recorded_at,
    submitted_at: null,
    completed_at: null,
    fee_paid_inr: null,
    locked_hash: null,
    version: 0,
  };

  type FormRow = {
    form_id: string;
    test_id: string;
    range_index: number | null;
    applicable: number;
    verdict: string | null;
    na_reason: string | null;
    result_json: string | null;
    updated_at: string;
  };
  const forms = new Map<string, FormRow>();
  const formKey = (formId: string, rangeIndex: number | null) => `${formId}#${rangeIndex ?? 0}`;

  for (const e of events) {
    const p = JSON.parse(e.payload) as Record<string, any>;
    state.version = e.version;
    state.updated_at = e.recorded_at;

    switch (e.event_type) {
      case "REPORT_CREATED":
        state.lab_id = p["labId"] ?? state.lab_id;
        state.ruleset_id = p["rulesetId"] ?? state.ruleset_id;
        state.ruleset_version = p["rulesetVersion"] ?? state.ruleset_version;
        state.profile = p["profile"] ?? state.profile;
        state.application_no = p["applicationNo"] ?? state.application_no;
        state.fee_paid_inr = p["feePaidInr"] ?? state.fee_paid_inr;
        break;

      case "RULEPACK_PINNED":
        state.ruleset_id = p["rulesetId"] ?? state.ruleset_id;
        state.ruleset_version = p["rulesetVersion"] ?? state.ruleset_version;
        break;

      case "PROFILE_UPDATED": {
        const prof = p["profile"] ?? {};
        state.instrument_json = JSON.stringify(prof);
        state.manufacturer = prof.manufacturer ?? state.manufacturer;
        state.model = prof.model ?? state.model;
        state.accuracy_class = prof.accuracyClass ?? state.accuracy_class;
        state.max_capacity_g = p["maxCapacityG"] ?? state.max_capacity_g;
        break;
      }

      case "APPLICABILITY_RESOLVED": {
        // Replaces the form set wholesale: re-resolving after a profile change must not
        // leave stale forms behind for an instrument that no longer needs them.
        forms.clear();
        for (const t of (p["tests"] ?? []) as any[]) {
          const ri = t.rangeIndex ?? null;
          forms.set(formKey(t.formId, ri), {
            form_id: t.formId,
            test_id: t.testId,
            range_index: ri,
            applicable: t.applicable ? 1 : 0,
            verdict: t.applicable ? null : "NA",
            na_reason: t.applicable ? null : (t.reason ?? null),
            result_json: null,
            updated_at: e.recorded_at,
          });
        }
        break;
      }

      case "FORM_RESULT_COMPUTED": {
        const ri = p["rangeIndex"] ?? null;
        const key = formKey(p["formId"], ri);
        const existing = forms.get(key);
        forms.set(key, {
          form_id: p["formId"],
          test_id: p["testId"] ?? existing?.test_id ?? p["formId"],
          range_index: ri,
          applicable: 1,
          verdict: p["verdict"] ?? null,
          na_reason: null,
          result_json: JSON.stringify(p["result"] ?? null),
          updated_at: e.recorded_at,
        });
        break;
      }

      case "SUBMITTED_FOR_REVIEW":
        state.submitted_at = e.recorded_at;
        break;

      case "REPORT_LOCKED":
        state.locked_hash = p["pdfSha256"] ?? state.locked_hash;
        state.completed_at = e.recorded_at;
        break;
    }

    const next = STATE_AFTER[e.event_type];
    if (next) state.status = next;
  }

  // Overall verdict: FAILED if any applicable form failed; PASSED once every applicable form
  // has a verdict and none failed; otherwise still in progress (null).
  const applicable = [...forms.values()].filter((f) => f.applicable === 1);
  if (applicable.some((f) => f.verdict === "FAILED")) state.overall_verdict = "FAILED";
  else if (applicable.length > 0 && applicable.every((f) => f.verdict === "PASSED"))
    state.overall_verdict = "PASSED";
  else state.overall_verdict = null;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO reports (id, lab_id, status, ruleset_id, ruleset_version, profile,
          application_no, manufacturer, model, accuracy_class, max_capacity_g, instrument_json,
          overall_verdict, created_by, created_at, updated_at, submitted_at, completed_at,
          fee_paid_inr, locked_hash, version)
       VALUES (@id, @lab_id, @status, @ruleset_id, @ruleset_version, @profile,
          @application_no, @manufacturer, @model, @accuracy_class, @max_capacity_g,
          @instrument_json, @overall_verdict, @created_by, @created_at, @updated_at,
          @submitted_at, @completed_at, @fee_paid_inr, @locked_hash, @version)
       ON CONFLICT(id) DO UPDATE SET
          lab_id=excluded.lab_id, status=excluded.status, ruleset_id=excluded.ruleset_id,
          ruleset_version=excluded.ruleset_version, profile=excluded.profile,
          application_no=excluded.application_no, manufacturer=excluded.manufacturer,
          model=excluded.model, accuracy_class=excluded.accuracy_class,
          max_capacity_g=excluded.max_capacity_g, instrument_json=excluded.instrument_json,
          overall_verdict=excluded.overall_verdict, updated_at=excluded.updated_at,
          submitted_at=excluded.submitted_at, completed_at=excluded.completed_at,
          fee_paid_inr=excluded.fee_paid_inr, locked_hash=excluded.locked_hash,
          version=excluded.version`,
    ).run(state as unknown as Record<string, unknown>);

    db.prepare("DELETE FROM report_forms WHERE report_id = ?").run(reportId);
    const ins = db.prepare(
      `INSERT INTO report_forms
         (report_id, form_id, test_id, range_index, applicable, verdict, na_reason, result_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const f of forms.values()) {
      ins.run(
        reportId,
        f.form_id,
        f.test_id,
        f.range_index ?? 0,
        f.applicable,
        f.verdict,
        f.na_reason,
        f.result_json,
        f.updated_at,
      );
    }
  });
  tx();

  return state;
}

/** Replay every report. Used after a reducer change, and by the integrity self-check. */
export function rebuildAllProjections(db: Db): number {
  const ids = db
    .prepare("SELECT DISTINCT report_id AS id FROM report_events")
    .all() as { id: string }[];
  const tx = db.transaction(() => {
    for (const { id } of ids) rebuildProjection(db, id);
  });
  tx();
  return ids.length;
}
