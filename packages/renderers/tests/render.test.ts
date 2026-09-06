/**
 * Renderer tests.
 *
 * These assert the things a metrology reader would check by eye, and that a refactor could
 * silently break: that a not-applicable form still prints, marked "– –" with its reason; that
 * computed cells are distinguishable from entered ones; that the DRAFT watermark tracks the
 * report's lock state rather than a flag someone remembered to pass; and that a multi-interval
 * instrument's capacity is written the way the standard writes it.
 *
 * The HTML renderer is pure string building, so all of this runs without a browser.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleReport, describeClass, describeInstrument, type FormsFile } from "../src/assemble.js";
import { renderHtml, esc } from "../src/html.js";
import { renderJson, canonicalHash } from "../src/json.js";
import { NOT_APPLICABLE_MARK, type ReportDocument } from "../src/model.js";
import type { InstrumentProfile } from "@tulasetu/engine";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The real transcribed forms file — not a fixture, so a bad transcription fails here. */
const formsFile = JSON.parse(
  readFileSync(join(HERE, "../../rulepacks/forms/R76-2_2007_forms.json"), "utf8"),
) as FormsFile;

/** R 76-1 §3.3's worked example: Max 2/5/15 kg, e 1/2/10 g, class III. */
const multiInterval: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  manufacturer: "Example Instruments Pvt Ltd",
  model: "EX-15",
  serialNumber: "SN-0001",
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

const lab = { name: "RRSL Faridabad", kind: "RRSL", labCode: "09", nablAccredited: true };

function buildDoc(overrides: Partial<Parameters<typeof assembleReport>[0]> = {}): ReportDocument {
  return assembleReport({
    reportId: "TS-2026-0001",
    profile: "IN_Sch7A",
    rulesetId: "OIML_R76_2006",
    edition: "2007-report-format",
    status: "DRAFT",
    lab,
    instrument: multiInterval,
    generatedAt: "2026-09-07T00:00:00Z",
    formsFile,
    forms: [
      {
        formId: "1",
        applicable: true,
        verdict: "PASSED",
        environment: [
          { checkpoint: "At start", temperatureC: 21.4, relativeHumidityPct: 52 },
          { checkpoint: "At max", temperatureC: 21.9, relativeHumidityPct: 53 },
          { checkpoint: "At end", temperatureC: 21.5, relativeHumidityPct: 52 },
        ],
        rows: [
          { load: 0, indication: { "↓": 0, "↑": 0 }, error: { "↓": 0, "↑": 0 }, mpe: 0.5 },
          { load: 1000, indication: { "↓": 1000, "↑": 1000 }, error: { "↓": 0.5, "↑": 0.5 }, mpe: 1 },
          { load: 4500, indication: { "↓": 4500, "↑": 4500 }, error: { "↓": 1, "↑": 1 }, mpe: 3 },
        ],
      },
      {
        formId: "8",
        applicable: false,
        verdict: "NA",
        notApplicableReason:
          "Tilting does not apply: the instrument is not tiltable in normal use (R 76-2 form 8).",
      },
    ],
    ...overrides,
  });
}

describe("assembleReport", () => {
  it("carries the standard's own column labels rather than inventing them", () => {
    const doc = buildDoc();
    const form1 = doc.forms.find((f) => f.formId === "1")!;
    expect(form1.title).toBe("Weighing performance");
    // Form 1 splits Indication/Error into down- and up-arrow sub-columns for the two
    // directions of loading. Losing that would change what the form means.
    const indication = form1.columns.find((c) => c.key === "indication")!;
    expect(indication.subcolumns).toEqual(["↓", "↑"]);
  });

  it("prints a not-applicable form rather than dropping it, and keeps the reason", () => {
    const doc = buildDoc();
    const form8 = doc.forms.find((f) => f.formId === "8")!;
    expect(form8.verdict).toBe("NA");
    expect(form8.notApplicableReason).toContain("not tiltable");
    expect(doc.summary.find((s) => s.formId === "8")?.verdict).toBe("NA");
  });

  it("does not let a not-applicable form drag the overall verdict down", () => {
    expect(buildDoc().overallVerdict).toBe("PASSED");
  });

  it("fails the whole report when any applicable form fails", () => {
    const doc = buildDoc({
      forms: [
        { formId: "1", applicable: true, verdict: "FAILED", rows: [] },
        { formId: "8", applicable: false, verdict: "NA", notApplicableReason: "not tiltable" },
      ],
    });
    expect(doc.overallVerdict).toBe("FAILED");
  });

  it("leaves the verdict open while a form is still unmarked, rather than passing by default", () => {
    const doc = buildDoc({
      forms: [
        { formId: "1", applicable: true, verdict: "PASSED", rows: [] },
        // Applicable but not yet computed.
        { formId: "5", applicable: true, verdict: undefined as never, rows: [] },
      ],
    });
    expect(doc.overallVerdict).toBeNull();
  });

  it("marks a failing cell so the reader can see which number failed", () => {
    const doc = buildDoc({
      forms: [
        {
          formId: "1",
          applicable: true,
          verdict: "FAILED",
          rows: [{ load: 4500, indication: { "↓": 4512 }, error: { "↓": 12 }, mpe: 3 }],
          failedCells: [{ rowIndex: 0, keys: ["error"] }],
        },
      ],
    });
    const cells = doc.forms[0]!.rows[0]!;
    expect(cells.some((c) => c.failed)).toBe(true);
  });

  it("draft is derived from the lifecycle state, not passed in by hand", () => {
    expect(buildDoc({ status: "DRAFT" }).draft).toBe(true);
    expect(buildDoc({ status: "SUBMITTED" }).draft).toBe(true);
    expect(buildDoc({ status: "LOCKED" }).draft).toBe(false);
    expect(buildDoc({ status: "PUBLISHED" }).draft).toBe(false);
  });
});

describe("describeInstrument", () => {
  it("writes a multi-interval capacity the way R 76-1 §3.3 writes it", () => {
    const d = describeInstrument(multiInterval);
    expect(d.maxCapacityText).toBe("2000 / 5000 / 15000 g");
    expect(d.scaleIntervalText).toBe("1 / 2 / 10 g");
    expect(d.nText).toBe("n1 = 2000, n2 = 2500, n3 = 1500");
  });

  it("writes a multiple-range instrument as independent ranges, not as one slashed capacity", () => {
    // R 76-1 §3.2: each range is treated as if it were an instrument with one range, so the
    // two cases must not be printed identically.
    const d = describeInstrument({
      ...multiInterval,
      rangeKind: "multiple-range",
      ranges: [
        { e: 1, d: 1, max: 3000, min: 20, n: 3000 },
        { e: 5, d: 5, max: 15000, min: 100, n: 3000 },
      ],
    });
    expect(d.maxCapacityText).toContain("range 1");
    expect(d.maxCapacityText).toContain("range 2");
    expect(d.maxCapacityText).not.toBe("3000 / 15000 g");
  });
});

describe("describeClass", () => {
  it("shows both spellings of the ordinary class", () => {
    // India's Seventh Schedule writes IV in its tables and IIII in its test procedures, in the
    // same document. Printing only one leaves the report ambiguous to the reader who cares.
    const s = describeClass("IIII");
    expect(s).toContain("IIII");
    expect(s).toContain("IV");
  });

  it("marks class II for direct sales to the public as II*", () => {
    expect(describeClass("II", true)).toContain("II*");
    expect(describeClass("II", false)).toBe("II");
  });
});

describe("renderHtml", () => {
  it("prints the not-applicable mark for an inapplicable form", () => {
    const html = renderHtml(buildDoc());
    expect(html).toContain(NOT_APPLICABLE_MARK);
    expect(html).toContain("not tiltable");
  });

  it("shades computed cells so they are distinguishable from entered values", () => {
    const html = renderHtml(buildDoc());
    expect(html).toContain('class="computed"');
  });

  it("draws the watermark for a draft and omits it once locked", () => {
    expect(renderHtml(buildDoc({ status: "DRAFT" }))).toContain("watermark");
    expect(renderHtml(buildDoc({ status: "LOCKED" }))).not.toContain('class="watermark"');
  });

  it("emits bilingual furniture when asked, English only when not", () => {
    expect(renderHtml(buildDoc(), { bilingual: true })).toContain("प्ररूप मूल्यांकन");
    expect(renderHtml(buildDoc(), { bilingual: false })).not.toContain("प्ररूप मूल्यांकन");
  });

  it("escapes instrument identity, so a model name cannot inject markup", () => {
    const doc = buildDoc({
      instrument: { ...multiInterval, model: '<script>alert("x")</script>' },
    });
    const html = renderHtml(doc);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("surfaces software-identification findings next to the field they concern", () => {
    const doc = buildDoc({
      instrument: { ...multiInterval, softwareChecksum: "8100kb" },
      instrumentExtras: {
        softwareIdentificationIssues: [
          {
            code: "E_CHECKSUM_LOOKS_LIKE_FILE_SIZE",
            message: "Value looks like a file size, not a checksum.",
            clause: "R 76-1 Annex G",
          },
        ],
      },
    });
    const html = renderHtml(doc);
    expect(html).toContain("E_CHECKSUM_LOOKS_LIKE_FILE_SIZE");
    expect(html).toContain("file size");
  });
});

describe("esc", () => {
  it("escapes every character that could break out of markup", () => {
    expect(esc(`<&">'`)).toBe("&lt;&amp;&quot;&gt;&#39;");
  });
});

describe("renderJson", () => {
  it("states determinism explicitly in provenance", () => {
    const j = renderJson(buildDoc());
    expect(j.provenance.determinism).toContain("No machine-learning model");
    expect(j.provenance.rulesetId).toBe("OIML_R76_2006");
  });

  it("embeds a PDF with its own hash so a consumer can verify it unaided", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const j = renderJson(buildDoc(), { pdf: { bytes: pdf } });
    expect(j.embedded?.[0]?.mimeType).toBe("application/pdf");
    expect(j.embedded?.[0]?.content).toBe(Buffer.from(pdf).toString("base64"));
    expect(j.embedded?.[0]?.sha256).toHaveLength(64);
  });

  it("hashes content, not key order", () => {
    // Two structurally identical documents assembled by different code paths must hash the
    // same, or the hash records how the object was built rather than what it says.
    expect(canonicalHash({ a: 1, b: { c: 2, d: 3 } })).toBe(canonicalHash({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("changes the hash when a verdict changes", () => {
    const passed = canonicalHash(buildDoc());
    const failed = canonicalHash(
      buildDoc({ forms: [{ formId: "1", applicable: true, verdict: "FAILED", rows: [] }] }),
    );
    expect(passed).not.toBe(failed);
  });
});
