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
  // The AD is here because the seeder walks reports up the approval chain, and it can only do
  // so through officers who actually hold the role each step requires: an MA cannot recommend
  // their own work. Without this account the set would stop at SUBMITTED.
  u.run("u-ad", "lab-fbd", "AD", "B. Deputy", "ad@x.gov.in", T);
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
    expect(res.json().created).toHaveLength(11);

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
    expect((await call("GET", "/reports", "u-ma")).json()).toHaveLength(11);
  });

  it("labels everything as demonstration data", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    const reports = (await call("GET", "/reports", "u-ma")).json();
    for (const r of reports) {
      expect(r.id, `${r.id} should be marked`).toMatch(/DEMO/);
      expect(r.manufacturer, `${r.manufacturer} should be marked`).toMatch(/demonstration/i);
    }
  });

  it("shows a passing report, a failing one, and one still in progress", async () => {
    // All three verdicts are reachable now. PASSED requires *every* applicable form to carry
    // one, which used to be impossible: the seeder could only fill the weighing-shaped forms,
    // because those were the only ones the server would compute. Now each form is run by its
    // own kernel, so a report can genuinely be complete — and a seeder that reports PASSED is
    // no longer claiming tests were run that were not.
    await call("POST", "/admin/demo-data", "u-ma");
    const reports = (await call("GET", "/reports", "u-ma")).json();
    const verdicts = reports.map((r: any) => r.overall_verdict);

    expect(verdicts).toContain("PASSED");
    expect(verdicts).toContain("FAILED");
    // At least one report left part-way through the bench work, which is what most of a
    // laboratory's repository looks like on any given day.
    expect(verdicts.filter((v: string | null) => v === null).length).toBeGreaterThan(0);
  });

  it("records every applicable form of a completed report, not just the weighing ones", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    const detail = (await call("GET", "/reports/TS-DEMO-0001", "u-ma")).json();
    const applicable = detail.forms.filter((f: any) => f.applicable === 1);
    expect(applicable.length).toBeGreaterThan(20);
    for (const f of applicable) {
      expect(f.verdict, `form ${f.form_id} was left unrecorded`).toBeTruthy();
    }
    // And the forms that are not error-against-mpe are among them.
    const ids = applicable.map((f: any) => f.form_id);
    expect(ids).toContain("6.2");   // creep, K4
    expect(ids).toContain("12.1");  // disturbances, K5
    expect(ids).toContain("7");     // stability of equilibrium, K6
  });

  it("walks reports through the approval chain, each step by the role entitled to take it", async () => {
    await call("POST", "/admin/demo-data", "u-ma");
    const reports = (await call("GET", "/reports", "u-ma")).json();
    const states = new Set(reports.map((r: any) => r.status));
    // A repository where nothing has ever been reviewed cannot show the approval chain, which
    // is the point of the product.
    expect(states.has("DRAFT")).toBe(true);
    expect(states.has("SUBMITTED")).toBe(true);
    expect(states.has("RECOMMENDED")).toBe(true);
    expect(states.has("DEFICIENCY")).toBe(true);
    expect(states.has("REMITTED")).toBe(true);
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
    for (const id of ["TS-DEMO-0001", "TS-DEMO-0002", "TS-DEMO-0003", "TS-DEMO-0004", "TS-DEMO-0005",
                      "TS-DEMO-0006", "TS-DEMO-0007", "TS-DEMO-0008", "TS-DEMO-0009", "TS-DEMO-0010",
                      "TS-DEMO-0011"]) {
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
    // Damp heat and endurance are each printed as several lettered forms (13a/b/c, 15a/c),
    // so the exemption has to hold for every one of them, not just the first.
    expect(na(classI, "13a"), "damp heat should not apply to class I").toBe(true);
    expect(na(classI, "13b"), "damp heat should not apply to class I").toBe(true);
    expect(na(classI, "13c"), "damp heat should not apply to class I").toBe(true);
    expect(na(classI, "14"), "span stability should not apply to class I").toBe(true);
    expect(na(classI, "15a"), "endurance should not apply to class I").toBe(true);
    expect(na(classI, "15c"), "endurance should not apply to class I").toBe(true);

    // The 500 kg platform: endurance out on capacity, tilting in, 12.7 in.
    const platform = (await call("GET", "/reports/TS-DEMO-0004", "u-ma")).json();
    expect(na(platform, "15a"), "endurance should not apply above 100 kg").toBe(true);
    expect(na(platform, "8"), "tilting should apply to a tiltable instrument").toBe(false);
    expect(na(platform, "12.7a"), "12.7 should apply to a vehicle-powered instrument").toBe(false);
    expect(na(platform, "12.7b"), "12.7 should apply to a vehicle-powered instrument").toBe(false);
  });

  it("reaches LOCKED, CERTIFICATE_ISSUED, PUBLISHED and WITHDRAWN — the far end of the lifecycle, not just its middle", async () => {
    // Those four states exist only behind a rendered, hashed PDF (lifecycle.ts's
    // `final_pdf_rendered` guard), which needs Chromium. Rather than assume it is installed,
    // this checks what the seed actually reached — the same fact `render.test.ts`'s "renders
    // and locks in one step" test branches on — so the suite is honest about which case it is
    // in rather than depending on the test machine having a browser.
    const seed = (await call("POST", "/admin/demo-data", "u-ma")).json();
    const reports = (await call("GET", "/reports", "u-ma")).json();
    const statusOf = new Map(reports.map((r: any) => [r.id, r.status]));

    if (statusOf.get("TS-DEMO-0009") !== "LOCKED") {
      // Chromium was not available, so `walk` stopped each of these three reports at the step
      // before LOCKED (RECOMMENDED) — DIR-06/MA-08's own fallback, recorded honestly rather
      // than silently producing a repository that stops short of the far end.
      expect(statusOf.get("TS-DEMO-0009")).toBe("RECOMMENDED");
      expect(seed.note).toMatch(/stopped at the step before LOCKED/i);
      return;
    }

    expect(statusOf.get("TS-DEMO-0009")).toBe("LOCKED");
    expect(statusOf.get("TS-DEMO-0010")).toBe("CERTIFICATE_ISSUED");
    expect(statusOf.get("TS-DEMO-0001")).toBe("PUBLISHED");
    expect(statusOf.get("TS-DEMO-0011")).toBe("WITHDRAWN");

    // The locked report carries the hash a certificate would be issued against.
    const locked = (await call("GET", "/reports/TS-DEMO-0009", "u-ma")).json();
    expect(locked.report.locked_hash).toHaveLength(64);

    // The revocation is a real event on the log, not a status flip with no reason.
    const audit = (await call("GET", "/reports/TS-DEMO-0011/audit", "u-ma")).json();
    const revoked = audit.events.find((e: any) => e.eventType === "APPROVAL_REVOKED");
    expect(revoked?.payload?.note).toMatch(/Rule 13\(1\)\(e\)/);
  });

  it("refuses a role that cannot create reports", async () => {
    // The Director approves; they do not record bench work, and seeding is bench work.
    const res = await call("POST", "/admin/demo-data", "u-dir");
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/Metrological Assistant/i);
  });
});
