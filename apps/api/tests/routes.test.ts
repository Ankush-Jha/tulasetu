/**
 * HTTP tests — the full workflow through the real routes.
 *
 * Uses Fastify's `inject`, so no port is bound and no request escapes the process.
 *
 * The centrepiece is "the whole approval chain", which walks one report from an MA creating it
 * to the Director publishing it, and checks at each step that the officers who should not be
 * able to skip ahead cannot. That path is the product; if it works, TulaSetu works.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InstrumentProfile, RulePack } from "@tulasetu/engine";

import { payloadFor } from "./formRows.js";
import { openMemoryDb, type Db } from "../src/db/open.js";
import { registerRoutes } from "../src/routes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(HERE, "../../../packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;

const T = "2026-09-07T10:00:00.000Z";

/** R 76-1 §3.3's worked example. */
const profile: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  manufacturer: "Example Instruments Pvt Ltd",
  model: "EX-15 MI",
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

let db: Db;
let app: FastifyInstance;

beforeEach(async () => {
  db = openMemoryDb();
  db.prepare("INSERT INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)").run(
    "lab-fbd", "RRSL Faridabad", "RRSL", "09", 1, T,
  );
  db.prepare("INSERT INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)").run(
    "lab-blr", "RRSL Bengaluru", "RRSL", "12", 1, T,
  );
  const u = db.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,?,?)",
  );
  u.run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@x.gov.in", 1, T);
  u.run("u-ad", "lab-fbd", "AD", "B. Deputy", "ad@x.gov.in", 1, T);
  u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director", "dir@x.gov.in", 1, T);
  u.run("u-blr", "lab-blr", "MA", "D. Other", "blr@x.gov.in", 1, T);
  u.run("u-gone", "lab-fbd", "MA", "E. Retired", "gone@x.gov.in", 0, T);

  app = Fastify();
  registerRoutes(app, { db, pack, now: () => T });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const as = (userId: string) => ({ "x-user-id": userId });

async function call(method: "GET" | "POST" | "PUT", url: string, userId: string, payload?: unknown) {
  const res = await app.inject({
    method, url, headers: as(userId),
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { status: res.statusCode, body: res.json() as any };
}

// ---------------------------------------------------------------------------

describe("authentication", () => {
  it("rejects a request with no identity", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown user", async () => {
    expect((await call("GET", "/me", "nobody")).status).toBe(401);
  });

  it("rejects a deactivated account", async () => {
    const r = await call("GET", "/me", "u-gone");
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("INACTIVE_USER");
  });

  it("reports the caller's capabilities", async () => {
    const r = await call("GET", "/me", "u-ma");
    expect(r.body.role).toBe("MA");
    expect(r.body.capabilities).toContain("report:record_observations");
    expect(r.body.capabilities).not.toContain("report:issue_certificate");
  });
});

describe("meta routes", () => {
  it("serves health with the rule pack in force", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toMatchObject({ ok: true, rulesetId: "OIML_R76_2006" });
  });

  it("publishes the rule pack, so a report's numbers can be rechecked independently", async () => {
    const res = await app.inject({ method: "GET", url: "/rulepack" });
    expect(res.json().mpe_bands_initial).toHaveLength(3);
  });

  it("publishes the lifecycle with each transition's legal basis", async () => {
    const res = await app.inject({ method: "GET", url: "/lifecycle" });
    const remit = res.json().transitions.find((t: any) => t.to === "REMITTED");
    expect(remit.basis).toMatch(/Rule 8/);
  });
});

// ---------------------------------------------------------------------------

describe("the whole approval chain", () => {
  it("walks a report from creation to publication, refusing every shortcut", async () => {
    // --- MA creates the report ---
    const created = await call("POST", "/reports", "u-ma", {
      reportId: "TS-1", profile: "IN_Sch7A", applicationNo: "MA/2026/1", feePaidInr: 25000,
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("DRAFT");
    // The pack is pinned at creation so a later update cannot change an issued result.
    expect(created.body.ruleset_id).toBe("OIML_R76_2006");
    expect(created.body.ruleset_version).toBe(pack["version"]);

    // --- profile, which also resolves applicability ---
    const prof = await call("PUT", "/reports/TS-1/profile", "u-ma", { profile });
    expect(prof.status).toBe(200);
    expect(prof.body.applicable.length).toBeGreaterThan(10);
    const tilting = prof.body.applicable.find((t: any) => t.formId === "8");
    expect(tilting.applicable).toBe(false);
    expect(tilting.reason).toMatch(/tilt/i);

    // --- live mpe, as the wizard would call it ---
    const mpeLow = await call("GET", "/reports/TS-1/mpe?load=1000", "u-ma");
    expect(mpeLow.body.mpe).toBeCloseTo(1, 9);
    const mpeHigh = await call("GET", "/reports/TS-1/mpe?load=4500", "u-ma");
    // The limit loosens mid-range as the partial range changes — R 76-1 §3.3's worked example.
    expect(mpeHigh.body.mpe).toBeCloseTo(3, 9);

    // --- an MA cannot jump the queue ---
    const jump = await call("POST", "/reports/TS-1/transition", "u-ma", { to: "LOCKED" });
    expect(jump.status).toBe(403);

    // --- observations on every applicable form ---
    const applicableForms = prof.body.applicable.filter((t: any) => t.applicable);
    for (const t of applicableForms) {
      // Each form gets rows in the shape it is printed in. Posting weighing rows into a creep
      // or a disturbance form is refused now, which is what makes this loop meaningful: it
      // used to pass because the server ran K1 on everything.
      const r = await call("POST", `/reports/TS-1/forms/${t.formId}/observations`, "u-ma", {
        testId: t.testId,
        ...payloadFor(t.formId),
      });
      expect(r.status, `form ${t.formId}`).toBe(200);
      expect(r.body.verdict).toBe("PASSED");
    }

    // --- forward through the chain ---
    expect((await call("POST", "/reports/TS-1/transition", "u-ma", { to: "OBSERVATIONS_COMPLETE" })).status).toBe(200);
    expect((await call("POST", "/reports/TS-1/transition", "u-ma", { to: "VALIDATED" })).status).toBe(200);
    expect((await call("POST", "/reports/TS-1/transition", "u-ma", { to: "SUBMITTED" })).status).toBe(200);

    // --- an MA cannot recommend their own work ---
    expect((await call("POST", "/reports/TS-1/transition", "u-ma", { to: "RECOMMENDED" })).status).toBe(403);

    // --- AD recommends; Director cannot lock without the record copy's hash ---
    expect((await call("POST", "/reports/TS-1/transition", "u-ad", { to: "RECOMMENDED" })).status).toBe(200);
    const noHash = await call("POST", "/reports/TS-1/transition", "u-dir", { to: "LOCKED" });
    expect(noHash.status).toBe(403);
    expect(noHash.body.message).toMatch(/final PDF/i);

    // --- lock, issue, publish ---
    const sha = "a".repeat(64);
    expect((await call("POST", "/reports/TS-1/transition", "u-dir", { to: "LOCKED", pdfSha256: sha })).status).toBe(200);
    expect((await call("POST", "/reports/TS-1/transition", "u-dir", { to: "CERTIFICATE_ISSUED" })).status).toBe(200);
    const published = await call("POST", "/reports/TS-1/transition", "u-dir", { to: "PUBLISHED" });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: "PUBLISHED", locked_hash: sha, overall_verdict: "PASSED" });

    // --- a published report is closed to everyone ---
    const late = await call("POST", "/reports/TS-1/forms/1/observations", "u-ma", {
      observations: [{ load: 1000, indication: 1000 }],
    });
    expect(late.status).toBe(403);
    expect(late.body.message).toMatch(/record copy/i);

    // --- and the whole history verifies ---
    const audit = await call("GET", "/reports/TS-1/audit", "u-dir");
    expect(audit.body.verification.ok).toBe(true);
    expect(audit.body.events.length).toBeGreaterThan(10);
    // Raw observations were recorded before the derived result, per ISO/IEC 17025 §7.8.
    const types = audit.body.events.map((e: any) => e.eventType);
    expect(types.indexOf("OBSERVATIONS_RECORDED")).toBeLessThan(types.indexOf("FORM_RESULT_COMPUTED"));
  });
});

describe("the deficiency loop", () => {
  beforeEach(async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-2", profile: "IN_Sch7A" });
    await call("PUT", "/reports/TS-2/profile", "u-ma", { profile });
    for (const t of ["OBSERVATIONS_COMPLETE", "VALIDATED", "SUBMITTED"]) {
      // Forms are incomplete, so the first guard blocks — record one form to get moving.
      if (t === "OBSERVATIONS_COMPLETE") {
        const applicable = (await call("GET", "/reports/TS-2", "u-ma")).body.forms.filter((f: any) => f.applicable);
        for (const f of applicable) {
          await call("POST", `/reports/TS-2/forms/${f.form_id}/observations`, "u-ma",
            payloadFor(f.form_id));
        }
      }
      await call("POST", "/reports/TS-2/transition", "u-ma", { to: t });
    }
  });

  it("sends the report back to the lab, and will not recommend it until the deficiency is closed", async () => {
    // Raising a deficiency moves the report into DEFICIENCY, whose only exit is back to the
    // recording officer (AoM Rule 8). So the deficiency guard is not what blocks the AD here
    // — the state machine is. Both matter, and they fire at different points.
    await call("POST", "/reports/TS-2/deficiencies", "u-ad", {
      id: "d1", severity: "major", formId: "1", text: "Zero-setting device not described.",
    });
    expect((await call("GET", "/reports/TS-2", "u-ad")).body.report.status).toBe("DEFICIENCY");

    const fromDeficiency = await call("POST", "/reports/TS-2/transition", "u-ad", { to: "RECOMMENDED" });
    expect(fromDeficiency.status).toBe(403);
    expect(fromDeficiency.body.message).toMatch(/Permitted next states: DRAFT/);

    // Round the loop: back to the lab, resubmitted — but the deficiency is still open, and
    // now it is the guard that refuses.
    await call("POST", "/reports/TS-2/transition", "u-ad", { to: "DRAFT" });
    await call("POST", "/reports/TS-2/transition", "u-ma", { to: "OBSERVATIONS_COMPLETE" });
    await call("POST", "/reports/TS-2/transition", "u-ma", { to: "VALIDATED" });
    await call("POST", "/reports/TS-2/transition", "u-ma", { to: "SUBMITTED" });

    const stillOpen = await call("POST", "/reports/TS-2/transition", "u-ad", { to: "RECOMMENDED" });
    expect(stillOpen.status).toBe(403);
    expect(stillOpen.body.message).toMatch(/unresolved deficiencies/i);

    await call("POST", "/reports/TS-2/deficiencies/d1/resolve", "u-ma", { resolution: "Section 4.2 added." });
    expect((await call("POST", "/reports/TS-2/transition", "u-ad", { to: "RECOMMENDED" })).status).toBe(200);
  });

  it("does not let an MA raise a deficiency on their own work", async () => {
    const r = await call("POST", "/reports/TS-2/deficiencies", "u-ma", {
      id: "d2", severity: "minor", text: "self-raised",
    });
    expect(r.status).toBe(403);
  });
});

describe("the freeze point (F1): SUBMITTED and every later state is read-only for every role", () => {
  // AD-02 / MA-02: an AD could edit a RECOMMENDED, twice-signed report's instrument profile,
  // and an MA's POST to /observations on a RECOMMENDED report returned 200 and silently
  // flipped the recorded verdict. Root cause was `canWriteReport`'s CLOSED list (rbac.ts) only
  // covering LOCKED and beyond. The product decision (AoM Rule 8): once a report is submitted,
  // a correction happens only by moving it back down the chain (deficiency -> DRAFT, remit ->
  // DRAFT) — never by writing report data in place while it is under review, whatever the
  // caller's role. All three report-data write routes (profile, observations, checklist) go
  // through the one `canWriteReport` guard in service.ts, so this is tested once per route,
  // across every role, rather than once per role.
  async function walkToSubmitted(reportId: string) {
    await call("POST", "/reports", "u-ma", { reportId, profile: "IN_Sch7A" });
    await call("PUT", `/reports/${reportId}/profile`, "u-ma", { profile });
    const applicable = (await call("GET", `/reports/${reportId}`, "u-ma")).body.forms.filter(
      (f: any) => f.applicable,
    );
    for (const f of applicable) {
      await call("POST", `/reports/${reportId}/forms/${f.form_id}/observations`, "u-ma", payloadFor(f.form_id));
    }
    await call("POST", `/reports/${reportId}/transition`, "u-ma", { to: "OBSERVATIONS_COMPLETE" });
    await call("POST", `/reports/${reportId}/transition`, "u-ma", { to: "VALIDATED" });
    await call("POST", `/reports/${reportId}/transition`, "u-ma", { to: "SUBMITTED" });
  }

  for (const role of ["u-ma", "u-ad", "u-dir"]) {
    it(`refuses ${role} writing the profile, observations and checklist on a SUBMITTED report`, async () => {
      const id = `TS-FREEZE-${role}`;
      await walkToSubmitted(id);
      expect((await call("GET", `/reports/${id}`, role)).body.report.status).toBe("SUBMITTED");

      const profileWrite = await call("PUT", `/reports/${id}/profile`, role, { profile });
      expect(profileWrite.status, "profile write").toBe(403);
      expect(profileWrite.body.message).toMatch(/Submitted to the AD\/DD/i);

      const obsWrite = await call("POST", `/reports/${id}/forms/1/observations`, role, {
        observations: [{ load: 1000, indication: 1000 }],
      });
      expect(obsWrite.status, "observations write").toBe(403);
      expect(obsWrite.body.message).toMatch(/Submitted to the AD\/DD/i);

      const checklistWrite = await call("POST", `/reports/${id}/checklist`, role, {
        checklistId: "17.1",
        answers: [{ index: 0, answer: "yes" }],
      });
      expect(checklistWrite.status, "checklist write").toBe(403);
      expect(checklistWrite.body.message).toMatch(/Submitted to the AD\/DD/i);
    });
  }

  it("gives a state-specific, human-readable reason at DEFICIENCY, RECOMMENDED and REMITTED — not a capability name (DIR-09)", async () => {
    await walkToSubmitted("TS-FREEZE-DEF");
    await call("POST", "/reports/TS-FREEZE-DEF/deficiencies", "u-ad", {
      id: "fd1", severity: "minor", text: "example",
    });
    const defWrite = await call("PUT", "/reports/TS-FREEZE-DEF/profile", "u-ma", { profile });
    expect(defWrite.status).toBe(403);
    expect(defWrite.body.message).toMatch(/returned to the lab/i);
    expect(defWrite.body.message).not.toMatch(/lacks capability/i);

    await walkToSubmitted("TS-FREEZE-REC");
    await call("POST", "/reports/TS-FREEZE-REC/transition", "u-ad", { to: "RECOMMENDED" });
    const recWrite = await call("PUT", "/reports/TS-FREEZE-REC/profile", "u-ad", { profile });
    expect(recWrite.status).toBe(403);
    expect(recWrite.body.message).toMatch(/Recommended to the Director/i);
    expect(recWrite.body.message).not.toMatch(/lacks capability/i);

    await walkToSubmitted("TS-FREEZE-REM");
    await call("POST", "/reports/TS-FREEZE-REM/transition", "u-ad", { to: "RECOMMENDED" });
    await call("POST", "/reports/TS-FREEZE-REM/transition", "u-dir", { to: "REMITTED" });
    const remWrite = await call("PUT", "/reports/TS-FREEZE-REM/profile", "u-ma", { profile });
    expect(remWrite.status).toBe(403);
    expect(remWrite.body.message).toMatch(/Remitted by the Director/i);
  });

  it("a role with no report-data capability at all (DIRECTOR) still gets the state reason first, on an open report", async () => {
    // Even on a DRAFT report — where the state itself is not frozen — a DIRECTOR cannot write
    // report data at all, and the message should read as a role description, not a raw
    // capability name (DIR-09).
    await call("POST", "/reports", "u-ma", { reportId: "TS-FREEZE-DIR", profile: "IN_Sch7A" });
    const r = await call("PUT", "/reports/TS-FREEZE-DIR/profile", "u-dir", { profile });
    expect(r.status).toBe(403);
    expect(r.body.message).not.toMatch(/lacks capability/i);
    expect(r.body.message).toMatch(/does not record or edit report data/i);
  });

  it("still allows writes in DRAFT, OBSERVATIONS_COMPLETE and VALIDATED — the freeze starts at SUBMITTED, not earlier", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-FREEZE-OPEN", profile: "IN_Sch7A" });
    expect((await call("PUT", "/reports/TS-FREEZE-OPEN/profile", "u-ma", { profile })).status).toBe(200);

    const applicable = (await call("GET", "/reports/TS-FREEZE-OPEN", "u-ma")).body.forms.filter(
      (f: any) => f.applicable,
    );
    for (const f of applicable) {
      const r = await call(
        "POST", `/reports/TS-FREEZE-OPEN/forms/${f.form_id}/observations`, "u-ma", payloadFor(f.form_id),
      );
      expect(r.status, `form ${f.form_id}`).toBe(200);
    }
    expect((await call("POST", "/reports/TS-FREEZE-OPEN/transition", "u-ma", { to: "OBSERVATIONS_COMPLETE" })).status).toBe(200);
    // Still writable in OBSERVATIONS_COMPLETE.
    expect((await call("PUT", "/reports/TS-FREEZE-OPEN/profile", "u-ma", { profile })).status).toBe(200);
    expect((await call("POST", "/reports/TS-FREEZE-OPEN/transition", "u-ma", { to: "VALIDATED" })).status).toBe(200);
    // Still writable in VALIDATED.
    expect((await call("PUT", "/reports/TS-FREEZE-OPEN/profile", "u-ma", { profile })).status).toBe(200);
  });
});

describe("tenancy", () => {
  beforeEach(async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-FBD", profile: "IN_Sch7A" });
  });

  it("hides another laboratory's report from an MA", async () => {
    const r = await call("GET", "/reports/TS-FBD", "u-blr");
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Rule 16\(2\)/);
  });

  it("lets the Director read across laboratories", async () => {
    expect((await call("GET", "/reports/TS-FBD", "u-dir")).status).toBe(200);
  });

  it("scopes a listing to the caller's own lab, whatever they ask for", async () => {
    await call("POST", "/reports", "u-blr", { reportId: "TS-BLR", profile: "IN_Sch7A" });
    const r = await app.inject({ method: "GET", url: "/reports?labId=lab-fbd", headers: as("u-blr") });
    const ids = (r.json() as any[]).map((x) => x.id);
    expect(ids).toEqual(["TS-BLR"]);
  });
});

describe("guards and errors", () => {
  it("refuses observations before a profile exists", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-3", profile: "IN_Sch7A" });
    const r = await call("POST", "/reports/TS-3/forms/1/observations", "u-ma", {
      observations: [{ load: 1000, indication: 1000 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/mpe cannot be resolved/i);
  });

  it("rejects an out-of-range load before appending anything to the log, with the real error code (AD-05 / F9)", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-8", profile: "IN_Sch7A" });
    await call("PUT", "/reports/TS-8/profile", "u-ma", { profile });
    const before = await call("GET", "/reports/TS-8/audit", "u-ma");
    const eventsBefore = before.body.events.length;

    // 20000 g is comfortably past this profile's overall Max (15000 g). Sent as a STRING,
    // the way a browser <input> control's value arrives over JSON: this is exactly what used
    // to make the finiteness check fail first, so a genuinely finite, out-of-range reading was
    // logged as E_NON_FINITE_VALUE rather than E_LOAD_ABOVE_MAX (AD-05).
    const r = await call("POST", "/reports/TS-8/forms/1/observations", "u-ma", {
      observations: [{ load: "20000", indication: "20000" }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("E_LOAD_ABOVE_MAX");
    expect(r.body.error).not.toBe("E_NON_FINITE_VALUE");
    expect(r.body.message).toMatch(/exceeds the instrument's Max/i);

    // Nothing was appended for the rejected attempt — the log is exactly as it was.
    const after = await call("GET", "/reports/TS-8/audit", "u-ma");
    expect(after.body.events.length).toBe(eventsBefore);
  });

  it("still records a genuinely finite, in-range reading sent as a numeric string (coerced, not rejected)", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-8b", profile: "IN_Sch7A" });
    await call("PUT", "/reports/TS-8b/profile", "u-ma", { profile });
    const before = await call("GET", "/reports/TS-8b/audit", "u-ma");
    const eventsBefore = before.body.events.length;

    const r = await call("POST", "/reports/TS-8b/forms/1/observations", "u-ma", {
      observations: [{ load: "1000", indication: "1000" }],
    });
    expect(r.status).toBe(200);

    // Both the raw observation and the computed result were appended, in that order.
    const after = await call("GET", "/reports/TS-8b/audit", "u-ma");
    expect(after.body.events.length).toBe(eventsBefore + 2);
    const types = after.body.events.slice(eventsBefore).map((e: any) => e.eventType);
    expect(types).toEqual(["OBSERVATIONS_RECORDED", "FORM_RESULT_COMPUTED"]);
  });

  it("404s an unknown report", async () => {
    expect((await call("GET", "/reports/nope", "u-ma")).status).toBe(404);
  });

  it("refuses a duplicate report id", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-4", profile: "IN_Sch7A" });
    const r = await call("POST", "/reports", "u-ma", { reportId: "TS-4", profile: "IN_Sch7A" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("DUPLICATE_REPORT");
  });

  it("refuses a negative testing fee (MA-05) but accepts zero and a positive amount", async () => {
    const negative = await call("POST", "/reports", "u-ma", {
      reportId: "TS-FEE-NEG", profile: "IN_Sch7A", feePaidInr: -1,
    });
    expect(negative.status).toBe(400);
    expect(negative.body.error).toBe("E_NEGATIVE_FEE");

    expect((await call("POST", "/reports", "u-ma", {
      reportId: "TS-FEE-ZERO", profile: "IN_Sch7A", feePaidInr: 0,
    })).status).toBe(200);
    expect((await call("POST", "/reports", "u-ma", {
      reportId: "TS-FEE-OK", profile: "IN_Sch7A", feePaidInr: 25000,
    })).status).toBe(200);
  });

  it("409s a concurrent edit rather than overwriting it", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-5", profile: "IN_Sch7A" });
    await call("PUT", "/reports/TS-5/profile", "u-ma", { profile, expectedVersion: 1 });
    // A second officer still holding version 1 tries to write.
    const r = await call("PUT", "/reports/TS-5/profile", "u-ad", { profile, expectedVersion: 1 });
    expect(r.status).toBe(409);
  });

  it("rejects a non-numeric load on the mpe preview", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-6", profile: "IN_Sch7A" });
    await call("PUT", "/reports/TS-6/profile", "u-ma", { profile });
    expect((await call("GET", "/reports/TS-6/mpe?load=abc", "u-ma")).status).toBe(400);
  });

  it("surfaces validation findings without refusing the write", async () => {
    // An officer must be able to see why a profile is wrong while they type; refusing the
    // write would lose what they entered. The lifecycle guard is what blocks progress.
    await call("POST", "/reports", "u-ma", { reportId: "TS-7", profile: "IN_Sch7A" });
    const r = await call("PUT", "/reports/TS-7/profile", "u-ma", {
      profile: {
        ...profile,
        // e = 3 is not of the form 1/2/5 x 10^k.
        ranges: [{ e: 3, d: 3, max: 3000, min: 60, n: 1000 }],
        rangeKind: "single",
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.issues.some((i: any) => i.severity === "error")).toBe(true);
  });
});

describe("the checksum audit, across reports", () => {
  it("catches the same checksum reused by a different manufacturer", async () => {
    // The national register contains one value shared by two manufacturers
    // (docs/certificates/certificates-analysis.md). A per-report check cannot see that.
    const shared = "e24a8d3c12b7f5a89e1b";

    await call("POST", "/reports", "u-ma", { reportId: "TS-A", profile: "IN_Sch7A" });
    await call("PUT", "/reports/TS-A/profile", "u-ma", {
      profile: { ...profile, manufacturer: "Manufacturer One", softwareChecksum: shared },
    });

    await call("POST", "/reports", "u-ma", { reportId: "TS-B", profile: "IN_Sch7A" });
    const second = await call("PUT", "/reports/TS-B/profile", "u-ma", {
      profile: { ...profile, manufacturer: "Manufacturer Two", softwareChecksum: shared },
    });

    const codes = second.body.issues.map((i: any) => i.code).join(" ");
    expect(codes).toMatch(/DUPLICATE/i);
  });

  it("flags a file size entered where a checksum belongs", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-C", profile: "IN_Sch7A" });
    const r = await call("PUT", "/reports/TS-C/profile", "u-ma", {
      profile: { ...profile, softwareChecksum: "8100kb" },
    });
    expect(r.body.issues.map((i: any) => i.code).join(" ")).toMatch(/FILESIZE/i);
  });
});

describe("family solver over HTTP", () => {
  it("returns R 76-1 Table 8's EUT set", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-F", profile: "IN_Sch7A" });
    const r = await call("POST", "/reports/TS-F/family", "u-ma", {
      variants: [
        { id: "1.1", family: "1", accuracyClass: "II", max: 200, e: 0.01, d: 0.001, n: 20000, unit: "g" },
        { id: "1.2", family: "1", accuracyClass: "II", max: 400, e: 0.01, d: 0.001, n: 40000, unit: "g" },
        { id: "1.3", family: "1", accuracyClass: "II", max: 2000, e: 0.05, d: 0.05, n: 40000, unit: "g" },
        { id: "2.1", family: "2", accuracyClass: "III", max: 1500, e: 0.5, d: 0.5, n: 3000, unit: "g" },
        { id: "2.2", family: "2", accuracyClass: "III", max: 3000, e: 1, d: 1, n: 3000, unit: "g" },
        { id: "2.3", family: "2", accuracyClass: "III", max: 5000, e: 2, d: 2, n: 2500, unit: "g" },
        { id: "2.4", family: "2", accuracyClass: "III", max: 15000, e: 5, d: 5, n: 3000, unit: "g" },
        { id: "2.5", family: "2", accuracyClass: "III", max: 60000, e: 20, d: 20, n: 3000, unit: "g" },
      ],
    });
    const euts = r.body.selections.filter((s: any) => s.eut).map((s: any) => s.variant.id);
    expect(euts).toEqual(["1.2", "2.1", "2.4"]);
    expect(r.body.coverageClause).toMatch(/shall also cover/i);
  });
});

describe("statutory returns", () => {
  it("scopes the Rule 4(9) return to the caller's lab and refuses the national roll-up to an MA", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-S1", profile: "IN_Sch7A", feePaidInr: 25000 });
    const own = await call("GET", "/stats/rule-4-9?from=2026-01-01&to=2026-12-31", "u-ma");
    expect(own.body.labId).toBe("lab-fbd");
    expect(own.body.feesRealisedInr).toBe(25000);
    expect(own.body.caveats.length).toBeGreaterThan(0);

    expect((await call("GET", "/stats/rule-4-9?scope=national", "u-ma")).status).toBe(403);
    expect((await call("GET", "/stats/rule-4-9?scope=national", "u-dir")).status).toBe(200);
  });

  it("serves dashboard counts", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-D1", profile: "IN_Sch7A" });
    const r = await call("GET", "/dashboard", "u-ma");
    expect(r.body.total).toBe(1);
    expect(r.body.inProcess).toBe(1);
  });
});

describe("admin", () => {
  it("rebuilds projections only for an administrator", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "TS-R", profile: "IN_Sch7A" });
    expect((await call("POST", "/admin/rebuild-projections", "u-ma")).status).toBe(403);
    expect((await call("POST", "/admin/rebuild-projections", "u-dir")).status).toBe(403);

    db.prepare("INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)").run(
      "u-admin", "lab-fbd", "ADMIN", "Sys Admin", "admin@x.gov.in", T,
    );
    const r = await call("POST", "/admin/rebuild-projections", "u-admin");
    expect(r.status).toBe(200);
    expect(r.body.rebuilt).toBe(1);
  });
});
