/**
 * HTML renderer — the layout everything else is built from.
 *
 * The PDF is this HTML printed by a browser, so this file is where R 76-2's page furniture
 * actually lives: A4 pages, a form per page, the "at start / at max / at end" environmental
 * header, computed cells shaded to distinguish them from entry cells, and the standard's
 * PASSED / FAILED / "– –" marking convention.
 *
 * Pure string building, no DOM, no browser. That means the layout is unit-testable without
 * launching Chromium — the PDF step only has to be trusted for pagination, not for content.
 */

import {
  type ReportDocument,
  type RenderedForm,
  type Cell,
  NOT_APPLICABLE_MARK,
  label,
} from "./model.js";

export interface HtmlOptions {
  /** Print English + Devanagari furniture. Certificates on the register are bilingual. */
  bilingual?: boolean;
  /** Draw the DRAFT watermark. Defaults to `doc.draft`. */
  watermark?: boolean;
}

/** Escape for HTML text and attribute contexts. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderHtml(doc: ReportDocument, opts: HtmlOptions = {}): string {
  const bi = opts.bilingual ?? true;
  const watermark = opts.watermark ?? doc.draft;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(doc.identity.reportId)} — ${esc(label("reportTitle", false))}</title>
<style>${STYLE}</style>
</head>
<body${watermark ? ' class="draft"' : ""}>
${watermark ? watermarkLayer(bi) : ""}
${coverPage(doc, bi)}
${summaryPage(doc, bi)}
${doc.forms.map((f) => formPage(f, doc, bi)).join("\n")}
${doc.family ? familyPage(doc, bi) : ""}
${doc.modules ? modulePage(doc, bi) : ""}
${(doc.checklists ?? []).map((c) => checklistPage(c, bi)).join("\n")}
${signaturePage(doc, bi)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function coverPage(doc: ReportDocument, bi: boolean): string {
  const i = doc.instrument;
  const issues = i.softwareIdentificationIssues ?? [];

  return `<section class="page cover">
  <header class="sheet-head">
    <div class="crest">भारत सरकार<br><span>Government of India</span></div>
    <div class="head-title">
      <h1>${esc(label("reportTitle", bi))}</h1>
      <p class="std">OIML R 76-2 · ${esc(doc.identity.rulesetId)}${
        doc.identity.rulesetVersion ? ` v${esc(doc.identity.rulesetVersion)}` : ""
      } · edition ${esc(doc.identity.edition)}</p>
    </div>
    <div class="report-no">
      <span class="k">Report</span>
      <strong>${esc(doc.identity.reportId)}</strong>
      ${doc.identity.applicationNo ? `<span class="k">Application ${esc(doc.identity.applicationNo)}</span>` : ""}
    </div>
  </header>

  <h2>${esc(label("generalInformation", bi))}</h2>
  <table class="kv">
    ${kv(label("laboratory", bi), `${esc(doc.lab.name)}${doc.lab.labCode ? ` (${esc(doc.lab.kind)} ${esc(doc.lab.labCode)})` : ""}`)}
    ${doc.lab.nablAccredited ? kv("NABL accredited", "Yes — AoM Rule 4(3)(g)") : ""}
    ${kv(label("manufacturer", bi), esc(i.manufacturer ?? "—"))}
    ${kv(label("model", bi), esc(i.model ?? "—"))}
    ${kv(label("serialNumber", bi), esc(i.serialNumber ?? "—"))}
    ${kv(label("accuracyClass", bi), esc(i.accuracyClass))}
    ${kv(label("maxCapacity", bi), esc(i.maxCapacityText))}
    ${i.minCapacityText ? kv(label("minCapacity", bi), esc(i.minCapacityText)) : ""}
    ${i.scaleIntervalText ? kv(label("scaleInterval", bi), esc(i.scaleIntervalText)) : ""}
    ${i.nText ? kv("Number of verification scale intervals, n", esc(i.nText)) : ""}
    ${kv("Indication", esc(i.indicatingType))}
    ${kv("Range structure", esc(i.rangeKind))}
    ${kv("Electronic", i.electronic ? "Yes" : "No")}
    ${i.powerSupply ? kv("Power supply", esc(i.powerSupply)) : ""}
    ${i.loadCell ? kv("Load cell", esc(i.loadCell)) : ""}
    ${i.softwareVersion ? kv("Software version", esc(i.softwareVersion)) : ""}
    ${
      i.softwareChecksum
        ? kv(
            "Software checksum",
            `<code>${esc(i.softwareChecksum)}</code>${
              issues.length
                ? `<div class="issues">${issues
                    .map(
                      (x) =>
                        `<div class="issue"><span class="code">${esc(x.code)}</span> ${esc(
                          x.message,
                        )}${x.clause ? ` <em>${esc(x.clause)}</em>` : ""}</div>`,
                    )
                    .join("")}</div>`
                : `<span class="ok">format accepted (R 76-1 Annex G)</span>`
            }`,
          )
        : ""
    }
    ${doc.identity.approvalMark ? kv("Approval mark (Rule 12)", esc(doc.identity.approvalMark)) : ""}
    ${kv("Conformity profile", doc.identity.profile === "IN_Sch7A"
        ? "Seventh Schedule, Heading A (LM (General) Rules, 2011)"
        : "OIML R 76 — Rule 7(1)(a)")}
  </table>

  ${
    doc.testEquipment?.length
      ? `<h2>Test equipment</h2>
  <table class="grid">
    <thead><tr><th>Description</th><th>Identification</th><th>Traceability</th></tr></thead>
    <tbody>${doc.testEquipment
      .map(
        (t) =>
          `<tr><td>${esc(t.description)}</td><td>${esc(t.identification ?? "—")}</td><td>${esc(
            t.traceability ?? "—",
          )}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`
      : ""
  }

  ${
    doc.caveats?.length
      ? `<div class="caveats"><strong>Notes on this report</strong><ul>${doc.caveats
          .map((c) => `<li>${esc(c)}</li>`)
          .join("")}</ul></div>`
      : ""
  }
  ${pageFoot(doc)}
</section>`;
}

function summaryPage(doc: ReportDocument, bi: boolean): string {
  return `<section class="page">
  <h2>${esc(label("summaryOfTypeEvaluation", bi))}</h2>
  <p class="convention">Marking convention (R 76-2): PASSED · FAILED · ${NOT_APPLICABLE_MARK} = not applicable.</p>
  <table class="grid summary">
    <thead><tr>
      <th class="w-form">Form</th>
      <th>${esc(label("test", bi))}</th>
      <th class="w-res">${esc(label("result", bi))}</th>
      <th>Reason, where not applicable</th>
    </tr></thead>
    <tbody>
      ${doc.summary
        .map(
          (r) => `<tr class="${verdictClass(r.verdict)}">
        <td class="mono">${esc(r.formId)}${r.rangeIndex ? `<span class="rng"> · range ${r.rangeIndex}</span>` : ""}</td>
        <td>${esc(r.title)}</td>
        <td class="res">${verdictMark(r.verdict)}</td>
        <td class="reason">${esc(r.notApplicableReason ?? "")}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <div class="overall ${doc.overallVerdict ? verdictClass(doc.overallVerdict) : ""}">
    Overall result: <strong>${doc.overallVerdict ? verdictMark(doc.overallVerdict) : "in progress"}</strong>
  </div>
  ${pageFoot(doc)}
</section>`;
}

function formPage(f: RenderedForm, doc: ReportDocument, bi: boolean): string {
  // A not-applicable form is still printed. R 76-2 marks it "– –"; omitting the page would
  // lose the record that the question was asked and deliberately answered.
  if (f.verdict === "NA") {
    return `<section class="page form na">
  <h2><span class="fid">${esc(f.formId)}</span> ${esc(f.title)}${rangeTag(f)}</h2>
  ${f.clause ? `<p class="clause">${esc(f.clause)}</p>` : ""}
  <div class="na-box">
    <div class="na-mark">${NOT_APPLICABLE_MARK}</div>
    <div class="na-reason"><strong>${esc(label("notApplicable", bi))}</strong>${
      f.notApplicableReason ? ` — ${esc(f.notApplicableReason)}` : ""
    }</div>
  </div>
  ${pageFoot(doc)}
</section>`;
  }

  return `<section class="page form">
  <h2><span class="fid">${esc(f.formId)}</span> ${esc(f.title)}${rangeTag(f)}</h2>
  ${f.clause ? `<p class="clause">${esc(f.clause)}</p>` : ""}
  ${f.environment?.length ? envTable(f) : ""}
  ${f.formulas?.length ? `<div class="formulas">${f.formulas.map((x) => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
  ${observationTable(f)}
  ${f.acceptance ? `<div class="acceptance">${esc(f.acceptance)}</div>` : ""}
  <div class="verdict ${verdictClass(f.verdict)}">${verdictMark(f.verdict)}</div>
  ${f.notes?.length ? `<ol class="notes">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>` : ""}
  ${pageFoot(doc)}
</section>`;
}

function envTable(f: RenderedForm): string {
  const env = f.environment ?? [];
  const cells = (get: (e: (typeof env)[number]) => number | undefined, unit: string) =>
    env.map((e) => `<td>${e === undefined || get(e) === undefined ? "—" : `${get(e)} ${unit}`}</td>`).join("");
  return `<table class="grid env">
  <thead><tr><th></th>${env.map((e) => `<th>${esc(e.checkpoint)}</th>`).join("")}</tr></thead>
  <tbody>
    <tr><th>Temperature</th>${cells((e) => e.temperatureC, "°C")}</tr>
    <tr><th>Relative humidity</th>${cells((e) => e.relativeHumidityPct, "%")}</tr>
    ${
      // R 76-2 prints this row marked "(only class I)". Showing an empty pressure row for a
      // class III instrument invites an officer to fill in a measurement the standard does
      // not ask for, so the row is dropped unless a pressure was actually recorded.
      env.some((e) => e.pressureHPa !== undefined)
        ? `<tr><th>Barometric pressure</th>${cells((e) => e.pressureHPa, "hPa")}</tr>`
        : ""
    }
  </tbody>
</table>`;
}

function observationTable(f: RenderedForm): string {
  // Two header rows when any column carries sub-columns. R 76-2 form 1 splits Indication,
  // Additional load, Error and Corrected error into a down-arrow and an up-arrow column for
  // the two directions of loading — losing that would change what the form means.
  const hasSub = f.columns.some((c) => c.subcolumns?.length);
  const head = hasSub
    ? `<tr>${f.columns
        .map(
          (c) =>
            `<th ${c.subcolumns?.length ? `colspan="${c.subcolumns.length}"` : 'rowspan="2"'}>${esc(
              c.label,
            )}</th>`,
        )
        .join("")}</tr>
     <tr>${f.columns
       .flatMap((c) => (c.subcolumns ?? []).map((s) => `<th class="sub">${esc(s)}</th>`))
       .join("")}</tr>`
    : `<tr>${f.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr>`;

  return `<table class="grid obs">
  <thead>${head}</thead>
  <tbody>
    ${f.rows.map((row) => `<tr>${row.map(cellHtml).join("")}</tr>`).join("")}
  </tbody>
</table>`;
}

function cellHtml(c: Cell): string {
  const cls = [c.kind === "computed" ? "computed" : "", c.failed ? "cell-failed" : ""]
    .filter(Boolean)
    .join(" ");
  return `<td${cls ? ` class="${cls}"` : ""}>${esc(c.value)}</td>`;
}

function familyPage(doc: ReportDocument, bi: boolean): string {
  const fam = doc.family!;
  return `<section class="page">
  <h2>${esc(label("familyCoverage", bi))}</h2>
  <p class="clause">R 76-1:2006 §3.10.4 — selection of equipment under test</p>
  <table class="grid">
    <thead><tr><th>Variant</th><th>Family</th><th>Max</th><th>e</th><th>d</th><th>n</th><th>EUT</th><th>Basis</th></tr></thead>
    <tbody>${fam.variants
      .map(
        (v) => `<tr class="${v.eut ? "is-eut" : ""}">
      <td class="mono">${esc(v.id)}</td><td>${esc(v.family ?? "—")}</td>
      <td>${esc(v.max)}</td><td>${esc(v.e)}</td><td>${esc(v.d)}</td><td>${esc(v.n)}</td>
      <td class="res">${v.eut ? "X" : ""}</td>
      <td class="reason">${esc(v.justification)}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
  <div class="clause-out">
    <strong>Coverage clause</strong>
    <p>${esc(fam.coverageClause)}</p>
  </div>
  ${pageFoot(doc)}
</section>`;
}

function modulePage(doc: ReportDocument, bi: boolean): string {
  const m = doc.modules!;
  return `<section class="page">
  <h2>${esc(label("moduleCompatibility", bi))}</h2>
  <p class="clause">R 76-1:2006 Annex F — compatibility of modules</p>
  <table class="grid">
    <thead><tr><th>Check</th><th>Clause</th><th>Required</th><th>Actual</th><th>Result</th></tr></thead>
    <tbody>${m.checks
      .map(
        (c) => `<tr class="${c.passed ? "v-pass" : "v-fail"}">
      <td>${esc(c.check)}<div class="detail">${esc(c.detail)}</div></td>
      <td class="mono">${esc(c.clause)}</td><td>${esc(c.required)}</td><td>${esc(c.actual)}</td>
      <td class="res">${c.passed ? "PASSED" : "FAILED"}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
  <div class="verdict ${verdictClass(m.verdict)}">${verdictMark(m.verdict)}</div>
  ${pageFoot(doc)}
</section>`;
}

function checklistPage(c: NonNullable<ReportDocument["checklists"]>[number], bi: boolean): string {
  if (!c.applicable) {
    return `<section class="page">
  <h2>${esc(label("checklist", bi))} ${esc(c.id)} — ${esc(c.title)}</h2>
  <div class="na-box"><div class="na-mark">${NOT_APPLICABLE_MARK}</div>
  <div class="na-reason">${esc(c.notApplicableReason ?? "Not applicable to this instrument.")}</div></div>
</section>`;
  }
  return `<section class="page checklist">
  <h2>${esc(label("checklist", bi))} ${esc(c.id)} — ${esc(c.title)}</h2>
  <table class="grid">
    <thead><tr><th class="w-ref">Ref.</th><th>Item</th><th class="w-ans">Yes</th><th class="w-ans">No</th><th class="w-ans">${NOT_APPLICABLE_MARK}</th><th>Remark</th></tr></thead>
    <tbody>${c.answers
      .map(
        (a) => `<tr>
      <td class="mono">${esc(a.ref)}</td><td>${esc(a.text)}</td>
      <td class="res">${a.answer === "yes" ? "X" : ""}</td>
      <td class="res">${a.answer === "no" ? "X" : ""}</td>
      <td class="res">${a.answer === "na" ? "X" : ""}</td>
      <td>${esc(a.remark ?? "")}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
</section>`;
}

function signaturePage(doc: ReportDocument, bi: boolean): string {
  const sigs = doc.signatures ?? [];
  const a = doc.audit;
  return `<section class="page">
  <h2>${esc(label("signatures", bi))}</h2>
  <table class="grid sig">
    <thead><tr><th>Role</th><th>Name</th><th>Date</th><th>Record hash</th></tr></thead>
    <tbody>${
      sigs.length
        ? sigs
            .map(
              (s) =>
                `<tr><td>${esc(s.role)}</td><td>${esc(s.name)}</td><td>${esc(s.at ?? "")}</td>
             <td class="mono hash">${esc(s.signatureHash ?? "—")}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="4" class="muted">Not yet signed.</td></tr>`
    }</tbody>
  </table>
  <p class="legal">Electronic records and digital signatures carry the same legal effect as
  writing and handwritten signature under sections 4 and 5 of the Information Technology Act, 2000.</p>

  ${
    a
      ? `<h2>${esc(label("auditTrail", bi))}</h2>
  <table class="kv">
    ${kv("Recorded events", String(a.eventCount))}
    ${kv("Hash chain", a.chainVerified
        ? `<span class="ok">verified — every recorded observation is unaltered</span>`
        : `<span class="bad">BROKEN — ${esc(a.chainNote ?? "the chain did not verify")}</span>`)}
    ${a.firstRecordedAt ? kv("First record", esc(a.firstRecordedAt)) : ""}
    ${a.lastRecordedAt ? kv("Last record", esc(a.lastRecordedAt)) : ""}
  </table>
  <p class="legal">Observations are held in an append-only log. Amendments are recorded as new
  entries carrying date and person; the original entry is retained (ISO/IEC 17025 §7.8).</p>`
      : ""
  }
  ${pageFoot(doc)}
</section>`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function kv(k: string, vHtml: string): string {
  return `<tr><th>${k}</th><td>${vHtml}</td></tr>`;
}

function rangeTag(f: RenderedForm): string {
  return f.rangeIndex ? ` <span class="rng">· weighing range ${f.rangeIndex}</span>` : "";
}

function verdictMark(v: string): string {
  return v === "NA" ? NOT_APPLICABLE_MARK : v;
}

function verdictClass(v: string): string {
  return v === "PASSED" ? "v-pass" : v === "FAILED" ? "v-fail" : "v-na";
}

function pageFoot(doc: ReportDocument): string {
  return `<footer class="sheet-foot">
    <span>${esc(doc.identity.reportId)}</span>
    <span>${esc(doc.lab.name)}</span>
    <span>${doc.draft ? "DRAFT — not a record copy" : "Record copy"}</span>
  </footer>`;
}

function watermarkLayer(bi: boolean): string {
  return `<div class="watermark" aria-hidden="true">${esc(bi ? "DRAFT / प्रारूप" : "DRAFT")}</div>`;
}

// ---------------------------------------------------------------------------
// Print stylesheet
// ---------------------------------------------------------------------------

const STYLE = `
@page { size: A4; margin: 14mm 12mm 12mm; }
* { box-sizing: border-box; }
body {
  font: 10pt/1.4 "Noto Sans", "Segoe UI", system-ui, sans-serif;
  color: #111; margin: 0; background: #fff;
}
.page {
  position: relative; page-break-after: always; break-after: page;
  min-height: 250mm; padding-bottom: 12mm;
}
.page:last-child { page-break-after: auto; break-after: auto; }

.sheet-head {
  display: grid; grid-template-columns: 30mm 1fr 38mm; gap: 4mm;
  align-items: center; border-bottom: 1.6pt solid #111; padding-bottom: 3mm; margin-bottom: 5mm;
}
.crest { font-size: 9pt; font-weight: 700; line-height: 1.25; }
.crest span { font-weight: 400; }
.head-title h1 { font-size: 13pt; margin: 0; letter-spacing: .01em; }
.head-title .std { margin: 1mm 0 0; font-size: 8pt; color: #444; }
.report-no { text-align: right; font-size: 8.5pt; }
.report-no strong { display: block; font-size: 11pt; font-family: ui-monospace, Menlo, monospace; }
.report-no .k { color: #555; }

h2 {
  font-size: 11pt; margin: 6mm 0 2.5mm; padding-bottom: 1mm;
  border-bottom: .8pt solid #111;
}
.page.form h2 .fid {
  display: inline-block; min-width: 11mm; padding: .4mm 1.6mm; margin-right: 2mm;
  background: #111; color: #fff; font-family: ui-monospace, Menlo, monospace; text-align: center;
}
.clause { margin: 0 0 3mm; font-size: 8.5pt; color: #555; font-style: italic; }
.rng { font-weight: 400; color: #555; font-size: 9pt; }

table { border-collapse: collapse; width: 100%; }
table.kv th {
  text-align: left; width: 62mm; font-weight: 600; padding: 1.4mm 2mm;
  border-bottom: .4pt solid #ddd; vertical-align: top;
}
table.kv td { padding: 1.4mm 2mm; border-bottom: .4pt solid #ddd; }
table.grid th, table.grid td {
  border: .5pt solid #666; padding: 1.2mm 1.6mm; font-size: 9pt; vertical-align: top;
}
table.grid thead th { background: #ececec; font-weight: 600; text-align: center; }
table.grid th.sub { font-weight: 400; background: #f4f4f4; }
table.obs td { text-align: right; font-variant-numeric: tabular-nums; }
/* Computed cells are shaded so a reader can tell at a glance what the instrument showed
   from what the engine derived. */
table.obs td.computed { background: #f6f6f6; }
table.obs td.cell-failed { background: #fde2e2; font-weight: 700; }
.mono { font-family: ui-monospace, Menlo, monospace; font-size: 8.5pt; }
.hash { word-break: break-all; }
.detail, .reason { font-size: 8pt; color: #555; }
.res { text-align: center; font-weight: 700; }
.w-form { width: 18mm; } .w-res { width: 22mm; } .w-ref { width: 18mm; } .w-ans { width: 10mm; }

.env { width: auto; margin-bottom: 3mm; }
.env th { text-align: left; background: #f4f4f4; }
.formulas {
  margin: 2mm 0 3mm; padding: 2mm 3mm; background: #f7f7f7; border-left: 2pt solid #111;
  font-size: 9pt;
}
.acceptance { margin-top: 2.5mm; font-weight: 600; font-size: 9.5pt; }
.verdict {
  margin-top: 3mm; display: inline-block; padding: 1.4mm 5mm;
  border: 1pt solid #111; font-weight: 700; letter-spacing: .06em;
}
.v-pass .res, .verdict.v-pass { color: #0a5c2b; border-color: #0a5c2b; }
.v-fail .res, .verdict.v-fail { color: #9b1c1c; border-color: #9b1c1c; }
.verdict.v-na { color: #555; border-color: #999; }
tr.v-fail td { background: #fdf3f3; }
tr.is-eut td { background: #eef6ee; }
.overall { margin-top: 4mm; font-size: 11pt; }

.na-box {
  margin-top: 6mm; padding: 6mm; border: .8pt dashed #999; text-align: center; color: #444;
}
.na-mark { font-size: 22pt; letter-spacing: .2em; }
.na-reason { margin-top: 2mm; font-size: 9.5pt; }

.issues { margin-top: 1.2mm; }
.issue { font-size: 8pt; color: #9b1c1c; }
.issue .code { font-family: ui-monospace, Menlo, monospace; }
.ok { color: #0a5c2b; font-size: 8.5pt; }
.bad { color: #9b1c1c; font-weight: 600; }
.muted { color: #777; }

.caveats { margin-top: 6mm; padding: 3mm; background: #fffbe6; border: .5pt solid #e3d08a; font-size: 8.5pt; }
.caveats ul { margin: 1.5mm 0 0; padding-left: 5mm; }
.clause-out { margin-top: 4mm; padding: 3mm; border: .8pt solid #111; }
.clause-out p { margin: 1.5mm 0 0; font-style: italic; }
.convention { font-size: 8.5pt; color: #555; margin: 0 0 2.5mm; }
.legal { font-size: 8pt; color: #444; margin-top: 3mm; }
.notes { font-size: 8pt; color: #444; margin-top: 3mm; padding-left: 5mm; }

.sheet-foot {
  position: absolute; bottom: 0; left: 0; right: 0;
  display: flex; justify-content: space-between;
  border-top: .5pt solid #999; padding-top: 1.5mm; font-size: 7.5pt; color: #555;
}

/* Watermark. Fixed positioning repeats it on every printed page in Chromium. */
.watermark {
  position: fixed; top: 45%; left: 0; right: 0; text-align: center;
  font-size: 62pt; font-weight: 800; color: rgba(180, 0, 0, .10);
  transform: rotate(-28deg); letter-spacing: .08em; z-index: 0; pointer-events: none;
}
body.draft .page { position: relative; z-index: 1; }
body.draft .page > * { position: relative; }

@media screen {
  body { background: #eceff1; padding: 8mm; }
  .page {
    background: #fff; width: 210mm; margin: 0 auto 8mm; padding: 14mm 12mm 12mm;
    box-shadow: 0 1px 4px rgba(0,0,0,.18);
  }
}
`;
