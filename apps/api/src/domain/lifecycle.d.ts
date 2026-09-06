/**
 * The report lifecycle, as a state machine.
 *
 * The states are not invented — they come from the Legal Metrology (Approval of Models)
 * Rules, 2011 and are catalogued in docs/PRD.md §3.3:
 *
 *   Draft -> Observations complete -> Auto-validated -> Submitted to AD/DD
 *     -> (Deficiency -> back to MA)
 *     -> Recommended to Director
 *     -> (Remit back for further tests | Provisional certificate path)
 *     -> Final report locked -> Certificate issued -> Published
 *
 * Two provisions shape this and are easy to miss:
 *
 *  - **R.8**: the report flows lab -> Director -> Central Government, and *the Director may
 *    remit it back*. So `RECOMMENDED` is not terminal; there is an edge from it back to the
 *    lab. A one-way pipeline would model the happy path and misrepresent the law.
 *  - **R.6(8) with R.8(7)**: where testing exceeds three months a *provisional* certificate
 *    may issue, valid for at most one year. That is a genuine parallel branch, not a
 *    substitute for final approval — a provisional report still has to reach `LOCKED`.
 *
 * Encoding this as data rather than as scattered `if` statements means the permitted moves
 * are inspectable, testable, and renderable as the progress bar the UI needs.
 */
export declare const REPORT_STATES: readonly ["DRAFT", "OBSERVATIONS_COMPLETE", "VALIDATED", "SUBMITTED", "DEFICIENCY", "RECOMMENDED", "REMITTED", "PROVISIONAL", "LOCKED", "CERTIFICATE_ISSUED", "PUBLISHED", "WITHDRAWN"];
export type ReportState = (typeof REPORT_STATES)[number];
export type RoleId = "MA" | "AD" | "DD" | "DIRECTOR" | "ADMIN";
export interface Transition {
    from: ReportState;
    to: ReportState;
    /** The event appended to the log when this transition is taken. */
    event: string;
    /** Roles permitted to take it. */
    roles: RoleId[];
    /** What the lab officer sees on the button. */
    label: string;
    /** The provision this transition implements, for the audit trail and the UI tooltip. */
    basis: string;
    /**
     * Machine-checkable preconditions the caller must satisfy. The state machine does not
     * evaluate these itself — it declares them, and `canTransition` takes the answers.
     */
    requires?: Guard[];
}
/** A precondition that something outside the state machine must confirm. */
export type Guard = 
/** Every applicable form has observations and a verdict. */
"all_applicable_forms_complete"
/** The engine's validation layer returned no `error`-severity issues. */
 | "no_blocking_validation_issues"
/** Every deficiency raised on this report has been resolved. */
 | "all_deficiencies_resolved"
/** A rendered, hashed PDF exists. */
 | "final_pdf_rendered";
export declare const TRANSITIONS: Transition[];
/** States from which no transition leaves. */
export declare const TERMINAL_STATES: ReportState[];
export interface TransitionCheck {
    allowed: boolean;
    transition?: Transition;
    /** Why not. Written for an officer to read, not for a log. */
    reason?: string;
    /** Guards this transition declares that the caller reported as unsatisfied. */
    unmetGuards?: Guard[];
}
/**
 * Decide whether `role` may move a report from `from` to `to`.
 *
 * `satisfiedGuards` is supplied by the caller because the guards are questions about report
 * *content* (are all forms complete? is the PDF rendered?) which this module deliberately
 * does not know how to answer — keeping the state machine free of database access makes it
 * a pure, exhaustively testable function.
 */
export declare function canTransition(from: ReportState, to: ReportState, role: RoleId, satisfiedGuards?: Guard[]): TransitionCheck;
export declare function nextStates(from: ReportState): ReportState[];
/** Transitions a given role could take from a state — what the UI renders as buttons. */
export declare function availableTransitions(from: ReportState, role: RoleId): Transition[];
export declare function describeGuard(g: Guard): string;
