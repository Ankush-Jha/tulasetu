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

export const REPORT_STATES = [
  "DRAFT",
  "OBSERVATIONS_COMPLETE",
  "VALIDATED",
  "SUBMITTED",
  "DEFICIENCY",
  "RECOMMENDED",
  "REMITTED",
  "PROVISIONAL",
  "LOCKED",
  "CERTIFICATE_ISSUED",
  "PUBLISHED",
  "WITHDRAWN",
] as const;

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
  | "all_applicable_forms_complete"
  /** The engine's validation layer returned no `error`-severity issues. */
  | "no_blocking_validation_issues"
  /** Every deficiency raised on this report has been resolved. */
  | "all_deficiencies_resolved"
  /** A rendered, hashed PDF exists. */
  | "final_pdf_rendered";

export const TRANSITIONS: Transition[] = [
  {
    from: "DRAFT",
    to: "OBSERVATIONS_COMPLETE",
    event: "OBSERVATIONS_COMPLETED",
    roles: ["MA", "AD", "DD", "ADMIN"],
    label: "Mark observations complete",
    basis: "AoM Rule 4(3)(d): the laboratory shall maintain an adequate recording system.",
    requires: ["all_applicable_forms_complete"],
  },
  {
    from: "OBSERVATIONS_COMPLETE",
    to: "VALIDATED",
    event: "VALIDATED",
    roles: ["MA", "AD", "DD", "ADMIN"],
    label: "Run validation",
    basis: "FR6: input validation and engine verdicts must both be clean before review.",
    requires: ["no_blocking_validation_issues"],
  },
  // A failed validation run sends the report back rather than blocking in place, so the
  // reason is recorded as an event instead of living only in a UI toast.
  {
    from: "VALIDATED",
    to: "DRAFT",
    event: "REOPENED",
    roles: ["MA", "AD", "DD", "ADMIN"],
    label: "Reopen for correction",
    basis: "ISO/IEC 17025 7.8: amendments are tracked, the original observation is retained.",
  },
  {
    from: "VALIDATED",
    to: "SUBMITTED",
    event: "SUBMITTED_FOR_REVIEW",
    roles: ["MA", "AD", "DD", "ADMIN"],
    label: "Submit to AD/DD",
    basis: "AoM Rule 8: the report flows from the laboratory upward for verification.",
  },
  {
    from: "SUBMITTED",
    to: "DEFICIENCY",
    event: "DEFICIENCY_RAISED",
    roles: ["AD", "DD", "DIRECTOR", "ADMIN"],
    label: "Record deficiency",
    basis: "AoM Rule 8: the reviewing officer records deficiencies and returns the report.",
  },
  {
    from: "DEFICIENCY",
    to: "DRAFT",
    event: "RETURNED_TO_LAB",
    roles: ["AD", "DD", "DIRECTOR", "ADMIN"],
    label: "Return to Metrological Assistant",
    basis: "AoM Rule 8: deficiency loop back to the recording officer.",
  },
  {
    from: "SUBMITTED",
    to: "RECOMMENDED",
    event: "RECOMMENDED_TO_DIRECTOR",
    roles: ["AD", "DD", "ADMIN"],
    label: "Recommend to Director",
    basis: "AoM Rule 8: AD/DD verification precedes the Director's decision.",
    requires: ["all_deficiencies_resolved"],
  },
  // R.8 explicitly lets the Director remit the report back for further tests. Without this
  // edge the model would be a one-way pipeline and would misstate the rule.
  {
    from: "RECOMMENDED",
    to: "REMITTED",
    event: "REMITTED_FOR_FURTHER_TESTS",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Remit back for further tests",
    basis: "AoM Rule 8: the Director may remit the report back to the laboratory.",
  },
  {
    from: "REMITTED",
    to: "DRAFT",
    event: "REOPENED_AFTER_REMIT",
    roles: ["MA", "AD", "DD", "ADMIN"],
    label: "Reopen for further tests",
    basis: "AoM Rule 8.",
  },
  // The provisional branch: testing running past three months does not stall the applicant.
  {
    from: "RECOMMENDED",
    to: "PROVISIONAL",
    event: "PROVISIONAL_CERTIFICATE_ISSUED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Issue provisional certificate",
    basis: "AoM Rule 6(8): provisional certificate where testing exceeds three months; " +
      "Rule 8(7): valid for not more than one year.",
  },
  {
    from: "PROVISIONAL",
    to: "LOCKED",
    event: "REPORT_LOCKED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Lock final report",
    basis: "FR15/FR16: the locked PDF is the record copy; its hash enters the audit trail.",
    requires: ["final_pdf_rendered"],
  },
  {
    from: "RECOMMENDED",
    to: "LOCKED",
    event: "REPORT_LOCKED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Lock final report",
    basis: "FR15/FR16: the locked PDF is the record copy; its hash enters the audit trail.",
    requires: ["final_pdf_rendered"],
  },
  {
    from: "LOCKED",
    to: "CERTIFICATE_ISSUED",
    event: "CERTIFICATE_ISSUED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Issue certificate of approval",
    basis: "AoM Rule 11: contents of the certificate; Rule 12: approval mark IND/lab/year/model.",
  },
  {
    from: "CERTIFICATE_ISSUED",
    to: "PUBLISHED",
    event: "PUBLISHED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Publish certificate",
    basis: "AoM Rule 11(4) (2019 amendment): certificates are published on the website. " +
      "Note Rule 16(2) — the underlying report and drawings are not.",
  },
  // Revocation reaches back from the far end of the lifecycle: Rule 13(1)(e) allows it where
  // the design or circuit has been altered, which can surface long after publication.
  {
    from: "PUBLISHED",
    to: "WITHDRAWN",
    event: "APPROVAL_REVOKED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Revoke approval",
    basis: "AoM Rule 13(1)(e): revocation where the design or circuit has been altered.",
  },
  {
    from: "CERTIFICATE_ISSUED",
    to: "WITHDRAWN",
    event: "APPROVAL_REVOKED",
    roles: ["DIRECTOR", "ADMIN"],
    label: "Revoke approval",
    basis: "AoM Rule 13(1)(e).",
  },
];

/** States from which no transition leaves. */
export const TERMINAL_STATES: ReportState[] = ["PUBLISHED", "WITHDRAWN"].filter(
  (s) => !TRANSITIONS.some((t) => t.from === s),
) as ReportState[];

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
export function canTransition(
  from: ReportState,
  to: ReportState,
  role: RoleId,
  satisfiedGuards: Guard[] = [],
): TransitionCheck {
  const candidates = TRANSITIONS.filter((t) => t.from === from && t.to === to);
  if (candidates.length === 0) {
    return {
      allowed: false,
      reason: `A report in ${from} cannot move to ${to}. Permitted next states: ${
        nextStates(from).join(", ") || "none (terminal state)"
      }.`,
    };
  }

  // More than one transition can share a from/to pair; accept if any is permitted for the
  // role, and report against the one that came closest.
  const permitted = candidates.filter((t) => t.roles.includes(role));
  if (permitted.length === 0) {
    const t = candidates[0]!;
    return {
      allowed: false,
      transition: t,
      reason: `Role ${role} cannot ${t.label.toLowerCase()}. Permitted roles: ${t.roles.join(", ")}.`,
    };
  }

  for (const t of permitted) {
    const unmet = (t.requires ?? []).filter((g) => !satisfiedGuards.includes(g));
    if (unmet.length === 0) return { allowed: true, transition: t };
  }

  const t = permitted[0]!;
  const unmet = (t.requires ?? []).filter((g) => !satisfiedGuards.includes(g));
  return {
    allowed: false,
    transition: t,
    unmetGuards: unmet,
    reason: `Cannot ${t.label.toLowerCase()} yet: ${unmet.map(describeGuard).join("; ")}.`,
  };
}

export function nextStates(from: ReportState): ReportState[] {
  return [...new Set(TRANSITIONS.filter((t) => t.from === from).map((t) => t.to))];
}

/** Transitions a given role could take from a state — what the UI renders as buttons. */
export function availableTransitions(from: ReportState, role: RoleId): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from && t.roles.includes(role));
}

export function describeGuard(g: Guard): string {
  switch (g) {
    case "all_applicable_forms_complete":
      return "every applicable test form still needs observations and a verdict";
    case "no_blocking_validation_issues":
      return "validation is still reporting blocking issues";
    case "all_deficiencies_resolved":
      return "there are unresolved deficiencies on this report";
    case "final_pdf_rendered":
      return "the final PDF has not been rendered and hashed yet";
  }
}
