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

export function openDb(path = "tulasetu.db"): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** In-memory database, for tests. */
export function openMemoryDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(readFileSync(join(HERE, "schema.sql"), "utf8"));
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
