/**
 * Role-based access control (FR15).
 *
 * Two things are deliberately separated here:
 *
 *  - **Capabilities** — what a role may do at all (record observations, raise a deficiency,
 *    issue a certificate). Coarse, and checked on every route.
 *  - **Lifecycle transitions** — who may move a report between states. Those live in
 *    `lifecycle.ts`, because the answer depends on the report's current state, not only on
 *    the role.
 *
 * Both are needed. A Director has the authority to lock a report but must not be able to lock
 * one that is still in DRAFT; an MA may record observations but only on a report that is
 * still open. Collapsing the two checks into one would lose one half or the other.
 *
 * Tenancy is enforced alongside capability, not after it. Since the Oct-2025 GATC amendment
 * made RRSLs and NTH labs deemed GATCs, a single deployment can hold several labs' data, and
 * Rule 16(2) says submitted models and drawings are not open to public inspection. So "may
 * this user read this report" is always both a role question and a lab question.
 */

import type { RoleId } from "./lifecycle.js";

export const CAPABILITIES = [
  "report:create",
  "report:read_own_lab",
  "report:read_any_lab",
  "report:record_observations",
  "report:edit_profile",
  "report:submit",
  "report:review",
  "report:raise_deficiency",
  "report:recommend",
  "report:remit",
  "report:lock",
  "report:issue_certificate",
  "report:publish",
  "report:revoke",
  "attachment:upload",
  "attachment:read_confidential",
  "rulepack:load",
  "stats:read_own_lab",
  "stats:read_national",
  "user:manage",
  "audit:verify",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * The grant table. Written out per role rather than derived from the `authority` ordering,
 * because authority is not actually monotonic in practice: a Director approves and publishes
 * but does not record bench observations, and an ADMIN administers the system without having
 * any statutory power to issue a certificate. A ">= authority" check would quietly grant both.
 */
const GRANTS: Record<RoleId, Capability[]> = {
  MA: [
    "report:create",
    "report:read_own_lab",
    "report:record_observations",
    "report:edit_profile",
    "report:submit",
    "attachment:upload",
    "stats:read_own_lab",
    "audit:verify",
  ],
  AD: [
    "report:create",
    "report:read_own_lab",
    "report:record_observations",
    "report:edit_profile",
    "report:submit",
    "report:review",
    "report:raise_deficiency",
    "report:recommend",
    "attachment:upload",
    "attachment:read_confidential",
    "stats:read_own_lab",
    "audit:verify",
  ],
  DD: [
    "report:create",
    "report:read_own_lab",
    "report:record_observations",
    "report:edit_profile",
    "report:submit",
    "report:review",
    "report:raise_deficiency",
    "report:recommend",
    "attachment:upload",
    "attachment:read_confidential",
    "stats:read_own_lab",
    "audit:verify",
  ],
  DIRECTOR: [
    "report:read_own_lab",
    "report:read_any_lab",
    "report:review",
    "report:raise_deficiency",
    "report:remit",
    "report:lock",
    "report:issue_certificate",
    "report:publish",
    "report:revoke",
    "attachment:read_confidential",
    "stats:read_own_lab",
    "stats:read_national",
    "audit:verify",
  ],
  // Deliberately holds no statutory power: ADMIN runs the installation, and cannot
  // issue, publish or revoke an approval. Separating the system administrator from the
  // approving authority is the whole point of having roles at all.
  ADMIN: [
    "report:read_own_lab",
    "report:read_any_lab",
    "attachment:read_confidential",
    "rulepack:load",
    "stats:read_own_lab",
    "stats:read_national",
    "user:manage",
    "audit:verify",
  ],
};

export interface Principal {
  userId: string;
  labId: string;
  role: RoleId;
}

export function can(principal: Principal, capability: Capability): boolean {
  return GRANTS[principal.role].includes(capability);
}

export function capabilitiesOf(role: RoleId): Capability[] {
  return [...GRANTS[role]];
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Read access to one report: capability *and* tenancy.
 *
 * Rule 16(2) — submitted models and drawings are not open to public inspection — is why a
 * cross-lab read needs its own capability rather than falling out of seniority.
 */
export function canReadReport(
  principal: Principal,
  report: { lab_id: string },
): AccessDecision {
  if (report.lab_id === principal.labId) {
    return can(principal, "report:read_own_lab")
      ? { allowed: true }
      : { allowed: false, reason: `Role ${principal.role} cannot read reports.` };
  }
  return can(principal, "report:read_any_lab")
    ? { allowed: true }
    : {
        allowed: false,
        reason:
          `This report belongs to another laboratory. Cross-laboratory access is limited ` +
          `to the Director and system administrators (AoM Rule 16(2): submitted models and ` +
          `drawings are not open to public inspection).`,
      };
}

const RECORD_COPY_REASON =
  `is no longer editable. The locked report is the record copy (ISO/IEC 17025 7.8); ` +
  `record a new revision instead of amending it.`;

/**
 * States from which a report is closed to report-data writes (profile, observations,
 * checklist answers, attachment upload) for EVERY role — including the role that would
 * otherwise hold the capability.
 *
 * The rule (confirmed product decision, not a code default): submitting a report starts the
 * review chain, and from SUBMITTED onward a correction happens only by moving the report back
 * down the chain — DEFICIENCY -> DRAFT ("Return to Metrological Assistant"), REMITTED -> DRAFT
 * ("Reopen for further tests") — never by editing report data in place while it is under
 * review. That is what makes the two signatures on a RECOMMENDED report, and the AD/DD's
 * review of a SUBMITTED one, mean anything: without this, an editable Instrument tab on an
 * already-twice-signed report (AD-02) or a POST to /observations on a RECOMMENDED report that
 * quietly flips PASSED to FAILED (MA-02) both defeat the review they claim to record.
 *
 * `lifecycle.ts`'s own transitions (raising/resolving a deficiency, signing, moving state) are
 * NOT gated here — those go through their own capability checks in `service.ts`, because they
 * are how a report under review is corrected or moved, not report data being edited in place.
 *
 * Every state name is written out, rather than derived as "REPORT_STATES minus the writable
 * ones", so that adding a new state to the lifecycle forces a deliberate decision about
 * whether it is frozen — a missing entry here fails open (writable), which a review of this
 * list will catch, rather than failing closed silently.
 */
const FROZEN_REPORT_REASONS: Record<string, string> = {
  SUBMITTED:
    "Submitted to the AD/DD — read-only. To correct it, the reviewer returns it to the lab " +
    "(Record deficiency), or the lab reopens it before submitting again.",
  DEFICIENCY:
    "A deficiency has been raised and the report is waiting to be returned to the lab — " +
    "read-only until then (AoM Rule 8).",
  RECOMMENDED:
    "Recommended to the Director — read-only. If a correction is needed, the Director remits " +
    "it back to the lab for further tests (AoM Rule 8).",
  REMITTED: "Remitted by the Director for further tests — read-only until the lab reopens it.",
  PROVISIONAL:
    "A provisional certificate has been issued on this report (AoM Rule 6(8)) — read-only " +
    "until it is reopened.",
  LOCKED: `Report is LOCKED and ${RECORD_COPY_REASON}`,
  CERTIFICATE_ISSUED: `Report is CERTIFICATE_ISSUED and ${RECORD_COPY_REASON}`,
  PUBLISHED: `Report is PUBLISHED and ${RECORD_COPY_REASON}`,
  WITHDRAWN: `Report is WITHDRAWN and ${RECORD_COPY_REASON}`,
};

/** A plain-English reason a role cannot write report data, in place of naming the capability. */
function roleCannotWriteReportDataReason(principal: Principal, capability: Capability): string {
  if (capability === "report:edit_profile" || capability === "report:record_observations") {
    return (
      `${principal.role} does not record or edit report data — that is done by the lab's ` +
      `Metrological Assistant and its reviewing officers (MA/AD/DD).`
    );
  }
  return `Role ${principal.role} lacks capability ${capability}.`;
}

/**
 * Write access to one report: whether the report's own state is closed to writes (see
 * `FROZEN_REPORT_REASONS`), tenancy, and the role's capability. Every write route — profile,
 * observations, checklist answers, attachment upload — calls this one function, so there is a
 * single place the freeze point is enforced rather than one CLOSED list per route.
 */
export function canWriteReport(
  principal: Principal,
  report: { lab_id: string; status: string },
  capability: Capability,
): AccessDecision {
  const frozenReason = FROZEN_REPORT_REASONS[report.status];
  if (frozenReason) {
    return { allowed: false, reason: frozenReason };
  }
  if (report.lab_id !== principal.labId && !can(principal, "report:read_any_lab")) {
    return { allowed: false, reason: "Report belongs to another laboratory." };
  }
  return can(principal, capability)
    ? { allowed: true }
    : { allowed: false, reason: roleCannotWriteReportDataReason(principal, capability) };
}
