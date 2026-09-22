/**
 * Snapshot persistence, against a stubbed Supabase.
 *
 * The property that matters is not that bytes move — it is that a *restored* database is the
 * same record as the one that was saved. Taraazu's whole compliance argument rests on a
 * hash-chained append-only log, so a round trip that lost or reordered a single event would
 * break the chain, and a restore that quietly replayed the log into a fresh database would be a
 * different record wearing the same reports. So these check the chain verifies after a restore,
 * not merely that the reports came back.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RulePack } from "@taraazu/engine";

import { openMemoryDb, type Db } from "../src/db/open.js";
import { registerRoutes } from "../src/routes.js";
import { verifyChain } from "../src/db/events.js";
import {
  SnapshotWriter,
  loadSnapshot,
  saveSnapshot,
  supabaseConfig,
} from "../src/db/persistence.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(HERE, "../../../packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;

const T = "2026-09-08T10:00:00.000Z";
const config = {
  url: "https://example.supabase.co",
  serviceKey: "service-key",
  bucket: "taraazu",
  object: "taraazu.db",
};

/** One in-memory Supabase Storage bucket, and a record of what was asked of it. */
function stubStorage() {
  let stored: Buffer | null = null;
  const calls: { method: string; url: string }[] = [];

  const fetchStub = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url) });
    if (method === "GET") {
      if (!stored) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(stored), { status: 200 });
    }
    stored = Buffer.from(init!.body as Uint8Array);
    return new Response("{}", { status: 200 });
  });

  return {
    fetchStub,
    calls,
    get bytes() {
      return stored;
    },
  };
}

let db: Db;
let app: FastifyInstance;

function buildApp(database: Db): FastifyInstance {
  const instance = Fastify();
  registerRoutes(instance, { db: database, pack, now: () => T });
  return instance;
}

const call = (a: FastifyInstance, method: "GET" | "POST" | "PUT", url: string, payload?: unknown) =>
  a.inject({
    method, url, headers: { "x-user-id": "u-ma" },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });

function seedPeople(database: Db): void {
  database.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)")
    .run("lab-fbd", "RRSL Faridabad", "RRSL", T);
  database.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  ).run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@x.gov.in", T);
}

beforeEach(async () => {
  db = openMemoryDb();
  seedPeople(db);
  app = buildApp(db);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("is off unless both the URL and the service key are present", () => {
    expect(supabaseConfig({})).toBeNull();
    expect(supabaseConfig({ SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(supabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: "k" })).toBeNull();
  });

  it("defaults the bucket and object, and trims a trailing slash from the URL", () => {
    const c = supabaseConfig({
      SUPABASE_URL: "https://x.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "k",
    });
    expect(c).toEqual({
      url: "https://x.supabase.co",
      serviceKey: "k",
      bucket: "taraazu",
      object: "taraazu.db",
    });
  });
});

describe("a round trip keeps the record, not just the reports", () => {
  it("restores a report and its hash chain still verifies", async () => {
    const storage = stubStorage();
    vi.stubGlobal("fetch", storage.fetchStub);

    await call(app, "POST", "/reports", { reportId: "R1", profile: "OIML_R76" });
    await call(app, "PUT", "/reports/R1/profile", {
      profile: {
        unit: "g", accuracyClass: "III", indicatingType: "self", rangeKind: "single",
        electronic: true, manufacturer: "M", model: "X",
        ranges: [{ e: 1, d: 1, min: 20, max: 2000 }],
      },
    });
    await call(app, "POST", "/reports/R1/forms/1/observations", {
      rows: [
        { load: 0, indication: 0, additionalLoad: 0.5 },
        { load: 1000, indication: 1000, additionalLoad: 0.5 },
      ],
    });

    const before = verifyChain(db, "R1");
    expect(before.ok).toBe(true);
    expect(before.eventCount).toBeGreaterThan(2);

    expect((await saveSnapshot(config, db)).ok).toBe(true);

    // A cold start: a brand-new process, opening whatever storage held.
    const restored = await loadSnapshot(config);
    expect(restored.bytes).toBeTruthy();
    const db2 = openMemoryDb(undefined, restored.bytes!);
    const app2 = buildApp(db2);
    await app2.ready();

    const detail = (await call(app2, "GET", "/reports/R1")).json();
    expect(detail.report.model).toBe("X");
    expect(detail.forms.find((f: { form_id: string }) => f.form_id === "1").verdict).toBe("PASSED");

    // The point of the test: the chain that was saved is the chain that came back.
    const after = verifyChain(db2, "R1");
    expect(after.ok).toBe(true);
    expect(after.eventCount).toBe(before.eventCount);

    await app2.close();
  });

  it("treats a missing object as a first run, not as an error", async () => {
    const storage = stubStorage();
    vi.stubGlobal("fetch", storage.fetchStub);
    const result = await loadSnapshot(config);
    expect(result.bytes).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("reports a failed read rather than silently starting empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const result = await loadSnapshot(config);
    expect(result.bytes).toBeNull();
    // Starting empty when a snapshot exists looks exactly like data loss; an operator has to
    // be able to tell the two apart.
    expect(result.error).toMatch(/500/);
  });

  // The deployed instance ran for days against a project with no bucket in it, reporting
  // itself durable and persisting nothing, because a missing bucket arrives as a 400 and
  // every 400 was read as "no object yet". Supabase puts the distinction in the body.
  it("reports a missing bucket rather than mistaking it for a first run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ statusCode: "404", error: "Bucket not found", code: "NoSuchBucket" }),
            { status: 400 },
          ),
      ),
    );
    const result = await loadSnapshot(config);
    expect(result.bytes).toBeNull();
    expect(result.error).toMatch(/NoSuchBucket/);
  });

  it("reports a key the project will not accept", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ statusCode: "403", error: "Unauthorized", code: "AccessDenied" }),
            { status: 403 },
          ),
      ),
    );
    const result = await loadSnapshot(config);
    expect(result.bytes).toBeNull();
    expect(result.error).toMatch(/AccessDenied/);
  });

  it("still treats a genuinely absent object as a first run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: "404", code: "NoSuchKey" }), { status: 400 }),
      ),
    );
    const result = await loadSnapshot(config);
    expect(result.bytes).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("refuses a zero-length object rather than handing SQLite something it cannot open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(0), { status: 200 })));
    const result = await loadSnapshot(config);
    expect(result.bytes).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("upserts, so the second write replaces the first instead of conflicting", async () => {
    const storage = stubStorage();
    vi.stubGlobal("fetch", storage.fetchStub);
    await saveSnapshot(config, db);
    await saveSnapshot(config, db);
    for (const c of storage.calls.filter((x) => x.method === "POST")) {
      expect(c.url).toContain("taraazu.db");
    }
    expect(storage.fetchStub.mock.calls.every(([, init]) =>
      (init as RequestInit | undefined)?.method !== "POST" ||
      ((init as RequestInit).headers as Record<string, string>)["x-upsert"] === "true",
    )).toBe(true);
  });
});

describe("the writer coalesces a burst into one upload", () => {
  it("uploads once for many requests, and the last upload carries the final state", async () => {
    const storage = stubStorage();
    vi.stubGlobal("fetch", storage.fetchStub);

    // Seeding alone is several hundred writes; one upload per write would be slow and
    // pointless, since only the last upload's contents survive anyway.
    const writer = new SnapshotWriter(config, db, 5);
    for (let i = 0; i < 20; i++) writer.request();

    await writer.flush();
    const uploads = storage.calls.filter((c) => c.method === "POST").length;
    expect(uploads).toBeLessThan(20);
    expect(uploads).toBeGreaterThan(0);

    // And what landed is openable, which is the only thing that matters about it.
    const restored = await loadSnapshot(config);
    expect(restored.bytes).toBeTruthy();
    const db2 = openMemoryDb(undefined, restored.bytes!);
    expect(db2.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
  });

  it("keeps a failed upload's reason instead of swallowing it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    const writer = new SnapshotWriter(config, db, 1);
    writer.request();
    await new Promise((r) => setTimeout(r, 60));
    expect(writer.error).toMatch(/403/);
  });
});

describe("health says how durable this deployment is", () => {
  it("reports the file case by default, so a bench install is not mislabelled", async () => {
    const body = (await app.inject({ method: "GET", url: "/health" })).json();
    expect(body.storage).toEqual({ kind: "file", durable: true });
  });

  it("reports whatever the caller declares, including that nothing is persisted", async () => {
    const instance = Fastify();
    registerRoutes(instance, {
      db, pack, now: () => T,
      storage: () => ({ kind: "memory", durable: false, note: "warm instance only" }),
    });
    await instance.ready();
    const body = (await instance.inject({ method: "GET", url: "/health" })).json();
    expect(body.storage.durable).toBe(false);
    expect(body.storage.kind).toBe("memory");
    await instance.close();
  });
});
