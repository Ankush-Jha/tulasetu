/**
 * Database handle. SQLite by default so a lab can run TulaSetu offline on a bench PC
 * (CLAUDE.md §4: Tauri wrapper, SQLite, web is a PWA). The schema is plain SQL and the
 * queries avoid SQLite-only syntax where practical, so a Postgres move stays cheap.
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export type Db = Database.Database;

export function openDb(path = "tulasetu.db", schemaSql?: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db, schemaSql);
  return db;
}

/**
 * In-memory database, for tests and for the serverless deployment.
 *
 * `restoreFrom` opens a previously serialised database rather than an empty one — the bytes a
 * snapshot came back with (see db/persistence.ts). `migrate` still runs over it, because the
 * schema is written with `IF NOT EXISTS` and the role seed is an upsert, so restoring a
 * snapshot taken under an older schema brings it forward rather than failing on it.
 */
export function openMemoryDb(schemaSql?: string, restoreFrom?: Buffer): Db {
  const db = restoreFrom ? new Database(restoreFrom) : new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db, schemaSql);
  return db;
}

/**
 * `schemaSql`, when supplied, replaces the `readFileSync` below. A bench install and the test
 * suite both run from the source tree, where `schema.sql` sits next to this file and reading it
 * by path is the natural thing to do. A bundled deployment (see scripts/build-api.mjs) is a
 * single flattened file with no such neighbour on disk — there, the caller reads schema.sql at
 * *build* time (import, inlined as a string by esbuild's text loader) and hands the content
 * straight through, so this function needs no idea which situation it is in.
 */
export function migrate(db: Db, schemaSql?: string): void {
  db.exec(schemaSql ?? readFileSync(join(HERE, "schema.sql"), "utf8"));
  seedRoles(db);
}

/**
 * The approval chain from PRD §3.2 / the AoM Rules: a Metrological Assistant records,
 * an AD or DD reviews, the Director (LM) approves. `authority` orders them so a check can
 * ask "at least AD?" without enumerating role names.
 */
const ROLES: [string, string, number][] = [
  ["MA", "Metrological Assistant", 10],
  ["AD", "Assistant Director", 20],
  ["DD", "Deputy Director", 25],
  ["DIRECTOR", "Director (Legal Metrology)", 30],
  ["ADMIN", "System Administrator", 40],
];

function seedRoles(db: Db): void {
  const insert = db.prepare(
    "INSERT INTO roles (id, label, authority) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
  );
  const tx = db.transaction(() => {
    for (const [id, label, authority] of ROLES) insert.run(id, label, authority);
  });
  tx();
}
