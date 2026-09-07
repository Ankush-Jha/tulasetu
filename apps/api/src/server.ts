/**
 * Server entry point.
 *
 *   npx tsx apps/api/src/server.ts
 *
 * Environment:
 *   TULASETU_DB       path to the SQLite file (default ./tulasetu.db)
 *   TULASETU_RULEPACK path to the rule pack JSON
 *   PORT              default 3000
 *   NODE_ENV          `production` refuses to start with the demo authentication stub
 */

import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RulePack } from "@tulasetu/engine";
import { validateRulePack } from "@tulasetu/engine";

import { openDb, type Db } from "./db/open.js";
import { MAX_BYTES } from "./domain/attachments.js";
import { registerRoutes } from "./routes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

export interface Server {
  app: ReturnType<typeof Fastify>;
  db: Db;
  pack: RulePack;
}

/**
 * The packs this installation can serve.
 *
 * Named rather than path-only so the edition in force is a choice an administrator states,
 * not a filename they have to know. `TULASETU_RULESET=draft` boots the same engine against the
 * five-part committee draft — which is the point of the design: an edition change is a
 * different file, not a different program.
 */
const NAMED_PACKS: Record<string, string> = {
  oiml: "packages/rulepacks/OIML_R76_2006.json",
  india: "packages/rulepacks/IN_Sch7A_2011.json",
  draft: "packages/rulepacks/OIML_R76_DRAFT_5PART.json",
};

export function buildServer(
  opts: {
    dbPath?: string;
    rulepackPath?: string;
    attachmentRoot?: string;
    /**
     * A pre-parsed rule pack, taking priority over `rulepackPath`. `ROOT` above is computed from
     * this file's own `import.meta.url`, which only points at the real source tree when this
     * file is running from *that* tree — a bundled deployment (scripts/build-api.mjs) flattens
     * every module into one file, at which point `import.meta.url` names the bundle's own
     * location and `ROOT` stops meaning anything. The bundler works around exactly this by
     * `import`ing the pack JSON at build time (inlined by esbuild's JSON loader) and handing the
     * parsed object straight in here, so no path is ever resolved from ROOT.
     */
    rulepack?: RulePack;
    /** Same reasoning as `rulepack`, for the checklist bank. */
    checklists?: unknown;
    /** Same reasoning again, for `db/open.ts`'s `schema.sql` — see `openDb`'s `schemaSql` param. */
    schemaSql?: string;
  } = {},
): Server {
  let pack: RulePack;
  let packPath = "(supplied directly)";
  if (opts.rulepack) {
    pack = opts.rulepack;
  } else {
    const named = process.env["TULASETU_RULESET"];
    packPath =
      opts.rulepackPath ??
      process.env["TULASETU_RULEPACK"] ??
      join(ROOT, (named && NAMED_PACKS[named]) || NAMED_PACKS["oiml"]!);

    if (named && !NAMED_PACKS[named]) {
      throw new Error(
        `TULASETU_RULESET=${named} is not a known rule pack. Use one of: ` +
          `${Object.keys(NAMED_PACKS).join(", ")}, or set TULASETU_RULEPACK to a file path.`,
      );
    }
    pack = JSON.parse(readFileSync(packPath, "utf8")) as RulePack;
  }

  // Refuse to serve from a malformed pack. Every number in every report comes from this file;
  // starting anyway would produce reports that look authoritative and are not.
  const packIssues = validateRulePack(pack);
  if (packIssues.length > 0) {
    throw new Error(
      `Rule pack ${packPath} is invalid and cannot be served:\n` +
        packIssues.map((i) => `  ${i.code} ${i.path ?? ""} ${i.message}`).join("\n"),
    );
  }

  // The checklist bank is optional: a rule pack without one still serves reports, and the
  // /checklists route says so rather than the server failing to start.
  let checklists: unknown = opts.checklists;
  if (checklists === undefined && !opts.rulepack) {
    try {
      checklists = JSON.parse(
        readFileSync(join(ROOT, "packages/rulepacks/checklists/R76-2_2007_checklist.json"), "utf8"),
      );
    } catch {
      checklists = undefined;
    }
  }

  const db = openDb(
    opts.dbPath ?? process.env["TULASETU_DB"] ?? join(ROOT, "tulasetu.db"),
    opts.schemaSql,
  );
  const attachmentRoot =
    opts.attachmentRoot ?? process.env["TULASETU_ATTACHMENTS"] ?? join(ROOT, "attachments");

  const app = Fastify({ logger: { level: process.env["LOG_LEVEL"] ?? "info" } });
  // The limit is enforced again in the attachment store; here it stops a large upload being
  // buffered at all rather than being read and then rejected.
  app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1 } });
  registerRoutes(app, { db, pack, attachmentRoot, ...(checklists ? { checklists } : {}) });
  return { app, db, pack };
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  // The header-based principal in routes.ts is a demonstration stub: it trusts the caller's
  // claim of identity. That is fine on a bench machine behind a login, and unacceptable on a
  // network. Fail loudly rather than ship an open door.
  if (process.env["NODE_ENV"] === "production" && !process.env["TULASETU_ALLOW_HEADER_AUTH"]) {
    console.error(
      "Refusing to start: authentication is a demonstration stub that trusts the X-User-Id\n" +
        "header. Wire a real identity provider (NIC SSO / DSC) before production, or set\n" +
        "TULASETU_ALLOW_HEADER_AUTH=1 if this instance is genuinely isolated.",
    );
    process.exit(1);
  }

  const { app, pack } = buildServer();
  const port = Number(process.env["PORT"] ?? 3000);
  app
    .listen({ port, host: "127.0.0.1" })
    .then(() => {
      app.log.info(`TulaSetu API on :${port} — rule pack ${pack.ruleset_id} v${pack["version"]}`);
      if (String(pack["status"] ?? "").toLowerCase().includes("draft")) {
        app.log.warn(
          `${pack.ruleset_id} is a DRAFT edition and is not in force. ` +
            `Reports computed against it must not back a certificate.`,
        );
      }
    })
    .catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
}
