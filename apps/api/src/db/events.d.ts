/**
 * The append-only, hash-chained event log.
 *
 * CLAUDE.md design rule #4 and ISO/IEC 17025 §7.8: original observations are recorded when
 * made; an amendment is a new record carrying date and person, and the original survives.
 * So nothing here updates or deletes — `appendEvent` is the only write path, and the schema's
 * triggers make that structural rather than a matter of discipline.
 *
 * Each event carries `hash = sha256(prev_hash || report_id || version || type || payload ||
 * actor || recorded_at)`. That makes tampering detectable rather than merely forbidden: if a
 * row is edited by someone with raw file access, `verifyChain` finds the break and names the
 * first bad sequence number.
 */
import type { Db } from "./open.js";
export interface ReportEvent {
    seq: number;
    report_id: string;
    version: number;
    event_type: string;
    payload: string;
    actor_id: string;
    recorded_at: string;
    prev_hash: string | null;
    hash: string;
    signature: string | null;
}
export interface AppendInput {
    reportId: string;
    eventType: string;
    payload: unknown;
    actorId: string;
    /** ISO 8601. Injected rather than read from the clock so the log is reproducible in tests. */
    recordedAt: string;
    /** Detached signature over the computed hash, if the officer's key signed it (FR16). */
    signature?: string;
    /**
     * Optimistic concurrency. When given, the append fails unless the report is currently at
     * this version — two officers editing the same report cannot silently overwrite each other.
     */
    expectedVersion?: number;
}
export declare function computeEventHash(parts: {
    prevHash: string | null;
    reportId: string;
    version: number;
    eventType: string;
    payload: string;
    actorId: string;
    recordedAt: string;
}): string;
export declare class ConcurrencyError extends Error {
    readonly reportId: string;
    readonly expected: number;
    readonly actual: number;
    constructor(reportId: string, expected: number, actual: number);
}
/** Current per-report version (0 when the report has no events yet). */
export declare function currentVersion(db: Db, reportId: string): number;
/** The only write path into the log. Returns the event as stored. */
export declare function appendEvent(db: Db, input: AppendInput): ReportEvent;
export declare function readEvents(db: Db, reportId: string): ReportEvent[];
export interface ChainVerification {
    ok: boolean;
    eventCount: number;
    /** Populated when ok === false. */
    brokenAtSeq?: number;
    reason?: string;
}
/**
 * Recompute the chain and confirm every link. This is the answer to "how do we know the
 * report was not edited after the Director signed it" — and it runs in milliseconds, so the
 * repository can verify on every read rather than only on demand.
 */
export declare function verifyChain(db: Db, reportId: string): ChainVerification;
