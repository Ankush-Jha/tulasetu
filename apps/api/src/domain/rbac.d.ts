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
export declare const CAPABILITIES: readonly ["report:create", "report:read_own_lab", "report:read_any_lab", "report:record_observations", "report:edit_profile", "report:submit", "report:review", "report:raise_deficiency", "report:recommend", "report:remit", "report:lock", "report:issue_certificate", "report:publish", "report:revoke", "attachment:upload", "attachment:read_confidential", "rulepack:load", "stats:read_own_lab", "stats:read_national", "user:manage", "audit:verify"];
export type Capability = (typeof CAPABILITIES)[number];
export interface Principal {
    userId: string;
    labId: string;
    role: RoleId;
}
export declare function can(principal: Principal, capability: Capability): boolean;
export declare function capabilitiesOf(role: RoleId): Capability[];
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
export declare function canReadReport(principal: Principal, report: {
    lab_id: string;
}): AccessDecision;
/**
 * Write access to one report: capability, tenancy, and the fact that a locked report is
 * closed to everyone. Locking is what makes the record copy a record copy — there is no role
 * that can write through it, and correcting a locked report means a new revision, not an edit.
 */
export declare function canWriteReport(principal: Principal, report: {
    lab_id: string;
    status: string;
}, capability: Capability): AccessDecision;
