/**
 * Demonstration data.
 *
 * Worth testing for one reason above the others: it must go through the real service calls, so
 * that nothing a visitor sees could have reached the repository by a path the application does
 * not actually support. A seeder that writes rows straight into the tables would populate the
 * screen and prove nothing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RulePack } from "@tulasetu/engine";

import { openMemoryDb, type Db } from "../src/db/open.js";
import { registerRoutes } from "../src/routes.js";
import { verifyChain } from "../src/db/events.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(HERE, "../../../packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;

const T = "2026-09-07T10:00:00.000Z";

let db: Db;
let app: FastifyInstance;

const call = (method: "GET" | "POST", url: string, userId: string, payload?: unknown) =>
  app.inject({
    method, url, headers: { "x-user-id": userId },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });

beforeEach(async () => {
  db = openMemoryDb();
  db.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)").run("lab-fbd", "RRSL", "RRSL", T);
  const u = db.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  u.run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@x.gov.in", T);
  u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director", "dir@x.gov.in", T);

  app = Fastify();
  registerRoutes(app, { db, pack, now: () => T });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("seeding the demonstration set", () => {
  it("creates a spread of instruments a visitor can learn from", async () => {
    const res = await call("POST", "/admin/demo-data", "u-ma");
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toHaveLength(5);

    const reports = (await call("GET", "/reports", "u-ma")).json();
    const classes = reports.map((r: any) => r.accuracy_class).sort();
    // One of each accuracy class the standard defines, so the applicability differences show.
    expect(classes).toContain("I");
    expect(classes).toContain("II");
    expect(classes).toContain("III");
    expect(classes).toContain("IIII");
  });

  it("is idempotent — a second call adds nothing", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    const again = await call("POST", "/admin/demo-data", "u-ma");
    expect(again.json().created).toEqual([]);
    expect(again.json().note).toMatch(/already present/i);
    expect((await call("GET", "/reports", "u-ma")).json()).toHaveLength(5);
  });

  it("labels everything as demonstration data", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    const reports = (await call("GET", "/reports", "u-ma")).json();
    for (const r of reports) {
      expect(r.id, `${r.id} should be marked`).toMatch(/DEMO/);
      expect(r.manufacturer, `${r.manufacturer} should be marked`).toMatch(/demonstration/i);
    }
  });

  it("produces one report that passes and one that fails", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    const reports = (await call("GET", "/reports", "u-ma")).json();
    const verdicts = reports.map((r: any) => r.overall_verdict);
    expect(verdicts).toContain("PASSED");
    expect(verdicts).toContain("FAILED");
  });

  it("leaves the class II* scale unvalidatable, because its checksum is the register's own defect", async () => {
    // Certificate #100 carries "8100kb" — a file size. That is an error-severity finding, so
    // the report cannot pass validation. This is the audit working, not a seeding bug.
    await call("POST", "/admin/demo-data", "u-ma");
    const detail = (await call("GET", "/reports/TS-DEMO-0003", "u-ma")).json();
    expect(detail.guards).not.toContain("no_blocking_validation_issues");
  });

  it("writes through the real event log, so every report's chain verifies", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    for (const id of ["TS-DEMO-0001", "TS-DEMO-0002", "TS-DEMO-0003", "TS-DEMO-0004", "TS-DEMO-0005"]) {
      const v = verifyChain(db, id);
      expect(v.ok, `${id} chain`).toBe(true);
      expect(v.eventCount, `${id} events`).toBeGreaterThan(0);
    }
  });

  it("resolves applicability per instrument rather than seeding one fixed list", async () => {
    await call("POST", "/admin/demo-data", "u-ma");

    // Class I: no tilting, no damp heat, no span stability, no endurance.
    const classI = (await call("GET", "/reports/TS-DEMO-0005", "u-ma")).json();
    const na = (d: any, form: string) => d.forms.find((f: any) => f.form_id === form)?.applicable === 0;
    expect(na(classI, "13"), "damp heat should not apply to class I").toBe(true);
    expect(na(classI, "14"), "span stability should not apply to class I").toBe(true);
    expect(na(classI, "15"), "endurance should not apply to class I").toBe(true);

    // The 500 kg platform: endurance out on capacity, tilting in, 12.7 in.
    const platform = (await call("GET", "/reports/TS-DEMO-0004", "u-ma")).json();
    expect(na(platform, "15"), "endurance should not apply above 100 kg").toBe(true);
    expect(na(platform, "8"), "tilting should apply to a tiltable instrument").toBe(false);
    expect(na(platform, "12.7"), "12.7 should apply to a vehicle-powered instrument").toBe(false);
  });

  it("refuses a role that cannot create reports", async () => {
    // The Director approves; they do not record bench work, and seeding is bench work.
    const res = await call("POST", "/admin/demo-data", "u-dir");
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/Metrological Assistant/i);
  });
});
