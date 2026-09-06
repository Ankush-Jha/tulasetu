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

import { createHash } from "node:crypto";
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

export function computeEventHash(parts: {
  prevHash: string | null;
  reportId: string;
  version: number;
  eventType: string;
  payload: string;
  actorId: string;
  recordedAt: string;
}): string {
  const h = createHash("sha256");
  // Length-prefixed so that no combination of field contents can be re-split differently
  // (a plain concatenation of "ab" + "c" and "a" + "bc" would hash identically).
  for (const v of [
    parts.prevHash ?? "",
    parts.reportId,
    String(parts.version),
    parts.eventType,
    parts.payload,
    parts.actorId,
    parts.recordedAt,
  ]) {
    h.update(String(v.length));
    h.update(" ");
    h.update(v);
    h.update(" ");
  }
  return h.digest("hex");
}

export class ConcurrencyError extends Error {
  constructor(
    readonly reportId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Report ${reportId} is at version ${actual}, not the expected ${expected}. ` +
        `Reload and re-apply the change — nothing was overwritten.`,
    );
    this.name = "ConcurrencyError";
  }
}

/** Current per-report version (0 when the report has no events yet). */
export function currentVersion(db: Db, reportId: string): number {
  const row = db
    .prepare("SELECT MAX(version) AS v FROM report_events WHERE report_id = ?")
    .get(reportId) as { v: number | null } | undefined;
  return row?.v ?? 0;
}

function lastHash(db: Db, reportId: string): string | null {
  const row = db
    .prepare("SELECT hash FROM report_events WHERE report_id = ? ORDER BY version DESC LIMIT 1")
    .get(reportId) as { hash: string } | undefined;
  return row?.hash ?? null;
}

/** The only write path into the log. Returns the event as stored. */
export function appendEvent(db: Db, input: AppendInput): ReportEvent {
  const tx = db.transaction((): ReportEvent => {
    const current = currentVersion(db, input.reportId);
    if (input.expectedVersion !== undefined && input.expectedVersion !== current) {
      throw new ConcurrencyError(input.reportId, input.expectedVersion, current);
    }
    const version = current + 1;
    const prevHash = lastHash(db, input.reportId);
    const payload = JSON.stringify(input.payload ?? {});
    const hash = computeEventHash({
      prevHash,
      reportId: input.reportId,
      version,
      eventType: input.eventType,
      payload,
      actorId: input.actorId,
      recordedAt: input.recordedAt,
    });

    const info = db
      .prepare(
        `INSERT INTO report_events
           (report_id, version, event_type, payload, actor_id, recorded_at, prev_hash, hash, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.reportId,
        version,
        input.eventType,
        payload,
        input.actorId,
        input.recordedAt,
        prevHash,
        hash,
        input.signature ?? null,
      );

    return {
      seq: Number(info.lastInsertRowid),
      report_id: input.reportId,
      version,
      event_type: input.eventType,
      payload,
      actor_id: input.actorId,
      recorded_at: input.recordedAt,
      prev_hash: prevHash,
      hash,
      signature: input.signature ?? null,
    };
  });
  return tx();
}

export function readEvents(db: Db, reportId: string): ReportEvent[] {
  return db
    .prepare("SELECT * FROM report_events WHERE report_id = ? ORDER BY version ASC")
    .all(reportId) as ReportEvent[];
}

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
export function verifyChain(db: Db, reportId: string): ChainVerification {
  const events = readEvents(db, reportId);
  let prevHash: string | null = null;
  let expectedVersion = 1;

  for (const e of events) {
    if (e.version !== expectedVersion) {
      return {
        ok: false,
        eventCount: events.length,
        brokenAtSeq: e.seq,
        reason: `Version gap: expected ${expectedVersion}, found ${e.version}. An event is missing.`,
      };
    }
    if (e.prev_hash !== prevHash) {
      return {
        ok: false,
        eventCount: events.length,
        brokenAtSeq: e.seq,
        reason:
          `Chain break at version ${e.version}: the stored prev_hash does not match the ` +
          `previous event's hash.`,
      };
    }
    const recomputed = computeEventHash({
      prevHash,
      reportId: e.report_id,
      version: e.version,
      eventType: e.event_type,
      payload: e.payload,
      actorId: e.actor_id,
      recordedAt: e.recorded_at,
    });
    if (recomputed !== e.hash) {
      return {
        ok: false,
        eventCount: events.length,
        brokenAtSeq: e.seq,
        reason:
          `Content at version ${e.version} does not match its recorded hash — the row was ` +
          `altered outside the append path.`,
      };
    }
    prevHash = e.hash;
    expectedVersion += 1;
  }

  return { ok: true, eventCount: events.length };
}
