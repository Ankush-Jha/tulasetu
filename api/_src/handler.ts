/**
 * The API, as a Vercel serverless function.
 *
 * `apps/api/src/server.ts` already separates building the Fastify app from listening on a
 * port (`buildServer()` vs. the CLI-only `.listen()` block below it) — that split is what makes
 * this file possible without touching the server itself. Vercel gives a function raw
 * `(req, res)`; Fastify's own HTTP server can handle those directly once it is ready, so this
 * file builds the app once per cold start and hands every request to it.
 *
 * Two things are deliberately different from a bench deployment, both forced by what a
 * serverless function *is*, not by choice:
 *
 * - **The database is in memory, and persisted as a whole file.** This application's design
 *   rests on a durable, hash-chained append-only log (CLAUDE.md §3.4), which wants a real
 *   filesystem; a serverless function's is ephemeral and not shared across instances. So the
 *   database is opened in memory and, where Supabase is configured, restored from and written
 *   back to a Storage object so that a demonstration survives a cold start — see
 *   `apps/api/src/db/persistence.ts`, which is explicit that this is a demo convenience and
 *   not safe against two instances writing at once. Without that configuration the behaviour is
 *   what it always was: a report lives as long as the instance stays warm. Either way a bench
 *   install still wants `apps/api/src/server.ts` against a real file, and the seed button
 *   labels its data "(demonstration)" so nobody mistakes one for the other.
 * - **PDF rendering is unavailable.** It needs Chromium, which is not installed on a stock
 *   Node function. `renderReportForDownload` already turns that into a clear 503 rather than a
 *   crash (see apps/api/src/domain/service.ts) — DOCX and JSON, which do not need a browser,
 *   still work.
 *
 * This file is the *source*; `scripts/build-api.mjs` bundles it (and everything it pulls in,
 * including the `@tulasetu/*` workspace packages) into the plain, dependency-free `api/handler.mjs`
 * that actually gets deployed. It has to be pre-bundled rather than left for Vercel's own
 * zero-config Node builder to trace: that builder treats a workspace package it finds via a
 * node_modules symlink as an external runtime dependency and copies the raw folder alongside —
 * fine for an ordinary npm package, fatal for `@tulasetu/engine`, whose `main` is `src/index.ts`
 * and which a plain Node process cannot execute (see the commit that added this file for the
 * `ERR_MODULE_NOT_FOUND … src/index.ts` this produced). `better-sqlite3`, the one dependency
 * with a compiled native binary, is deliberately left external of the bundle — the build script
 * says why.
 *
 * One consequence of that bundling: `server.ts`, `db/open.ts` and `domain/render.ts` each locate
 * a resource (the rule pack, the DB schema, the checklist and forms banks) by walking up from
 * their *own* `import.meta.url` — correct when each is a separate file in the source tree,
 * meaningless once bundling flattens all of them into this single file (every one of those
 * `import.meta.url`s then names *this* file's own path instead). So every such resource is
 * imported here at build time instead — esbuild's JSON loader inlines the two `.json` files as
 * objects and its text loader inlines schema.sql as a string, with no file left to locate at
 * runtime — and handed to `buildServer` and `primeFormsAndChecklists` directly.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer, type Server } from "../../apps/api/src/server.js";
import { primeFormsAndChecklists } from "../../apps/api/src/domain/render.js";
import {
  SnapshotWriter,
  loadSnapshot,
  supabaseConfig,
} from "../../apps/api/src/db/persistence.js";
import { seedDemonstrationData } from "../../apps/api/src/domain/demo.js";
import type { RulePack } from "@tulasetu/engine";

// eslint-disable-next-line import/extensions -- inlined at build time; see the note above.
import rulepack from "../../packages/rulepacks/OIML_R76_2006.json";
import checklists from "../../packages/rulepacks/checklists/R76-2_2007_checklist.json";
import forms from "../../packages/rulepacks/forms/R76-2_2007_forms.json";
// @ts-expect-error -- scripts/build-api.mjs configures esbuild to load .sql as raw text; no
// type declaration exists for that extension, nor does one need to.
import schemaSql from "../../apps/api/src/db/schema.sql";

let serverPromise: Promise<Server> | null = null;

/**
 * The three accounts the sign-in screen offers (`DEMO_ACCOUNTS` in apps/web/src/lib/auth.tsx),
 * inserted directly because nothing else seeds them on a *fresh* database. A bench install's
 * `tulasetu.db` accumulates users the ordinary way, through whatever onboarding a real
 * deployment wires up; this function starts from an empty in-memory database every cold start,
 * so without this the sign-in screen would offer three accounts the server had never heard of.
 */
function seedDemoUsers(db: Server["db"]): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)",
  ).run("lab-fbd", "RRSL Faridabad", "RRSL", "09", 1, now);
  const users: [string, string, string, string][] = [
    ["u-ma", "MA", "A. Assistant", "a.assistant@demo.tulasetu.invalid"],
    ["u-ad", "AD", "B. Deputy", "b.deputy@demo.tulasetu.invalid"],
    ["u-dir", "DIRECTOR", "C. Director", "c.director@demo.tulasetu.invalid"],
  ];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  for (const [id, role, name, email] of users) insert.run(id, "lab-fbd", role, name, email, now);
}

/**
 * Set once the database is backed by Supabase Storage, so a request that wrote something can
 * ask for the file to be uploaded again. Null when Supabase is not configured, in which case
 * nothing here does anything.
 */
let snapshots: SnapshotWriter | null = null;

function getServer(): Promise<Server> {
  if (!serverPromise) {
    serverPromise = (async () => {
      primeFormsAndChecklists(forms as never, checklists as never);

      // Restore before building, because the database has to exist as the *restored* file
      // rather than be emptied and refilled — the event log's hash chain is the record, and
      // replaying it into a fresh database is not the same thing as keeping it.
      const config = supabaseConfig();
      let restoreFrom: Buffer | undefined;
      if (config) {
        const snapshot = await loadSnapshot(config);
        if (snapshot.error) {
          // Reported, not swallowed: starting empty when a snapshot exists looks exactly like
          // data loss, and an operator needs to be able to tell the two apart.
          console.error(`[tulasetu] could not read the stored database: ${snapshot.error}`);
        }
        if (snapshot.bytes) restoreFrom = snapshot.bytes;
      }

      const server = buildServer({
        dbPath: ":memory:",
        attachmentRoot: "/tmp/attachments",
        rulepack: rulepack as RulePack,
        checklists,
        schemaSql: schemaSql as unknown as string,
        ...(restoreFrom ? { restoreFrom } : {}),
        storage: () =>
          config
            ? {
                kind: "supabase-storage",
                durable: true,
                note:
                  "The database is kept in memory and mirrored to a Supabase Storage object " +
                  "after every write, so a demonstration survives a cold start. It is not safe " +
                  "against two instances writing at once — a bench install uses a real file.",
                error: snapshots?.error ?? null,
              }
            : {
                kind: "memory",
                durable: false,
                note:
                  "Nothing is persisted: this data lives only as long as the serverless " +
                  "instance stays warm. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to " +
                  "keep it between visits.",
              },
      });
      seedDemoUsers(server.db);
      if (config) snapshots = new SnapshotWriter(config, server.db);
      await server.app.ready();

      // Seed the demonstration set when the repository is empty.
      //
      // It used to be a button. On a deployment whose database does not survive a cold start
      // that meant a visitor's first sight of the application was an empty dashboard and a
      // instruction to press something — which teaches nothing, and is a poor answer to "does
      // this work". An empty repository is only ever the first boot of a demonstration host; a
      // bench install runs `apps/api/src/server.ts`, which does none of this.
      const empty =
        (server.db.prepare("SELECT COUNT(*) AS n FROM reports").get() as { n: number }).n === 0;
      if (empty && process.env["TULASETU_NO_AUTOSEED"] !== "1") {
        try {
          const result = await seedDemonstrationData(
            { db: server.db, pack: server.pack, now: new Date().toISOString() },
            { userId: "u-ma", labId: "lab-fbd", role: "MA" },
          );
          console.log(`[tulasetu] seeded ${result.created.length} demonstration reports`);
          // Straight to storage, so the next cold start restores them rather than seeding
          // again — and so a reader of the bucket sees the same repository the site shows.
          if (config) await snapshots?.flush();
        } catch (err) {
          // A demonstration that failed to seed is still a working application; failing to
          // boot over it would not be.
          console.error(`[tulasetu] could not seed demonstration data: ${(err as Error).message}`);
        }
      }

      return server;
    })();
  }
  return serverPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { app } = await getServer();

  // The browser calls `/api/...`; the routes underneath are registered with no prefix (see
  // vite.config.ts's dev proxy, which strips the same prefix for the same reason — one set of
  // route paths, reachable the same way in development and here).
  if (req.url) {
    req.url = req.url.replace(/^\/api/, "") || "/";
  }

  // A read changes nothing, so only a write is worth uploading after. Rendering is the
  // exception among GETs — it appends a REPORT_RENDERED event — so it is included by method
  // rather than by guessing from the path.
  const writes = req.method !== undefined && !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (snapshots && (writes || req.url?.includes("/render/"))) {
    // After the response, not before: the upload must carry what the request wrote, and it
    // must not make the officer wait for a network round trip to Supabase to see their result.
    res.on("finish", () => snapshots?.request());
  }

  app.server.emit("request", req, res);
}
