/**
 * DOCX renderer — the review copy, and only ever the review copy.
 *
 * The PS asks for an editable Word export, and the AD/DD review cycle genuinely needs one.
 * But an editable report cannot also be the record copy: whatever an officer types into it is
 * outside the append-only log, and so outside ISO/IEC 17025 §7.8's guarantee.
 *
 * This renderer resolves that by making the distinction impossible to miss rather than by
 * refusing the format. Every DOCX carries a rotated DRAFT watermark repeated on every page
 * (see `draftWatermark`) and a first-page banner naming the record copy's hash, so a printed
 * Word file cannot be mistaken for the signed report at any page an officer happens to open.
 * The record copy is the locked PDF; its SHA-256 lives in the event log.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  Textbox,
  WidthType,
} from "docx";
import type { Cell, RenderedForm, ReportDocument } from "./model.js";
import { NOT_APPLICABLE_MARK } from "./model.js";

export interface DocxOptions {
  /** Force the DRAFT banner off. Only meaningful for an already-locked report. */
  watermark?: boolean;
  /** The locked PDF's hash, printed in the banner so the record copy is identifiable. */
  recordCopySha256?: string;
}

export async function renderDocx(doc: ReportDocument, opts: DocxOptions = {}): Promise<Uint8Array> {
  const draft = opts.watermark ?? doc.draft;

  const children: (Paragraph | Table)[] = [];

  if (draft) children.push(...draftBanner(opts.recordCopySha256));

  children.push(
    heading("Type Evaluation Test Report — Non-Automatic Weighing Instrument", HeadingLevel.TITLE),
    small(
      `OIML R 76-2 · ${doc.identity.rulesetId}${
        doc.identity.rulesetVersion ? ` v${doc.identity.rulesetVersion}` : ""
      } · edition ${doc.identity.edition} · report ${doc.identity.reportId}`,
    ),
  );

  // --- General information ------------------------------------------------
  const i = doc.instrument;
  children.push(heading("General information", HeadingLevel.HEADING_1));
  children.push(
    kvTable([
      ["Laboratory", `${doc.lab.name}${doc.lab.labCode ? ` (${doc.lab.kind} ${doc.lab.labCode})` : ""}`],
      ["Manufacturer", i.manufacturer ?? "—"],
      ["Model", i.model ?? "—"],
      ["Serial number", i.serialNumber ?? "—"],
      ["Accuracy class", i.accuracyClass],
      ["Maximum capacity, Max", i.maxCapacityText],
      ["Minimum capacity, Min", i.minCapacityText ?? "—"],
      ["Verification scale interval, e", i.scaleIntervalText ?? "—"],
      ["Indication", i.indicatingType],
      ["Range structure", i.rangeKind],
      ["Electronic", i.electronic ? "Yes" : "No"],
      ["Software version", i.softwareVersion ?? "—"],
      ["Software checksum", i.softwareChecksum ?? "—"],
      [
        "Conformity profile",
        doc.identity.profile === "IN_Sch7A"
          ? "Seventh Schedule, Heading A (LM (General) Rules, 2011)"
          : "OIML R 76 — Rule 7(1)(a)",
      ],
    ]),
  );

  // Software-identification findings are printed where they belong: next to the field.
  const issues = i.softwareIdentificationIssues ?? [];
  if (issues.length) {
    children.push(heading("Software identification — findings", HeadingLevel.HEADING_2));
    for (const x of issues) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${x.code}  `, bold: true, color: "9B1C1C", font: "Consolas" }),
            new TextRun({ text: x.message }),
            ...(x.clause ? [new TextRun({ text: `  (${x.clause})`, italics: true })] : []),
          ],
          spacing: { after: 60 },
        }),
      );
    }
  }

  // --- Summary ------------------------------------------------------------
  children.push(heading("Summary of type evaluation", HeadingLevel.HEADING_1));
  children.push(
    small(`Marking convention (R 76-2): PASSED · FAILED · ${NOT_APPLICABLE_MARK} = not applicable.`),
  );
  children.push(
    gridTable(
      ["Form", "Test", "Result", "Reason, where not applicable"],
      doc.summary.map((r) => [
        r.formId + (r.rangeIndex ? ` (range ${r.rangeIndex})` : ""),
        r.title,
        verdictMark(r.verdict),
        r.notApplicableReason ?? "",
      ]),
      [12, 46, 14, 28],
    ),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Overall result: ", bold: true }),
        new TextRun({
          text: doc.overallVerdict ? verdictMark(doc.overallVerdict) : "in progress",
          bold: true,
          color: verdictColor(doc.overallVerdict),
        }),
      ],
      spacing: { before: 160, after: 160 },
    }),
  );

  // --- Forms --------------------------------------------------------------
  for (const f of doc.forms) children.push(...formSection(f));

  // --- Family / modules ---------------------------------------------------
  if (doc.family) {
    children.push(heading("Family coverage", HeadingLevel.HEADING_1));
    children.push(small("R 76-1:2006 §3.10.4 — selection of equipment under test"));
    children.push(
      gridTable(
        ["Variant", "Family", "Max", "e", "d", "n", "EUT", "Basis"],
        doc.family.variants.map((v) => [
          v.id,
          v.family ?? "—",
          v.max,
          v.e,
          v.d,
          v.n,
          v.eut ? "X" : "",
          v.justification,
        ]),
        [9, 9, 10, 8, 8, 8, 6, 42],
      ),
    );
    children.push(heading("Coverage clause", HeadingLevel.HEADING_2));
    children.push(new Paragraph({ children: [new TextRun({ text: doc.family.coverageClause, italics: true })] }));
  }

  if (doc.modules) {
    children.push(heading("Module compatibility", HeadingLevel.HEADING_1));
    children.push(small("R 76-1:2006 Annex F — compatibility of modules"));
    children.push(
      gridTable(
        ["Check", "Clause", "Required", "Actual", "Result"],
        doc.modules.checks.map((c) => [
          c.check,
          c.clause,
          String(c.required),
          String(c.actual),
          c.passed ? "PASSED" : "FAILED",
        ]),
        [40, 14, 16, 16, 14],
      ),
    );
  }

  // --- Checklists ---------------------------------------------------------
  for (const c of doc.checklists ?? []) {
    children.push(heading(`Checklist ${c.id} — ${c.title}`, HeadingLevel.HEADING_1));
    if (!c.applicable) {
      children.push(
        new Paragraph({
          text: `${NOT_APPLICABLE_MARK}  ${c.notApplicableReason ?? "Not applicable to this instrument."}`,
        }),
      );
      continue;
    }
    children.push(
      gridTable(
        ["Ref.", "Item", "Yes", "No", NOT_APPLICABLE_MARK, "Remark"],
        c.answers.map((a) => [
          a.ref,
          a.text,
          a.answer === "yes" ? "X" : "",
          a.answer === "no" ? "X" : "",
          a.answer === "na" ? "X" : "",
          a.remark ?? "",
        ]),
        [10, 50, 6, 6, 6, 22],
      ),
    );
  }

  // --- Signatures and audit ----------------------------------------------
  children.push(heading("Signatures", HeadingLevel.HEADING_1));
  children.push(
    gridTable(
      ["Role", "Name", "Date", "Record hash"],
      (doc.signatures ?? []).map((s) => [s.role, s.name, s.at ?? "", s.signatureHash ?? "—"]),
      [20, 30, 20, 30],
    ),
  );
  children.push(
    small(
      "Electronic records and digital signatures carry the same legal effect as writing and " +
        "handwritten signature under sections 4 and 5 of the Information Technology Act, 2000.",
    ),
  );

  if (doc.audit) {
    children.push(heading("Audit trail", HeadingLevel.HEADING_1));
    children.push(
      kvTable([
        ["Recorded events", String(doc.audit.eventCount)],
        [
          "Hash chain",
          doc.audit.chainVerified
            ? "Verified — every recorded observation is unaltered"
            : `BROKEN — ${doc.audit.chainNote ?? "the chain did not verify"}`,
        ],
        ["First record", doc.audit.firstRecordedAt ?? "—"],
        ["Last record", doc.audit.lastRecordedAt ?? "—"],
      ]),
    );
    children.push(
      small(
        "Observations are held in an append-only log. Amendments are recorded as new entries " +
          "carrying date and person; the original entry is retained (ISO/IEC 17025 §7.8).",
      ),
    );
  }

  const document = new Document({
    creator: "TulaSetu",
    title: `Type evaluation report ${doc.identity.reportId}`,
    description: "OIML R 76-2 type evaluation test report",
    sections: [
      {
        properties: {},
        ...(draft ? { headers: { default: new Header({ children: [draftWatermark()] }) } } : {}),
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: draft
                      ? `${doc.identity.reportId} · DRAFT — not a record copy`
                      : `${doc.identity.reportId} · ${doc.lab.name}`,
                    size: 15,
                    color: "666666",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(document));
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * The actual DRAFT watermark: a rotated, semi-transparent shape in the page header, so it
 * repeats behind the content of every page rather than announcing itself once at the top of
 * page one. DIR-08 flagged the earlier version — a small grey line of footer text — as not a
 * watermark at all; a laboratory officer flicking to page 12 of a review copy saw nothing to
 * distinguish it from a record copy there.
 *
 * `Textbox` here compiles to the same construct Word's own "Insert Watermark" feature writes:
 * a VML `v:shape` (`position:absolute`, a negative `z-index` so body text draws over it,
 * `rotation:315` for the diagonal) holding a `v:textbox`. It is intentionally *not* a
 * `Paragraph`, so it sits outside `IHeaderOptions`'s declared `(Paragraph | Table)[]` children
 * type even though `Header` renders it correctly (confirmed by inspecting the produced
 * `header1.xml`) — the type surface for VML shapes lagging their own implementation in `docx`
 * 9.7.1. The cast below is that gap, not a mistake; narrowed to this one call so a real
 * behavioural regression elsewhere in this file would still be caught.
 */
function draftWatermark(): Paragraph {
  const shape = new Textbox({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "DRAFT", bold: true, size: 220, color: "D9D9D9" })],
      }),
    ],
    style: {
      width: "460pt",
      height: "150pt",
      position: "absolute",
      positionHorizontal: "center",
      positionHorizontalRelative: "page",
      positionVertical: "center",
      positionVerticalRelative: "page",
      rotation: 315,
      zIndex: -1,
      wrapStyle: "none",
    },
  });
  return shape as unknown as Paragraph;
}

function draftBanner(recordHash?: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.CLEAR, fill: "FDE2E2" },
      spacing: { after: 120 },
      children: [new TextRun({ text: "D R A F T", bold: true, size: 44, color: "9B1C1C" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text:
            "This Word document is a review copy for the AD/DD cycle. It is editable and is " +
            "therefore not the record copy. The record copy is the locked PDF" +
            (recordHash ? `, SHA-256 ${recordHash}` : "") +
            ".",
          italics: true,
          size: 17,
          color: "9B1C1C",
        }),
      ],
    }),
  ];
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function small(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 16, color: "555555" })],
    spacing: { after: 120 },
  });
}

const THIN = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

function cell(text: string, opts: { bold?: boolean; fill?: string; widthPct?: number } = {}): TableCell {
  return new TableCell({
    borders: BORDERS,
    ...(opts.fill ? { shading: { type: ShadingType.CLEAR, fill: opts.fill } } : {}),
    ...(opts.widthPct ? { width: { size: opts.widthPct, type: WidthType.PERCENTAGE } } : {}),
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "", bold: opts.bold, size: 17 })],
      }),
    ],
  });
}

function kvTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [cell(k, { bold: true, fill: "F4F4F4", widthPct: 35 }), cell(v, { widthPct: 65 })],
        }),
    ),
  });
}

function gridTable(headers: string[], rows: string[][], widths?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, idx) =>
          cell(h, { bold: true, fill: "ECECEC", ...(widths?.[idx] ? { widthPct: widths[idx] } : {}) }),
        ),
      }),
      ...(rows.length
        ? rows.map(
            (r) =>
              new TableRow({
                children: headers.map((_, idx) =>
                  cell(r[idx] ?? "", widths?.[idx] ? { widthPct: widths[idx] } : {}),
                ),
              }),
          )
        : [new TableRow({ children: headers.map(() => cell("")) })]),
    ],
  });
}

function formSection(f: RenderedForm): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    heading(`${f.formId}  ${f.title}${f.rangeIndex ? ` — weighing range ${f.rangeIndex}` : ""}`,
      HeadingLevel.HEADING_1),
  ];
  if (f.clause) out.push(small(f.clause));

  if (f.verdict === "NA") {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${NOT_APPLICABLE_MARK}  `, bold: true, size: 24 }),
          new TextRun({ text: f.notApplicableReason ?? "Not applicable to this instrument." }),
        ],
      }),
    );
    return out;
  }

  if (f.environment?.length) {
    out.push(
      gridTable(
        ["", ...f.environment.map((e) => e.checkpoint)],
        [
          ["Temperature", ...f.environment.map((e) => (e.temperatureC ?? "—") + " °C")],
          ["Relative humidity", ...f.environment.map((e) => (e.relativeHumidityPct ?? "—") + " %")],
          ["Barometric pressure", ...f.environment.map((e) => (e.pressureHPa ?? "—") + " hPa")],
        ],
      ),
    );
  }

  if (f.formulas?.length) for (const x of f.formulas) out.push(small(x));

  // Sub-columns are flattened into distinct headers ("Error, E ↓" / "Error, E ↑") because
  // Word tables have no clean two-tier header. The information is preserved; only the
  // presentation differs from the PDF.
  const headers = f.columns.flatMap((c) =>
    c.subcolumns?.length ? c.subcolumns.map((s) => `${c.label} ${s}`) : [c.label],
  );
  out.push(gridTable(headers, f.rows.map((row) => row.map((c: Cell) => c.value))));

  if (f.acceptance) out.push(new Paragraph({ children: [new TextRun({ text: f.acceptance, bold: true })] }));
  out.push(
    new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun({ text: verdictMark(f.verdict), bold: true, color: verdictColor(f.verdict) }),
      ],
    }),
  );
  for (const n of f.notes ?? []) out.push(small(n));
  return out;
}

function verdictMark(v: string): string {
  return v === "NA" ? NOT_APPLICABLE_MARK : v;
}

function verdictColor(v: string | null): string {
  return v === "PASSED" ? "0A5C2B" : v === "FAILED" ? "9B1C1C" : "555555";
}
