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
export declare const EVENT_TYPES: readonly ["REPORT_CREATED", "PROFILE_UPDATED", "RULEPACK_PINNED", "APPLICABILITY_RESOLVED", "OBSERVATIONS_RECORDED", "FORM_RESULT_COMPUTED", "ENVIRONMENT_RECORDED", "ATTACHMENT_ADDED", "DEFICIENCY_RAISED", "DEFICIENCY_RESOLVED", "NOTE_ADDED", "OBSERVATIONS_COMPLETED", "VALIDATED", "REOPENED", "SUBMITTED_FOR_REVIEW", "RETURNED_TO_LAB", "RECOMMENDED_TO_DIRECTOR", "REMITTED_FOR_FURTHER_TESTS", "REOPENED_AFTER_REMIT", "PROVISIONAL_CERTIFICATE_ISSUED", "REPORT_LOCKED", "CERTIFICATE_ISSUED", "PUBLISHED", "APPROVAL_REVOKED"];
export type EventType = (typeof EVENT_TYPES)[number];
import type { Db } from "../db/open.js";
import { type ReportState } from "./lifecycle.js";
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
export declare function rebuildProjection(db: Db, reportId: string): ReportProjection | null;
/** Replay every report. Used after a reducer change, and by the integrity self-check. */
export declare function rebuildAllProjections(db: Db): number;
