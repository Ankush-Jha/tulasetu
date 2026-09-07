/**
 * Rendering and locking.
 *
 * The claims worth testing here are that the document reproduces what was *recorded* rather
 * than what today's engine would recompute, that a report is never presented as more complete
 * than it is, and that locking cannot be separated from the render whose hash it records.
 *
 * The PDF path needs Chromium. Rather than skip when it is absent, the suite asserts the
 * fallback is a clear 503 with instructions — a laboratory server without a browser is a real
 * deployment, not a broken one.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InstrumentProfile, RulePack } from "@tulasetu/engine";

import { openMemoryDb, type Db } from "../src/db/open.js";
import { registerRoutes } from "../src/routes.js";
import { buildReportDocument } from "../src/domain/render.js";

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
  serialNumber: "EX15-2026-0042",
  softwareChecksum: "34559a18232bc0c6c417", // well-formed; the defective case is tested below
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

let db: Db;
let app: FastifyInstance;

async function call(method: "GET" | "POST" | "PUT", url: string, userId: string, payload?: unknown) {
  const res = await app.inject({
    method, url, headers: { "x-user-id": userId },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return res;
}

beforeEach(async () => {
  db = openMemoryDb();
  db.prepare("INSERT INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)").run(
    "lab-fbd", "RRSL Faridabad", "RRSL", "09", 1, T,
  );
  const u = db.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  u.run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@x.gov.in", T);
  u.run("u-ad", "lab-fbd", "AD", "B. Deputy", "ad@x.gov.in", T);
  u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director", "dir@x.gov.in", T);

  app = Fastify();
  registerRoutes(app, { db, pack, now: () => T });
  await app.ready();

  await call("POST", "/reports", "u-ma", { reportId: "R1", profile: "IN_Sch7A", applicationNo: "MA/2026/9" });
  await call("PUT", "/reports/R1/profile", "u-ma", { profile });
});

afterEach(async () => {
  await app.close();
});

/** Record every applicable form so the report can reach a lockable state. */
async function recordEverything() {
  const detail = (await call("GET", "/reports/R1", "u-ma")).json();
  for (const f of detail.forms.filter((x: any) => x.applicable === 1)) {
    await call("POST", `/reports/R1/forms/${f.form_id}/observations`, "u-ma", {
      testId: f.test_id,
      observations: [
        { load: 0, indication: 0, additionalLoad: 0, label: "zero" },
        { load: 1000, indication: 1000, additionalLoad: 0 },
        { load: 4500, indication: 4500, additionalLoad: 0 },
      ],
    });
  }
}

// ---------------------------------------------------------------------------

describe("the render model", () => {
  it("carries what was recorded, not a recomputation", async () => {
    await call("POST", "/reports/R1/forms/1/observations", "u-ma", {
      observations: [
        { load: 0, indication: 0, additionalLoad: 0 },
        { load: 4500, indication: 4500, additionalLoad: 0 },
      ],
    });
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });

    const form1 = doc.forms.find((f) => f.formId === "1")!;
    expect(form1.verdict).toBe("PASSED");
    expect(form1.rows).toHaveLength(2);
    // 4500 g sits in partial range 2 (e = 2 g), where class III's +/-1.5e band applies.
    expect(form1.rows[1]!.some((c) => c.value.includes("3"))).toBe(true);
  });

  it("marks an applicable-but-unrecorded form NA with an honest reason", async () => {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });
    const form1 = doc.forms.find((f) => f.formId === "1")!;
    expect(form1.verdict).toBe("NA");
    expect(form1.notApplicableReason).toMatch(/no observations have been recorded/i);
  });

  it("keeps the engine's own reason on a form that does not apply", async () => {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });
    const tilting = doc.forms.find((f) => f.formId === "8")!;
    expect(tilting.verdict).toBe("NA");
    expect(tilting.notApplicableReason).toMatch(/tilt/i);
  });

  it("carries the software-identification finding onto the report", async () => {
    // Certificate #100 on the national register carries "8100kb" in the checksum field — a
    // file size, not a checksum (docs/certificates/certificates-analysis.md).
    await call("PUT", "/reports/R1/profile", "u-ma", {
      profile: { ...profile, softwareChecksum: "8100kb" },
    });
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });
    expect(doc.instrument.softwareIdentificationIssues?.[0]?.code).toMatch(/FILESIZE/i);
  });

  it("says so, in the document, when the report is not locked", async () => {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });
    expect(doc.draft).toBe(true);
    expect(doc.caveats?.join(" ")).toMatch(/not locked/i);
  });

  it("reports a broken audit chain in the document rather than rendering silently", async () => {
    db.exec("DROP TRIGGER report_events_no_update");
    db.prepare("UPDATE report_events SET payload = ? WHERE report_id = ? AND version = 2").run(
      JSON.stringify({ tampered: true }), "R1",
    );
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });
    expect(doc.audit?.chainVerified).toBe(false);
    expect(doc.caveats?.join(" ")).toMatch(/does not verify/i);
  });

  it("names the officers who took each step, from the log", async () => {
    await recordEverything();
    for (const to of ["OBSERVATIONS_COMPLETE", "VALIDATED", "SUBMITTED"]) {
      await call("POST", "/reports/R1/transition", "u-ma", { to });
    }
    await call("POST", "/reports/R1/transition", "u-ad", { to: "RECOMMENDED" });

    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });
    const roles = (doc.signatures ?? []).map((s) => s.name);
    expect(roles).toContain("A. Assistant");
    expect(roles).toContain("B. Deputy");
  });

  it("is reproducible — two renders of an unchanged report are identical", async () => {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const a = buildReportDocument(db, report, { generatedAt: T });
    const b = buildReportDocument(db, report, { generatedAt: T });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("the checksum audit has teeth", () => {
  // The point of validating R 76-1 Annex G's software-identification field is not to print a
  // warning — it is to stop a report carrying a value that is not a checksum from being
  // recommended. An error-severity finding fails the `no_blocking_validation_issues` guard.
  it("blocks validation when the checksum field holds a file size", async () => {
    await call("PUT", "/reports/R1/profile", "u-ma", {
      profile: { ...profile, softwareChecksum: "8100kb" },
    });
    await recordEverything();
    expect((await call("POST", "/reports/R1/transition", "u-ma", { to: "OBSERVATIONS_COMPLETE" })).statusCode).toBe(200);

    const blocked = await call("POST", "/reports/R1/transition", "u-ma", { to: "VALIDATED" });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().message).toMatch(/validation/i);
  });

  it("blocks it for a modulus entered as a checksum, and lets a well-formed value through", async () => {
    // Certificate #349 carries "65536" — the modulus, not a value.
    await call("PUT", "/reports/R1/profile", "u-ma", {
      profile: { ...profile, softwareChecksum: "65536" },
    });
    await recordEverything();
    await call("POST", "/reports/R1/transition", "u-ma", { to: "OBSERVATIONS_COMPLETE" });
    expect((await call("POST", "/reports/R1/transition", "u-ma", { to: "VALIDATED" })).statusCode).toBe(403);

    await call("PUT", "/reports/R1/profile", "u-ma", {
      profile: { ...profile, softwareChecksum: "34559a18232bc0c6c417" },
    });
    await recordEverything();
    await call("POST", "/reports/R1/transition", "u-ma", { to: "OBSERVATIONS_COMPLETE" });
    expect((await call("POST", "/reports/R1/transition", "u-ma", { to: "VALIDATED" })).statusCode).toBe(200);
  });
});

describe("download", () => {
  it("serves HTML with the standard's page furniture", async () => {
    const res = await call("GET", "/reports/R1/render/html", "u-ma");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.headers["x-tulasetu-sha256"]).toHaveLength(64);
    const html = res.body;
    expect(html).toContain("Type Evaluation Test Report");
    expect(html).toContain("– –"); // the not-applicable mark
    expect(html).toContain("EX-15 MI");
  });

  it("serves a DOCX that is a real zip container", async () => {
    const res = await call("GET", "/reports/R1/render/docx", "u-ma");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/wordprocessingml/);
    // "PK" — the zip magic every OOXML file begins with.
    expect(res.rawPayload.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("serves JSON that states its own determinism", async () => {
    const res = await call("GET", "/reports/R1/render/json", "u-ma");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provenance.determinism).toMatch(/No machine-learning model/i);
    expect(body.provenance.rulesetId).toBe("OIML_R76_2006");
    expect(body.report.identity.reportId).toBe("R1");
    expect(body.dataSha256).toHaveLength(64);
  });

  it("offers the file as an attachment by default, inline on request", async () => {
    const dl = await call("GET", "/reports/R1/render/html", "u-ma");
    expect(dl.headers["content-disposition"]).toMatch(/^attachment/);
    const inline = await call("GET", "/reports/R1/render/html?inline=1", "u-ma");
    expect(inline.headers["content-disposition"]).toMatch(/^inline/);
  });

  it("rejects an unknown format", async () => {
    const res = await call("GET", "/reports/R1/render/xlsx", "u-ma");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("BAD_FORMAT");
  });

  it("records every render in the append-only log", async () => {
    await call("GET", "/reports/R1/render/html", "u-ma");
    const audit = (await call("GET", "/reports/R1/audit", "u-ma")).json();
    const rendered = audit.events.filter((e: any) => e.eventType === "REPORT_RENDERED");
    expect(rendered).toHaveLength(1);
    expect(rendered[0].payload.format).toBe("html");
    expect(rendered[0].payload.sha256).toHaveLength(64);
    // And the chain still verifies after the write.
    expect(audit.verification.ok).toBe(true);
  });

  it("does not let another laboratory download the report", async () => {
    db.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)").run("lab-x", "Other", "RRSL", T);
    db.prepare(
      "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
    ).run("u-x", "lab-x", "MA", "X", "x@x.gov.in", T);
    const res = await call("GET", "/reports/R1/render/html", "u-x");
    expect(res.statusCode).toBe(403);
  });
});

describe("lock", () => {
  it("refuses to lock a report whose forms are incomplete", async () => {
    const res = await call("POST", "/reports/R1/lock", "u-dir");
    expect(res.statusCode).toBe(403);
  });

  it("refuses to lock for a role without the capability", async () => {
    await recordEverything();
    for (const to of ["OBSERVATIONS_COMPLETE", "VALIDATED", "SUBMITTED"]) {
      await call("POST", "/reports/R1/transition", "u-ma", { to });
    }
    await call("POST", "/reports/R1/transition", "u-ad", { to: "RECOMMENDED" });

    const res = await call("POST", "/reports/R1/lock", "u-ma");
    expect(res.statusCode).toBe(403);
  });

  it("renders and locks in one step, recording the hash of the copy produced", async () => {
    await recordEverything();
    for (const to of ["OBSERVATIONS_COMPLETE", "VALIDATED", "SUBMITTED"]) {
      await call("POST", "/reports/R1/transition", "u-ma", { to });
    }
    await call("POST", "/reports/R1/transition", "u-ad", { to: "RECOMMENDED" });

    const res = await call("POST", "/reports/R1/lock", "u-dir");

    // Chromium may be absent on a laboratory server; that is a deployment fact, not a bug,
    // and it must surface as an actionable message rather than a 500.
    if (res.statusCode === 503) {
      expect(res.json().error).toBe("RENDERER_UNAVAILABLE");
      expect(res.json().message).toMatch(/playwright install chromium/i);
      return;
    }

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sha256).toHaveLength(64);
    expect(body.report.status).toBe("LOCKED");
    expect(body.report.locked_hash).toBe(body.sha256);

    // A locked report is closed to everyone, and the DOCX now names the record copy.
    const late = await call("POST", "/reports/R1/forms/1/observations", "u-ma", {
      observations: [{ load: 1000, indication: 1000 }],
    });
    expect(late.statusCode).toBe(403);

    const docx = await call("GET", "/reports/R1/render/docx", "u-dir");
    expect(docx.statusCode).toBe(200);
  });
});

/**
 * Nothing that is not a number, a word or a blank may reach a printed report.
 *
 * A rendered report is the legal basis for a model approval. An earlier version emitted form
 * 1's column shape for every form, so a `{ "↓": …, "↑": … }` pair landed in a column that
 * expected a scalar and printed as "[object Object]" across several pages of the PDF. These
 * tests exist so that class of defect cannot come back quietly.
 */
describe("no programmer artefacts on a printed report", () => {
  const FORBIDDEN = [
    "[object Object]",
    "undefined",
    "NaN",
    "[object",
    "null",
  ];

  it("renders every form of a fully recorded report without a single artefact", async () => {
    await recordEverything();
    const html = (await call("GET", "/reports/R1/render/html", "u-ma")).body;

    for (const bad of FORBIDDEN) {
      expect(html.includes(bad), `rendered HTML contains ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("keeps the artefacts out of the machine-readable output too", async () => {
    await recordEverything();
    const body = (await call("GET", "/reports/R1/render/json", "u-ma")).json();

    // Check the report data, not the whole payload: the embedded PDF is base64, and an
    // arbitrary byte sequence contains "NaN" often enough to make a substring search on the
    // raw body meaningless.
    const data = JSON.stringify(body.report);
    expect(data.includes("[object Object]")).toBe(false);
    expect(data.includes("NaN")).toBe(false);
    expect(data.includes("undefined")).toBe(false);
  });

  it("gives a sub-columned column its pair, and a plain column a scalar", async () => {
    await call("POST", "/reports/R1/forms/1/observations", "u-ma", {
      observations: [{ load: 1000, indication: 1000, additionalLoad: 0 }],
    });
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });

    // Form 1 splits Indication into ↓ and ↑, so it contributes two cells, not one.
    const form1 = doc.forms.find((f) => f.formId === "1")!;
    const indication = form1.columns.find((c) => c.key === "indication")!;
    expect(indication.subcolumns).toEqual(["↓", "↑"]);

    // Every cell is a rendered string; none of them is an object's toString.
    for (const row of form1.rows) {
      for (const cell of row) {
        expect(typeof cell.value).toBe("string");
        expect(cell.value).not.toContain("object");
      }
    }
    // Column count and cell count agree once sub-columns are expanded.
    const expected = form1.columns.reduce((n, c) => n + (c.subcolumns?.length || 1), 0);
    expect(form1.rows[0]).toHaveLength(expected);
  });

  it("leaves a column the observations cannot fill blank rather than guessing", async () => {
    // Form 11 (voltage variations) shares Load and Indication with the weighing test but adds a
    // supply-voltage column that weighing observations say nothing about.
    await call("POST", "/reports/R1/forms/11/observations", "u-ma", {
      observations: [{ load: 1000, indication: 1000, additionalLoad: 0 }],
    });
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get("R1") as any;
    const doc = buildReportDocument(db, report, { generatedAt: T });

    const form11 = doc.forms.find((f) => f.formId === "11");
    if (!form11 || form11.verdict === "NA") return; // not applicable to this instrument

    const voltageIndex = form11.columns.findIndex((c) => c.key === "voltage");
    expect(voltageIndex).toBeGreaterThanOrEqual(0);
    expect(form11.rows[0]![voltageIndex]!.value).toBe("");
  });
});
