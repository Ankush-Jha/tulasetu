/**
 * The DOCX's DRAFT watermark.
 *
 * DIR-08 flagged the earlier version: the only thing marking a review copy DRAFT on every page
 * was one grey line of footer text, which an officer skimming to page 12 could easily miss.
 * `draftWatermark` in docx.ts now puts a rotated, semi-transparent "DRAFT" shape in the page
 * *header* — the same VML construct Word's own "Insert Watermark" feature writes — so it repeats
 * behind every page rather than announcing itself once at the top.
 *
 * `docx`'s `Packer` output is a real zip (a .docx *is* one), so this unzips it with `jszip` —
 * already present in `node_modules` as `docx`'s own dependency, so this adds nothing new — and
 * reads `word/header1.xml` the way a reviewer's "unzip and look" would.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import { assembleReport, type FormsFile } from "../src/assemble.js";
import { renderDocx } from "../src/docx.js";
import type { ReportDocument } from "../src/model.js";
import type { InstrumentProfile } from "@tulasetu/engine";

const EMPTY_FORMS: FormsFile = { forms: [] };

const instrument: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "single",
  electronic: true,
  manufacturer: "Example Instruments Pvt Ltd",
  model: "EX-1",
  serialNumber: "SN-0001",
  ranges: [{ e: 1, d: 1, max: 2000, min: 20, n: 2000 }],
};

function doc(status: string): ReportDocument {
  return assembleReport({
    reportId: "TS-2026-DOCX",
    profile: "IN_Sch7A",
    rulesetId: "OIML_R76_2006",
    edition: "2007-report-format",
    status,
    lab: { name: "RRSL Faridabad", kind: "RRSL", labCode: "09", nablAccredited: true },
    instrument,
    generatedAt: "2026-09-07T00:00:00Z",
    formsFile: EMPTY_FORMS,
    forms: [],
  });
}

async function headerXmlOf(bytes: Uint8Array): Promise<string | null> {
  const zip = await JSZip.loadAsync(bytes);
  const header = zip.file("word/header1.xml");
  return header ? header.async("text") : null;
}

describe("the DOCX DRAFT watermark", () => {
  it("puts a rotated VML shape in the page header of a draft, so it repeats on every page", async () => {
    const bytes = await renderDocx(doc("DRAFT"));
    const header = await headerXmlOf(bytes);
    expect(header, "a draft DOCX should carry a header1.xml at all").not.toBeNull();
    // The two properties that make this a watermark rather than ordinary header text: it is
    // absolutely positioned rather than flowing with content, and it is rotated diagonally —
    // exactly what Word's own "Insert Watermark" feature writes.
    expect(header).toContain("v:shape");
    expect(header).toContain("rotation:315");
    expect(header).toContain("DRAFT");
  });

  it("omits the watermark once the report is no longer a draft", async () => {
    const bytes = await renderDocx(doc("LOCKED"));
    const header = await headerXmlOf(bytes);
    expect(header).toBeNull();
  });

  it("still names the record copy's hash in the first-page banner, alongside the watermark", async () => {
    const bytes = await renderDocx(doc("DRAFT"), { recordCopySha256: "a".repeat(64) });
    const zip = await JSZip.loadAsync(bytes);
    const body = await zip.file("word/document.xml")!.async("text");
    expect(body).toContain("a".repeat(64));
  });
});
