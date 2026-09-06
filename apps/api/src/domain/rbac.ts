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

/**
 * Write access to one report: capability, tenancy, and the fact that a locked report is
 * closed to everyone. Locking is what makes the record copy a record copy — there is no role
 * that can write through it, and correcting a locked report means a new revision, not an edit.
 */
export function canWriteReport(
  principal: Principal,
  report: { lab_id: string; status: string },
  capability: Capability,
): AccessDecision {
  const CLOSED = ["LOCKED", "CERTIFICATE_ISSUED", "PUBLISHED", "WITHDRAWN"];
  if (CLOSED.includes(report.status)) {
    return {
      allowed: false,
      reason:
        `Report is ${report.status} and is no longer editable. The locked report is the ` +
        `record copy (ISO/IEC 17025 7.8); record a new revision instead of amending it.`,
    };
  }
  if (report.lab_id !== principal.labId && !can(principal, "report:read_any_lab")) {
    return { allowed: false, reason: "Report belongs to another laboratory." };
  }
  return can(principal, capability)
    ? { allowed: true }
    : { allowed: false, reason: `Role ${principal.role} lacks capability ${capability}.` };
}
