/**
 * Making the serverless database survive a cold start, via Supabase Storage.
 *
 * ## What problem this solves, and which it does not
 *
 * On Vercel the API runs in a function whose filesystem is ephemeral and not shared between
 * instances, so the database lived in memory and vanished whenever the instance recycled. A
 * judge who seeded the demonstration set, went for coffee and came back found an empty
 * repository. That is what this fixes.
 *
 * It fixes it by treating the whole SQLite file as one object: on cold start the bytes are
 * fetched from a Supabase Storage bucket and opened in memory; after a request that wrote
 * anything, the file is serialised and uploaded again. `better-sqlite3` supports both halves
 * directly (`db.serialize()`, `new Database(buffer)`), so not one of the sixty-four query sites
 * in this codebase changes.
 *
 * **This is a demonstration convenience, not the compliance story.** Two things it is not:
 *
 * - **It is not safe against concurrent writers.** Two function instances that both write will
 *   each upload their own whole file and the later upload wins, losing the other's events.
 *   A single officer clicking through a demonstration never hits this; a laboratory would.
 * - **It is not what a laboratory should run.** CLAUDE.md §4 is explicit that a bench install
 *   is a desktop application against a real SQLite file on a real disk, and that is still the
 *   deployment this application is designed for. The durable, hash-chained append-only log
 *   (ISO/IEC 17025 §7.8) wants a filesystem, or a real Postgres reached through an async data
 *   layer — which is a genuine migration, not a swap, because every service function here is
 *   synchronous by design.
 *
 * The honest summary: this makes the hosted demonstration keep its data between visits. It does
 * not turn a serverless function into a system of record, and nothing here should be read as
 * claiming it does.
 *
 * ## Configuration
 *
 * Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; optionally `SUPABASE_DB_BUCKET`
 * (default `taraazu`) and `SUPABASE_DB_OBJECT` (default `taraazu.db`). With none of them set,
 * every function here is a no-op and the server behaves exactly as it did before — which is why
 * a bench install and the test suite need to know nothing about any of this.
 */

import type { Db } from "./open.js";

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  bucket: string;
  object: string;
}

/** Read the configuration from the environment, or `null` if it is not configured. */
export function supabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const url = env["SUPABASE_URL"]?.replace(/\/+$/, "");
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return null;
  return {
    url,
    serviceKey,
    bucket: env["SUPABASE_DB_BUCKET"] ?? "taraazu",
    object: env["SUPABASE_DB_OBJECT"] ?? "taraazu.db",
  };
}

function objectUrl(config: SupabaseConfig): string {
  return `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(config.object)}`;
}

function headers(config: SupabaseConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.serviceKey}`,
    apikey: config.serviceKey,
  };
}

/**
 * Fetch the stored database, or `null` if there is none yet.
 *
 * A missing *object* is the ordinary first-run case, not an error: the caller starts from an
 * empty schema and the first write creates the object. A missing *bucket*, or a key the
 * project rejects, is not — it means nothing will ever be stored, and the caller needs to
 * know that rather than start empty on every cold start and call it a first run forever.
 *
 * Telling them apart takes reading the body. Supabase answers all three with a 400 whose JSON
 * carries the real distinction in `code`: `NoSuchKey` for a missing object, `NoSuchBucket` for
 * a missing bucket, `AccessDenied` for a key it will not accept. This function previously
 * treated every 400 and 404 as the first-run case, which meant a project with no bucket at all
 * reported itself healthy and durable while silently persisting nothing.
 */
const FIRST_RUN_CODES = new Set(["NoSuchKey", "NotFound", "not_found"]);

export async function loadSnapshot(
  config: SupabaseConfig,
): Promise<{ bytes: Buffer | null; error?: string }> {
  try {
    const res = await fetch(objectUrl(config), { headers: headers(config) });
    if (res.status === 404 || res.status === 400 || res.status === 403) {
      const detail = (await res.text().catch(() => "")) || "";
      let code = "";
      try {
        code = String((JSON.parse(detail) as { code?: unknown }).code ?? "");
      } catch {
        // Not JSON. Fall through to treating it as a real failure: an unreadable answer from
        // storage is not evidence that this is a first run.
      }
      if (res.status === 404 || FIRST_RUN_CODES.has(code)) return { bytes: null };
      return {
        bytes: null,
        error: `Supabase returned ${res.status}${code ? ` ${code}` : ""}${detail ? `: ${detail}` : ""}`,
      };
    }
    if (!res.ok) {
      return { bytes: null, error: `Supabase returned ${res.status} ${res.statusText}` };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    // A zero-length object is a half-finished upload, not a database. Treating it as one would
    // hand better-sqlite3 something it cannot open and take the whole server down on boot.
    if (bytes.length === 0) return { bytes: null };
    return { bytes };
  } catch (err) {
    return { bytes: null, error: (err as Error).message };
  }
}

/** Upload the current database, replacing whatever is stored. */
export async function saveSnapshot(
  config: SupabaseConfig,
  db: Db,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const bytes = db.serialize();
    const res = await fetch(objectUrl(config), {
      method: "POST",
      headers: {
        ...headers(config),
        "Content-Type": "application/octet-stream",
        // Without this the first POST creates the object and every later one 409s.
        "x-upsert": "true",
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) {
      return { ok: false, error: `Supabase returned ${res.status} ${await res.text().catch(() => "")}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Coalesce saves, so a burst of writes produces one upload rather than one per request.
 *
 * Seeding the demonstration set alone is several hundred writes; uploading the whole file after
 * each would be both slow and pointless, since only the last upload's contents survive anyway.
 * A save requested while one is in flight sets a flag and runs once the current one finishes,
 * which guarantees the final state always reaches storage.
 */
export class SnapshotWriter {
  private running = false;
  private queued = false;
  private lastError: string | null = null;

  constructor(
    private readonly config: SupabaseConfig,
    private readonly db: Db,
    /** Minimum gap between uploads. Long enough to batch a seed, short enough to feel live. */
    private readonly quietMs = 1500,
  ) {}

  /** Ask for the current state to reach storage. Returns immediately. */
  request(): void {
    if (this.running) {
      this.queued = true;
      return;
    }
    void this.run();
  }

  /** Flush now and wait — used when the caller must know the write landed. */
  async flush(): Promise<{ ok: boolean; error?: string }> {
    while (this.running) await new Promise((r) => setTimeout(r, 50));
    return saveSnapshot(this.config, this.db);
  }

  private async run(): Promise<void> {
    this.running = true;
    try {
      // A short pause first, so the writes of one request — or of one seed — land together.
      await new Promise((r) => setTimeout(r, this.quietMs));
      const result = await saveSnapshot(this.config, this.db);
      this.lastError = result.ok ? null : (result.error ?? "unknown error");
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        void this.run();
      }
    }
  }

  /** What went wrong last time, for the health endpoint to report rather than swallow. */
  get error(): string | null {
    return this.lastError;
  }
}
