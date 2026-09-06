/**
 * End-to-end vertical slice: profile -> applicability -> computed forms -> summary -> three outputs.
 *
 * This is the demo path from docs/PRD.md §4.4, run headlessly. It exists to prove the chain
 * actually joins up — the engine, the rule pack, the transcribed R 76-2 forms, the assembler
 * and all three renderers — rather than each piece passing its own tests in isolation.
 *
 *   npx tsx apps/cli/src/demo.ts [outputDir]
 *
 * The instrument is R 76-1 §3.3's own worked example (Max 2/5/15 kg, e 1/2/10 g, class III),
 * so the mpe column in the generated report can be checked against the standard by eye.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  k1ErrorVsMpe,
  resolveApplicableTests,
  resolveMpe,
  solveFamily,
  validateProfile,
  validateSoftwareIdentification,
  type InstrumentProfile,
  type RulePack,
  type Variant,
  type WeighingObservation,
} from "@tulasetu/engine";
import {
  assembleReport,
  renderHtml,
  renderPdf,
  renderDocx,
  serializeJson,
  type ComputedForm,
  type FormsFile,
} from "@tulasetu/renderers";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

const pack = JSON.parse(
  readFileSync(join(ROOT, "packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;
const formsFile = JSON.parse(
  readFileSync(join(ROOT, "packages/rulepacks/forms/R76-2_2007_forms.json"), "utf8"),
) as FormsFile;

// ---------------------------------------------------------------------------
// 1. The instrument profile
// ---------------------------------------------------------------------------

const profile: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  softwareControlled: true,
  powerSupply: ["mains"],
  manufacturer: "Example Instruments Pvt Ltd",
  model: "EX-15 MI",
  serialNumber: "EX15-2026-0042",
  softwareVersion: "2.4.1",
  // Deliberately the defective value the national register actually contains for
  // certificate #100 (docs/certificates/certificates-analysis.md): a file size where a
  // checksum belongs. The validator should catch it.
  softwareChecksum: "8100kb",
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

// ---------------------------------------------------------------------------
// 2. Validation
// ---------------------------------------------------------------------------

const profileIssues = validateProfile(profile, pack);
const checksumIssues = validateSoftwareIdentification(profile.softwareChecksum!);

// ---------------------------------------------------------------------------
// 3. Applicability
// ---------------------------------------------------------------------------

const applicable = resolveApplicableTests(profile, pack);

// ---------------------------------------------------------------------------
// 4. Observations and computation
// ---------------------------------------------------------------------------

/**
 * Weighing performance. The loads are chosen to straddle every mpe band boundary in the
 * standard's worked example, so the generated report shows the limit changing mid-range —
 * the behaviour a spreadsheet gets wrong.
 */
const weighingObs: WeighingObservation[] = [
  { load: 0, indication: 0, additionalLoad: 0, label: "zero" },
  { load: 500, indication: 500, additionalLoad: 0 },
  { load: 1000, indication: 1000, additionalLoad: 0 },
  { load: 2000, indication: 2000, additionalLoad: 0, label: "changeover e1 -> e2" },
  { load: 4000, indication: 4000, additionalLoad: 0 },
  { load: 4500, indication: 4502, additionalLoad: 0 },
  { load: 5000, indication: 5000, additionalLoad: 0, label: "changeover e2 -> e3" },
  { load: 10000, indication: 10000, additionalLoad: 0 },
  { load: 15000, indication: 15000, additionalLoad: 0, label: "Max" },
];

const weighing = k1ErrorVsMpe({ profile, observations: weighingObs }, pack);

/** Eccentricity: the same load in four positions on the receptor. */
const eccentricityObs: WeighingObservation[] = [
  { load: 5000, indication: 5000, label: "centre" },
  { load: 5000, indication: 5000, label: "front left" },
  { load: 5000, indication: 5010, label: "front right" },
  { load: 5000, indication: 5000, label: "back left" },
  { load: 5000, indication: 5000, label: "back right" },
];
const eccentricity = k1ErrorVsMpe({ profile, observations: eccentricityObs }, pack);

// ---------------------------------------------------------------------------
// 5. Family solver
// ---------------------------------------------------------------------------

/** R 76-1 Table 8's own eight variants. Expected EUT set: 1.2, 2.1, 2.4. */
const variants: Variant[] = [
  { id: "1.1", family: "1", accuracyClass: "II", max: 200, e: 0.01, d: 0.001, n: 20000, unit: "g", temperatureRange: { minC: 10, maxC: 30 } },
  { id: "1.2", family: "1", accuracyClass: "II", max: 400, e: 0.01, d: 0.001, n: 40000, unit: "g", temperatureRange: { minC: 10, maxC: 30 } },
  { id: "1.3", family: "1", accuracyClass: "II", max: 2000, e: 0.05, d: 0.05, n: 40000, unit: "g", temperatureRange: { minC: 10, maxC: 30 } },
  { id: "2.1", family: "2", accuracyClass: "III", max: 1500, e: 0.5, d: 0.5, n: 3000, unit: "g", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.2", family: "2", accuracyClass: "III", max: 3000, e: 1, d: 1, n: 3000, unit: "g", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.3", family: "2", accuracyClass: "III", max: 5000, e: 2, d: 2, n: 2500, unit: "g", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.4", family: "2", accuracyClass: "III", max: 15000, e: 5, d: 5, n: 3000, unit: "g", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.5", family: "2", accuracyClass: "III", max: 60000, e: 20, d: 20, n: 3000, unit: "g", temperatureRange: { minC: -10, maxC: 40 } },
];
const family = solveFamily(variants, pack);

// ---------------------------------------------------------------------------
// 6. Assemble
// ---------------------------------------------------------------------------

const ENV = [
  { checkpoint: "At start", temperatureC: 21.4, relativeHumidityPct: 52 },
  { checkpoint: "At max", temperatureC: 21.9, relativeHumidityPct: 53 },
  { checkpoint: "At end", temperatureC: 21.5, relativeHumidityPct: 52 },
];

/** K1 rows -> the column keys the transcribed form declares. */
function k1Rows(rows: typeof weighing.rows) {
  return rows.map((r) => ({
    load: r.load,
    indication: { "↓": r.indication, "↑": r.indication },
    additionalLoad: { "↓": r.additionalLoad, "↑": r.additionalLoad },
    error: { "↓": r.error, "↑": r.error },
    correctedError: { "↓": r.correctedError, "↑": r.correctedError },
    mpe: r.mpe.mpe,
  }));
}

function failedCells(rows: typeof weighing.rows) {
  return rows
    .map((r, rowIndex) => ({ rowIndex, keys: r.verdict === "FAILED" ? ["correctedError"] : [] }))
    .filter((x) => x.keys.length > 0);
}

// Forms the engine actually computed in this slice. Everything else the applicability
// resolver returned is carried through with its verdict and reason, so the report shows the
// complete test list rather than only the parts that were run.
const computedByForm = new Map<string, ComputedForm>([
  [
    "1",
    {
      formId: "1",
      testId: "weighing_performance",
      applicable: true,
      verdict: weighing.verdict,
      environment: ENV,
      rows: k1Rows(weighing.rows),
      failedCells: failedCells(weighing.rows),
    },
  ],
  [
    "3.1",
    {
      formId: "3.1",
      testId: "eccentricity_weights",
      applicable: true,
      verdict: eccentricity.verdict,
      environment: ENV,
      rows: k1Rows(eccentricity.rows),
      failedCells: failedCells(eccentricity.rows),
    },
  ],
]);

const forms: ComputedForm[] = applicable.map((t) => {
  const computed = computedByForm.get(t.formId);
  if (computed && t.applicable) return computed;
  if (!t.applicable) {
    return {
      formId: t.formId,
      testId: t.testId,
      applicable: false,
      verdict: "NA" as const,
      ...(t.reason ? { notApplicableReason: t.reason } : {}),
    };
  }
  // Applicable but not computed in this slice. Marked NA with an honest reason rather than
  // left blank or silently passed — a report must never imply a test happened when it did not.
  return {
    formId: t.formId,
    testId: t.testId,
    applicable: false,
    verdict: "NA" as const,
    notApplicableReason:
      "Applicable to this instrument, but not performed in this demonstration slice. " +
      "Structured stub — observations not recorded.",
  };
});

const doc = assembleReport({
  reportId: "TS-2026-DEMO-0001",
  applicationNo: "MA/2026/000123",
  profile: "IN_Sch7A",
  rulesetId: pack.ruleset_id,
  rulesetVersion: String(pack["version"] ?? ""),
  edition: pack.edition ?? "2007-report-format",
  status: "DRAFT",
  lab: {
    name: "Regional Reference Standards Laboratory, Faridabad",
    kind: "RRSL",
    labCode: "09",
    nablAccredited: true,
  },
  instrument: profile,
  instrumentExtras: {
    loadCell: "Illustrative — not from a real datasheet",
    softwareIdentificationIssues: checksumIssues.map((i) => ({
      code: i.code,
      message: i.message,
      ...(i.clause ? { clause: i.clause } : {}),
    })),
  },
  testEquipment: [
    { description: "Standard weights, class M1, 1 g – 20 kg", identification: "STD/FBD/2024/017", traceability: "NPL India" },
  ],
  forms,
  formsFile,
  family: {
    variants: family.selections.map((s) => ({
      id: s.variant.id,
      ...(s.variant.family ? { family: s.variant.family } : {}),
      max: `${s.variant.max} ${s.variant.unit ?? "g"}`,
      e: `${s.variant.e} ${s.variant.unit ?? "g"}`,
      d: `${s.variant.d} ${s.variant.unit ?? "g"}`,
      n: String(s.variant.n ?? Math.round(s.variant.max / s.variant.e)),
      eut: s.eut,
      justification: s.justification,
    })),
    coverageClause: family.coverageClause,
  },
  signatures: [
    { role: "Metrological Assistant", name: "—", at: "" },
    { role: "Assistant Director", name: "—", at: "" },
    { role: "Director (Legal Metrology)", name: "—", at: "" },
  ],
  generatedAt: new Date().toISOString(),
  caveats: [
    "Demonstration report. Observations are illustrative and were not recorded at a bench.",
    // Only warnings and errors reach the report. Info-level issues (which Table 3 row matched
    // each partial range, and the like) are audit-trail material, not something a reader of
    // the report needs flagged as a caveat.
    ...profileIssues.filter((i) => i.severity !== "info").map((i) => `${i.code}: ${i.message}`),
  ],
});

// ---------------------------------------------------------------------------
// 7. Render
// ---------------------------------------------------------------------------

const outDir = process.argv[2] ?? join(ROOT, "out");
mkdirSync(outDir, { recursive: true });

const line = (s = "") => console.log(s);

line("TulaSetu — end-to-end demonstration");
line("=".repeat(72));
line();
line(`Instrument   ${doc.instrument.model}  ·  class ${doc.instrument.accuracyClass}`);
line(`             Max ${doc.instrument.maxCapacityText}   e = ${doc.instrument.scaleIntervalText}`);
line(`Rule pack    ${pack.ruleset_id} v${pack["version"]}  (${pack.edition})`);
line();

line(`Validation   ${profileIssues.length} profile issue(s), ${checksumIssues.length} software-identification finding(s)`);
for (const i of checksumIssues) line(`             ! ${i.code} — ${i.message}`);
line();

const applicableCount = applicable.filter((t) => t.applicable).length;
line(`Applicability  ${applicableCount} of ${applicable.length} forms apply`);
for (const t of applicable.filter((x) => !x.applicable)) {
  line(`             – – ${t.formId.padEnd(5)} ${(t.title ?? t.testId).padEnd(42)} ${t.reason ?? ""}`);
}
line();

line("Weighing performance — the mpe column changes with the partial range:");
line(`  ${"Load".padStart(9)} ${"Ind.".padStart(9)} ${"E".padStart(8)} ${"Ec".padStart(8)} ${"mpe".padStart(8)}   verdict`);
for (const r of weighing.rows) {
  line(
    `  ${(r.load + " g").padStart(9)} ${(r.indication + " g").padStart(9)} ` +
      `${(r.error + " g").padStart(8)} ${(r.correctedError + " g").padStart(8)} ` +
      `${("±" + r.mpe.mpe + " g").padStart(8)}   ${r.verdict}`,
  );
}
line(`  form verdict: ${weighing.verdict}`);
line();

line(`Eccentricity   ${eccentricity.verdict}`);
line();

const euts = family.selections.filter((s) => s.eut).map((s) => s.variant.id);
line(`Family solver  ${variants.length} variants -> test only ${euts.length}: ${euts.join(", ")}`);
line(`  ${family.coverageClause.slice(0, 400)}${family.coverageClause.length > 400 ? "…" : ""}`);
line();

line(`Overall        ${doc.overallVerdict ?? "in progress"}`);
line();

// --- outputs ---
const html = renderHtml(doc);
writeFileSync(join(outDir, "report.html"), html);
line(`HTML   ${join(outDir, "report.html")}  (${html.length.toLocaleString()} chars)`);

const docxBytes = await renderDocx(doc);
writeFileSync(join(outDir, "report.docx"), docxBytes);
line(`DOCX   ${join(outDir, "report.docx")}  (${docxBytes.byteLength.toLocaleString()} bytes, DRAFT-watermarked)`);

const { pdf, sha256, byteLength } = await renderPdf(doc);
writeFileSync(join(outDir, "report.pdf"), pdf);
line(`PDF    ${join(outDir, "report.pdf")}  (${byteLength.toLocaleString()} bytes)`);
line(`       sha256 ${sha256}`);

const json = serializeJson(doc, { pdf: { bytes: pdf }, docx: { bytes: docxBytes } });
writeFileSync(join(outDir, "report.json"), json);
line(`JSON   ${join(outDir, "report.json")}  (${json.length.toLocaleString()} chars, PDF + DOCX embedded)`);
line();
line("Done.");
