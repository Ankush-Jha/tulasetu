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
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RulePack } from "@tulasetu/engine";
import { validateRulePack } from "@tulasetu/engine";

import { openDb, type Db } from "./db/open.js";
import { registerRoutes } from "./routes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

export interface Server {
  app: ReturnType<typeof Fastify>;
  db: Db;
  pack: RulePack;
}

export function buildServer(opts: { dbPath?: string; rulepackPath?: string } = {}): Server {
  const packPath = opts.rulepackPath ?? join(ROOT, "packages/rulepacks/OIML_R76_2006.json");
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as RulePack;

  // Refuse to serve from a malformed pack. Every number in every report comes from this file;
  // starting anyway would produce reports that look authoritative and are not.
  const packIssues = validateRulePack(pack);
  if (packIssues.length > 0) {
    throw new Error(
      `Rule pack ${packPath} is invalid and cannot be served:\n` +
        packIssues.map((i) => `  ${i.code} ${i.path ?? ""} ${i.message}`).join("\n"),
    );
  }

  const db = openDb(opts.dbPath ?? process.env["TULASETU_DB"] ?? join(ROOT, "tulasetu.db"));
  const app = Fastify({ logger: { level: process.env["LOG_LEVEL"] ?? "info" } });
  registerRoutes(app, { db, pack });
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
    })
    .catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
}
