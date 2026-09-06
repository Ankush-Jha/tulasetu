/**
 * Database handle. SQLite by default so a lab can run TulaSetu offline on a bench PC
 * (CLAUDE.md §4: Tauri wrapper, SQLite, web is a PWA). The schema is plain SQL and the
 * queries avoid SQLite-only syntax where practical, so a Postgres move stays cheap.
 */
import Database from "better-sqlite3";
export type Db = Database.Database;
export declare function openDb(path?: string): Db;
/** In-memory database, for tests. */
export declare function openMemoryDb(): Db;
export declare function migrate(db: Db): void;
