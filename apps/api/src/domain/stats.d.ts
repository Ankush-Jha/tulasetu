/**
 * Dashboard statistics, and the Rule 4(9) annual return (FR13).
 *
 * The interesting one is `rule4_9AnnualReturn`. AoM Rule 4(3)/4(9) obliges an approved
 * laboratory to report annually on the models it tested, the fees it realised, and **the time
 * taken per test**. Today that is a data-gathering exercise, because the underlying facts live
 * in spreadsheets scattered across a lab. Once observations are recorded as timestamped events,
 * the same return is a query — the compliance artefact falls out of the data model for free.
 *
 * Time-per-test is measured from the event log rather than from `reports.created_at`, because
 * the log is the only place where "when was this test actually performed" is recorded at the
 * moment it happened, which is exactly what ISO/IEC 17025 §7.8 requires.
 *
 * Every function here is a read. Nothing in this module writes.
 */
import type { Db } from "../db/open.js";
export interface DashboardCounts {
    inProcess: number;
    completed: number;
    withDeficiency: number;
    total: number;
    byStatus: Record<string, number>;
}
export declare function dashboardCounts(db: Db, labId?: string): DashboardCounts;
export interface Rule49Row {
    /** R 76-2 form id, e.g. "1", "12.4". */
    formId: string;
    testId: string;
    /** How many times this test was performed across the period. */
    timesPerformed: number;
    passed: number;
    failed: number;
    /** Median wall-clock minutes from the first to the last observation event for this form. */
    medianMinutes: number | null;
    meanMinutes: number | null;
}
export interface Rule49Return {
    labId: string | null;
    labName: string | null;
    /** Inclusive ISO dates. */
    from: string;
    to: string;
    modelsTested: number;
    modelsApproved: number;
    modelsRejected: number;
    modelsInProgress: number;
    /** Rule 19: Rs 10,000 mechanical / Rs 25,000 digital-electronic (2019 amendment). */
    feesRealisedInr: number;
    /** Days from report creation to certificate issue. */
    medianTurnaroundDays: number | null;
    perTest: Rule49Row[];
    byAccuracyClass: Record<string, number>;
    /**
     * Reports whose testing ran beyond three months. AoM Rule 6(8) makes these the ones
     * eligible for a provisional certificate, so the lab needs them called out, not buried.
     */
    exceededThreeMonths: number;
    generatedAt: string;
    caveats: string[];
}
/**
 * Build the Rule 4(9) annual return for a laboratory over a date range.
 *
 * `from`/`to` are inclusive ISO dates (YYYY-MM-DD). Pass `labId = null` for a national
 * roll-up — which requires the `stats:read_national` capability at the route layer.
 */
export declare function rule4_9AnnualReturn(db: Db, opts: {
    labId: string | null;
    from: string;
    to: string;
    generatedAt: string;
}): Rule49Return;
/** Search and filter over the repository (FR12). */
export interface ReportSearch {
    labId?: string;
    status?: string;
    accuracyClass?: string;
    manufacturer?: string;
    model?: string;
    createdFrom?: string;
    createdTo?: string;
    limit?: number;
    offset?: number;
}
export declare function searchReports(db: Db, q: ReportSearch): unknown[];
