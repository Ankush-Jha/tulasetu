/**
 * Repository tests.
 *
 * The claims being tested are the ones Taraazu makes to a regulator, not merely to a
 * developer: that a recorded observation cannot be altered, that an alteration made behind
 * the application's back is detectable, that the approval chain cannot be short-circuited by
 * seniority, and that the Rule 4(9) return is a query rather than an exercise.
 *
 * If any of these fail, the compliance argument fails with them.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { openMemoryDb, type Db } from "../src/db/open.js";
import {
  appendEvent,
  computeEventHash,
  currentVersion,
  readEvents,
  verifyChain,
  ConcurrencyError,
} from "../src/db/events.js";
import { rebuildProjection, rebuildAllProjections } from "../src/domain/events.js";
import {
  canTransition,
  availableTransitions,
  nextStates,
  TRANSITIONS,
  REPORT_STATES,
  type ReportState,
} from "../src/domain/lifecycle.js";
import { can, canReadReport, canWriteReport, capabilitiesOf } from "../src/domain/rbac.js";
import { dashboardCounts, rule4_9AnnualReturn, searchReports } from "../src/domain/stats.js";

const T = "2026-09-07T10:00:00.000Z";

function seed(db: Db) {
  db.prepare("INSERT INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)").run(
    "lab-fbd", "RRSL Faridabad", "RRSL", "09", 1, T,
  );
  db.prepare("INSERT INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)").run(
    "lab-blr", "RRSL Bengaluru", "RRSL", "12", 1, T,
  );
  const u = db.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  u.run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@example.gov.in", T);
  u.run("u-ad", "lab-fbd", "AD", "B. Director", "ad@example.gov.in", T);
  u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director", "dir@example.gov.in", T);
  u.run("u-other", "lab-blr", "MA", "D. Other", "other@example.gov.in", T);
}

let db: Db;
beforeEach(() => {
  db = openMemoryDb();
  seed(db);
});

// ---------------------------------------------------------------------------

describe("the append-only event log", () => {
  it("refuses to update a recorded event", () => {
    appendEvent(db, { reportId: "r1", eventType: "REPORT_CREATED", payload: { labId: "lab-fbd" }, actorId: "u-ma", recordedAt: T });
    expect(() =>
      db.prepare("UPDATE report_events SET payload = ? WHERE report_id = ?").run('{"tampered":true}', "r1"),
    ).toThrow(/append-only/i);
  });

  it("refuses to delete a recorded event", () => {
    appendEvent(db, { reportId: "r1", eventType: "REPORT_CREATED", payload: {}, actorId: "u-ma", recordedAt: T });
    expect(() => db.prepare("DELETE FROM report_events WHERE report_id = ?").run("r1")).toThrow(
      /append-only/i,
    );
  });

  it("chains each event to the one before it", () => {
    appendEvent(db, { reportId: "r1", eventType: "REPORT_CREATED", payload: {}, actorId: "u-ma", recordedAt: T });
    appendEvent(db, { reportId: "r1", eventType: "PROFILE_UPDATED", payload: { profile: {} }, actorId: "u-ma", recordedAt: T });
    const events = readEvents(db, "r1");
    expect(events[0]!.prev_hash).toBeNull();
    expect(events[1]!.prev_hash).toBe(events[0]!.hash);
    expect(verifyChain(db, "r1")).toMatchObject({ ok: true, eventCount: 2 });
  });

  it("keeps separate reports on separate chains", () => {
    appendEvent(db, { reportId: "r1", eventType: "REPORT_CREATED", payload: {}, actorId: "u-ma", recordedAt: T });
    appendEvent(db, { reportId: "r2", eventType: "REPORT_CREATED", payload: {}, actorId: "u-ma", recordedAt: T });
    expect(readEvents(db, "r2")[0]!.prev_hash).toBeNull();
    expect(verifyChain(db, "r1").ok).toBe(true);
    expect(verifyChain(db, "r2").ok).toBe(true);
  });

  it("detects a row altered behind the application's back", () => {
    // The triggers stop the application from editing history. They do not stop someone with
    // the database file, so the chain has to make that detectable rather than merely
    // forbidden. Drop the triggers to simulate exactly that attacker.
    appendEvent(db, { reportId: "r1", eventType: "REPORT_CREATED", payload: {}, actorId: "u-ma", recordedAt: T });
    appendEvent(db, { reportId: "r1", eventType: "OBSERVATIONS_RECORDED", payload: { formId: "1", load: 5000, indication: 5000 }, actorId: "u-ma", recordedAt: T });
    expect(verifyChain(db, "r1").ok).toBe(true);

    db.exec("DROP TRIGGER report_events_no_update");
    db.prepare("UPDATE report_events SET payload = ? WHERE report_id = ? AND version = 2").run(
      JSON.stringify({ formId: "1", load: 5000, indication: 4999 }),
      "r1",
    );

    const v = verifyChain(db, "r1");
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/does not match its recorded hash/i);
  });

  it("detects a removed event as a version gap", () => {
    for (let i = 0; i < 3; i++) {
      appendEvent(db, { reportId: "r1", eventType: "NOTE_ADDED", payload: { i }, actorId: "u-ma", recordedAt: T });
    }
    db.exec("DROP TRIGGER report_events_no_delete");
    db.prepare("DELETE FROM report_events WHERE report_id = ? AND version = 2").run("r1");

    const v = verifyChain(db, "r1");
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/version gap/i);
  });

  it("hashes content, so two different payloads cannot collide by field re-splitting", () => {
    // Length-prefixing is what stops "ab" + "c" hashing the same as "a" + "bc".
    const base = { prevHash: null, reportId: "r", version: 1, actorId: "u", recordedAt: T };
    const a = computeEventHash({ ...base, eventType: "AB", payload: "C" });
    const b = computeEventHash({ ...base, eventType: "A", payload: "BC" });
    expect(a).not.toBe(b);
  });

  it("rejects a concurrent write instead of silently overwriting it", () => {
    appendEvent(db, { reportId: "r1", eventType: "REPORT_CREATED", payload: {}, actorId: "u-ma", recordedAt: T });
    // Two officers both loaded the report at version 1. The first write wins.
    appendEvent(db, { reportId: "r1", eventType: "NOTE_ADDED", payload: { by: "first" }, actorId: "u-ma", recordedAt: T, expectedVersion: 1 });
    expect(() =>
      appendEvent(db, { reportId: "r1", eventType: "NOTE_ADDED", payload: { by: "second" }, actorId: "u-ad", recordedAt: T, expectedVersion: 1 }),
    ).toThrow(ConcurrencyError);
    // And the loser's write did not land.
    expect(currentVersion(db, "r1")).toBe(2);
    expect(readEvents(db, "r1").map((e) => JSON.parse(e.payload).by)).toEqual([undefined, "first"]);
  });
});

// ---------------------------------------------------------------------------

describe("projection", () => {
  function createReport(id = "r1") {
    appendEvent(db, {
      reportId: id, eventType: "REPORT_CREATED", actorId: "u-ma", recordedAt: T,
      payload: { labId: "lab-fbd", rulesetId: "OIML_R76_2006", rulesetVersion: "1.1.0", profile: "IN_Sch7A", applicationNo: "MA/2026/1", feePaidInr: 25000 },
    });
    appendEvent(db, {
      reportId: id, eventType: "PROFILE_UPDATED", actorId: "u-ma", recordedAt: T,
      payload: { profile: { manufacturer: "Example Ltd", model: "EX-15", accuracyClass: "III" }, maxCapacityG: 15000 },
    });
    appendEvent(db, {
      reportId: id, eventType: "APPLICABILITY_RESOLVED", actorId: "u-ma", recordedAt: T,
      payload: {
        tests: [
          { formId: "1", testId: "weighing_performance", applicable: true },
          { formId: "8", testId: "tilting", applicable: false, reason: "Not tiltable in normal use." },
        ],
      },
    });
  }

  it("rebuilds report state from the log alone", () => {
    createReport();
    const p = rebuildProjection(db, "r1")!;
    expect(p).toMatchObject({
      lab_id: "lab-fbd", status: "DRAFT", manufacturer: "Example Ltd",
      model: "EX-15", accuracy_class: "III", max_capacity_g: 15000, version: 3,
    });
  });

  it("marks an inapplicable form NA with its reason", () => {
    createReport();
    rebuildProjection(db, "r1");
    const row = db.prepare("SELECT * FROM report_forms WHERE report_id=? AND form_id=?").get("r1", "8") as any;
    expect(row.applicable).toBe(0);
    expect(row.verdict).toBe("NA");
    expect(row.na_reason).toMatch(/not tiltable/i);
  });

  it("leaves the overall verdict open until every applicable form has one", () => {
    createReport();
    expect(rebuildProjection(db, "r1")!.overall_verdict).toBeNull();

    appendEvent(db, {
      reportId: "r1", eventType: "FORM_RESULT_COMPUTED", actorId: "u-ma", recordedAt: T,
      payload: { formId: "1", testId: "weighing_performance", verdict: "PASSED", result: { rows: [] } },
    });
    expect(rebuildProjection(db, "r1")!.overall_verdict).toBe("PASSED");
  });

  it("fails the report when any applicable form fails", () => {
    createReport();
    appendEvent(db, {
      reportId: "r1", eventType: "FORM_RESULT_COMPUTED", actorId: "u-ma", recordedAt: T,
      payload: { formId: "1", verdict: "FAILED", result: {} },
    });
    expect(rebuildProjection(db, "r1")!.overall_verdict).toBe("FAILED");
  });

  it("drops stale forms when applicability is re-resolved after a profile change", () => {
    createReport();
    rebuildProjection(db, "r1");
    appendEvent(db, {
      reportId: "r1", eventType: "APPLICABILITY_RESOLVED", actorId: "u-ma", recordedAt: T,
      payload: { tests: [{ formId: "1", testId: "weighing_performance", applicable: true }] },
    });
    rebuildProjection(db, "r1");
    const ids = (db.prepare("SELECT form_id FROM report_forms WHERE report_id=?").all("r1") as any[]).map((r) => r.form_id);
    expect(ids).toEqual(["1"]);
  });

  it("advances status along the lifecycle as transition events arrive", () => {
    createReport();
    for (const t of ["OBSERVATIONS_COMPLETED", "VALIDATED", "SUBMITTED_FOR_REVIEW"]) {
      appendEvent(db, { reportId: "r1", eventType: t, payload: {}, actorId: "u-ma", recordedAt: T });
    }
    const p = rebuildProjection(db, "r1")!;
    expect(p.status).toBe("SUBMITTED");
    expect(p.submitted_at).toBe(T);
  });

  it("is fully rebuildable — dropping projections loses nothing", () => {
    createReport("r1");
    createReport("r2");
    rebuildAllProjections(db);
    const before = db.prepare("SELECT * FROM reports ORDER BY id").all();

    db.exec("DELETE FROM report_forms; DELETE FROM reports;");
    expect(db.prepare("SELECT COUNT(*) AS n FROM reports").get()).toMatchObject({ n: 0 });

    expect(rebuildAllProjections(db)).toBe(2);
    expect(db.prepare("SELECT * FROM reports ORDER BY id").all()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------

describe("lifecycle", () => {
  it("lets an MA submit a validated report", () => {
    expect(canTransition("VALIDATED", "SUBMITTED", "MA").allowed).toBe(true);
  });

  it("does not let an MA issue a certificate", () => {
    const r = canTransition("LOCKED", "CERTIFICATE_ISSUED", "MA");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/permitted roles/i);
  });

  it("does not let the Director lock a report that is still in draft", () => {
    // Authority is not enough; the state has to be right too. This is why the RBAC check and
    // the lifecycle check are separate and both required.
    expect(canTransition("DRAFT", "LOCKED", "DIRECTOR").allowed).toBe(false);
  });

  it("blocks a transition whose guard is unmet, and says which guard", () => {
    const r = canTransition("RECOMMENDED", "LOCKED", "DIRECTOR", []);
    expect(r.allowed).toBe(false);
    expect(r.unmetGuards).toContain("final_pdf_rendered");
    expect(r.reason).toMatch(/final PDF/i);
  });

  it("allows it once the guard is satisfied", () => {
    expect(canTransition("RECOMMENDED", "LOCKED", "DIRECTOR", ["final_pdf_rendered"]).allowed).toBe(true);
  });

  it("keeps the Director's power to remit a report back (AoM Rule 8)", () => {
    // R.8 is explicit that the Director may remit. A one-way pipeline would misstate the law.
    expect(canTransition("RECOMMENDED", "REMITTED", "DIRECTOR").allowed).toBe(true);
    expect(canTransition("REMITTED", "DRAFT", "MA").allowed).toBe(true);
  });

  it("supports the provisional-certificate branch (Rule 6(8)) without skipping the final lock", () => {
    expect(canTransition("RECOMMENDED", "PROVISIONAL", "DIRECTOR").allowed).toBe(true);
    expect(canTransition("PROVISIONAL", "LOCKED", "DIRECTOR", ["final_pdf_rendered"]).allowed).toBe(true);
  });

  it("allows revocation after publication (Rule 13(1)(e))", () => {
    expect(canTransition("PUBLISHED", "WITHDRAWN", "DIRECTOR").allowed).toBe(true);
  });

  it("explains what a state can move to when a move is refused", () => {
    const r = canTransition("DRAFT", "PUBLISHED", "DIRECTOR");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("OBSERVATIONS_COMPLETE");
  });

  it("offers an MA only the transitions an MA can take", () => {
    const labels = availableTransitions("VALIDATED", "MA").map((t) => t.to);
    expect(labels).toContain("SUBMITTED");
    expect(availableTransitions("RECOMMENDED", "MA")).toEqual([]);
  });

  it("names a legal basis on every transition", () => {
    for (const t of TRANSITIONS) expect(t.basis, `${t.from}->${t.to}`).toBeTruthy();
  });

  it("has no unreachable state except the initial one", () => {
    const reachable = new Set<ReportState>(TRANSITIONS.map((t) => t.to));
    for (const s of REPORT_STATES) {
      if (s === "DRAFT") continue;
      expect(reachable.has(s), `${s} is unreachable`).toBe(true);
    }
  });

  it("leaves only WITHDRAWN and PUBLISHED terminal", () => {
    for (const s of REPORT_STATES) {
      const isTerminal = nextStates(s).length === 0;
      if (isTerminal) expect(["WITHDRAWN", "PUBLISHED"]).toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------

describe("RBAC", () => {
  const ma = { userId: "u-ma", labId: "lab-fbd", role: "MA" as const };
  const dir = { userId: "u-dir", labId: "lab-fbd", role: "DIRECTOR" as const };
  const admin = { userId: "u-x", labId: "lab-fbd", role: "ADMIN" as const };

  it("lets an MA record observations but not issue a certificate", () => {
    expect(can(ma, "report:record_observations")).toBe(true);
    expect(can(ma, "report:issue_certificate")).toBe(false);
  });

  it("gives the system administrator no statutory power", () => {
    // Separating the person who runs the installation from the authority who approves a model
    // is the entire reason for having roles.
    expect(can(admin, "user:manage")).toBe(true);
    expect(can(admin, "report:issue_certificate")).toBe(false);
    expect(can(admin, "report:publish")).toBe(false);
    expect(can(admin, "report:revoke")).toBe(false);
  });

  it("does not give the Director bench-recording capability", () => {
    expect(can(dir, "report:record_observations")).toBe(false);
    expect(can(dir, "report:issue_certificate")).toBe(true);
  });

  it("keeps one lab's reports out of another lab's reach", () => {
    const foreign = { lab_id: "lab-blr" };
    const r = canReadReport(ma, foreign);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Rule 16\(2\)/);
  });

  it("lets the Director read across laboratories", () => {
    expect(canReadReport(dir, { lab_id: "lab-blr" }).allowed).toBe(true);
  });

  it("closes a locked report to every role, including the Director", () => {
    for (const p of [ma, dir, admin]) {
      const r = canWriteReport(p, { lab_id: "lab-fbd", status: "LOCKED" }, "report:record_observations");
      expect(r.allowed, `${p.role} could write a locked report`).toBe(false);
      expect(r.reason).toMatch(/record copy/i);
    }
  });

  it("exposes a role's capabilities without letting a caller mutate the grant table", () => {
    const caps = capabilitiesOf("MA");
    caps.push("report:publish");
    expect(can(ma, "report:publish")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("dashboard and the Rule 4(9) return", () => {
  function makeReport(id: string, opts: { status: string; createdAt: string; completedAt?: string; fee?: number; cls?: string; lab?: string }) {
    db.prepare(
      `INSERT INTO reports (id,lab_id,status,ruleset_id,profile,manufacturer,model,accuracy_class,
         created_at,updated_at,completed_at,fee_paid_inr,version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    ).run(
      id, opts.lab ?? "lab-fbd", opts.status, "OIML_R76_2006", "IN_Sch7A", "Example Ltd", "EX-" + id,
      opts.cls ?? "III", opts.createdAt, opts.createdAt, opts.completedAt ?? null, opts.fee ?? 25000,
    );
  }

  it("counts in-process, completed and deficiency reports", () => {
    makeReport("a", { status: "DRAFT", createdAt: "2026-01-10" });
    makeReport("b", { status: "SUBMITTED", createdAt: "2026-02-10" });
    makeReport("c", { status: "PUBLISHED", createdAt: "2026-03-10", completedAt: "2026-05-10" });
    makeReport("d", { status: "DEFICIENCY", createdAt: "2026-04-10" });

    const c = dashboardCounts(db, "lab-fbd");
    expect(c).toMatchObject({ inProcess: 2, completed: 1, withDeficiency: 1, total: 4 });
  });

  it("builds the annual return as a query, with fees and turnaround", () => {
    makeReport("a", { status: "PUBLISHED", createdAt: "2026-01-01T00:00:00Z", completedAt: "2026-03-02T00:00:00Z", fee: 25000 });
    makeReport("b", { status: "PUBLISHED", createdAt: "2026-02-01T00:00:00Z", completedAt: "2026-03-03T00:00:00Z", fee: 10000, cls: "IIII" });
    makeReport("c", { status: "DRAFT", createdAt: "2026-06-01T00:00:00Z", fee: 25000 });

    const r = rule4_9AnnualReturn(db, { labId: "lab-fbd", from: "2026-01-01", to: "2026-12-31", generatedAt: T });
    expect(r.modelsTested).toBe(3);
    expect(r.modelsApproved).toBe(2);
    expect(r.modelsInProgress).toBe(1);
    expect(r.feesRealisedInr).toBe(60000);
    expect(r.byAccuracyClass).toEqual({ III: 2, IIII: 1 });
    expect(r.labName).toBe("RRSL Faridabad");
    expect(r.medianTurnaroundDays).toBeGreaterThan(29);
  });

  it("flags reports that ran past three months, for the Rule 6(8) provisional path", () => {
    makeReport("slow", { status: "PUBLISHED", createdAt: "2026-01-01T00:00:00Z", completedAt: "2026-06-01T00:00:00Z" });
    makeReport("fast", { status: "PUBLISHED", createdAt: "2026-01-01T00:00:00Z", completedAt: "2026-02-01T00:00:00Z" });
    const r = rule4_9AnnualReturn(db, { labId: "lab-fbd", from: "2026-01-01", to: "2026-12-31", generatedAt: T });
    expect(r.exceededThreeMonths).toBe(1);
  });

  it("scopes the return to one laboratory, and rolls up nationally when asked", () => {
    makeReport("a", { status: "PUBLISHED", createdAt: "2026-01-01", lab: "lab-fbd" });
    makeReport("b", { status: "PUBLISHED", createdAt: "2026-01-01", lab: "lab-blr" });
    expect(rule4_9AnnualReturn(db, { labId: "lab-fbd", from: "2026-01-01", to: "2026-12-31", generatedAt: T }).modelsTested).toBe(1);
    expect(rule4_9AnnualReturn(db, { labId: null, from: "2026-01-01", to: "2026-12-31", generatedAt: T }).modelsTested).toBe(2);
  });

  it("always states how time-per-test was measured, rather than presenting it bare", () => {
    const r = rule4_9AnnualReturn(db, { labId: "lab-fbd", from: "2026-01-01", to: "2026-12-31", generatedAt: T });
    expect(r.caveats.join(" ")).toMatch(/recording time, not bench time/i);
  });

  it("excludes reports outside the period", () => {
    makeReport("old", { status: "PUBLISHED", createdAt: "2025-01-01" });
    makeReport("new", { status: "PUBLISHED", createdAt: "2026-05-01" });
    expect(rule4_9AnnualReturn(db, { labId: "lab-fbd", from: "2026-01-01", to: "2026-12-31", generatedAt: T }).modelsTested).toBe(1);
  });
});

describe("search", () => {
  beforeEach(() => {
    const ins = db.prepare(
      `INSERT INTO reports (id,lab_id,status,ruleset_id,profile,manufacturer,model,accuracy_class,created_at,updated_at,version)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
    );
    ins.run("r1", "lab-fbd", "DRAFT", "OIML_R76_2006", "IN_Sch7A", "Acme Scales", "A-100", "III", "2026-01-01", "2026-01-01");
    ins.run("r2", "lab-fbd", "PUBLISHED", "OIML_R76_2006", "OIML_R76", "Beta Weighing", "B-200", "II", "2026-02-01", "2026-02-01");
    ins.run("r3", "lab-blr", "DRAFT", "OIML_R76_2006", "IN_Sch7A", "100% Metrology", "C-300", "IIII", "2026-03-01", "2026-03-01");
  });

  it("filters by lab, status and class", () => {
    expect(searchReports(db, { labId: "lab-fbd" })).toHaveLength(2);
    expect(searchReports(db, { status: "PUBLISHED" })).toHaveLength(1);
    expect(searchReports(db, { accuracyClass: "IIII" })).toHaveLength(1);
  });

  it("treats a % in a manufacturer name as a literal, not a wildcard", () => {
    // "100% Metrology" is a plausible company name. Without ESCAPE, searching "%" would be a
    // wildcard and return every report; with it, "%" is a literal character and matches only
    // the one manufacturer whose name actually contains it.
    expect(searchReports(db, { manufacturer: "100%" })).toHaveLength(1);
    const literalPercent = searchReports(db, { manufacturer: "%" }) as { id: string }[];
    expect(literalPercent.map((r) => r.id)).toEqual(["r3"]);
  });

  it("treats an underscore as a literal too", () => {
    expect(searchReports(db, { model: "_" })).toHaveLength(0);
    expect(searchReports(db, { model: "A-100" })).toHaveLength(1);
  });

  it("filters by creation date range", () => {
    expect(searchReports(db, { createdFrom: "2026-02-01" })).toHaveLength(2);
    expect(searchReports(db, { createdFrom: "2026-01-15", createdTo: "2026-02-15" })).toHaveLength(1);
  });
});
