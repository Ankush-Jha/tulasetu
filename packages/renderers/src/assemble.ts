/**
 * Assemble a `ReportDocument` from engine output plus the R 76-2 forms file.
 *
 * This is the only place that knows how a computed row becomes a printed row. Keeping it in
 * one function is what lets the PDF, DOCX and JSON outputs be guaranteed consistent: they all
 * consume the same assembled document, so they cannot drift apart.
 *
 * Layout comes from `packages/rulepacks/forms/R76-2_2007_forms.json`, which was transcribed
 * from the standard. This module supplies no column labels, no formulas and no acceptance
 * criteria of its own — if a form's shape is wrong, the fix is in the forms file.
 */

import type { AccuracyClass, InstrumentProfile, MassUnit, Verdict } from "@tulasetu/engine";
import type {
  Cell,
  RenderedForm,
  ReportDocument,
  SummaryRow,
} from "./model.js";

// --- The shape of the forms file -------------------------------------------
//
// Declared once, in the engine, and re-exported here. There used to be a second copy in this
// file, which is how the two drifted: the engine typed `kernel` as a KernelId and this one as
// a string, so a forms file that named a kernel the engine cannot run type-checked cleanly on
// its way to the renderer. The entry screen, the runner and the renderer all read the same
// file, so they read the same description of it.

import type { FormColumnSpec, FormSpec, FormsFile } from "@tulasetu/engine";

export type { FormColumnSpec, FormSpec, FormsFile };

/** Index a forms file by form id for lookup during assembly. */
export function indexForms(file: FormsFile): Map<string, FormSpec> {
  return new Map(file.forms.map((f) => [f.formId, f]));
}

// --- Inputs ----------------------------------------------------------------

/** One computed form, as the orchestration layer hands it over. */
export interface ComputedForm {
  formId: string;
  testId?: string;
  rangeIndex?: number;
  applicable: boolean;
  verdict: Verdict;
  notApplicableReason?: string;
  /** Rows keyed by the column keys declared in the forms file. */
  rows?: Record<string, unknown>[];
  /** Column keys whose cell failed, per row index, so the renderer can mark them. */
  failedCells?: { rowIndex: number; keys: string[] }[];
  environment?: {
    checkpoint: string;
    temperatureC?: number;
    relativeHumidityPct?: number;
    pressureHPa?: number;
  }[];
}

export interface AssembleInput {
  reportId: string;
  applicationNo?: string;
  approvalMark?: string;
  profile: "IN_Sch7A" | "OIML_R76";
  rulesetId: string;
  rulesetVersion?: string;
  edition: string;
  status: string;
  lab: ReportDocument["lab"];
  instrument: InstrumentProfile;
  /** Free-text extras that are not part of the engine's InstrumentProfile. */
  instrumentExtras?: Partial<ReportDocument["instrument"]>;
  forms: ComputedForm[];
  formsFile: FormsFile;
  testEquipment?: ReportDocument["testEquipment"];
  checklists?: ReportDocument["checklists"];
  family?: ReportDocument["family"];
  modules?: ReportDocument["modules"];
  signatures?: ReportDocument["signatures"];
  audit?: ReportDocument["audit"];
  /** Injected rather than read from the clock, so a rendering is reproducible. */
  generatedAt: string;
  caveats?: string[];
}

// --- Assembly ---------------------------------------------------------------

export function assembleReport(input: AssembleInput): ReportDocument {
  const specs = indexForms(input.formsFile);
  const unit = input.instrument.unit;

  const forms: RenderedForm[] = input.forms.map((cf) => {
    const spec = specs.get(cf.formId);
    const columns = spec?.columns ?? inferColumns(cf);

    // A form the standard does not require for this instrument still gets a page, carrying
    // the reason. R 76-2 marks it "– –"; dropping the page would lose the record that the
    // question was asked and deliberately answered.
    if (!cf.applicable || cf.verdict === "NA") {
      return {
        formId: cf.formId,
        title: spec?.title ?? cf.formId,
        ...(spec?.clause ? { clause: spec.clause } : {}),
        ...(cf.rangeIndex ? { rangeIndex: cf.rangeIndex } : {}),
        verdict: "NA" as Verdict,
        ...(cf.notApplicableReason ? { notApplicableReason: cf.notApplicableReason } : {}),
        columns: columns.map(toRenderColumn),
        rows: [],
      };
    }

    const failedByRow = new Map<number, Set<string>>();
    for (const f of cf.failedCells ?? []) failedByRow.set(f.rowIndex, new Set(f.keys));

    const rows: Cell[][] = (cf.rows ?? []).map((row, rowIndex) => {
      const failed = failedByRow.get(rowIndex);
      const out: Cell[] = [];
      for (const col of columns) {
        const kind = col.kind === "computed" ? "computed" : "input";
        if (col.subcolumns?.length) {
          // Sub-columned values arrive as an object keyed by the sub-column marker, e.g.
          // { "↓": 1000.0, "↑": 1000.5 } for the two directions of loading.
          const bucket = (row[col.key] ?? {}) as Record<string, unknown>;
          for (const sub of col.subcolumns) {
            out.push({
              value: formatValue(bucket?.[sub], col, unit),
              kind,
              ...(failed?.has(`${col.key}:${sub}`) || failed?.has(col.key) ? { failed: true } : {}),
            });
          }
        } else {
          out.push({
            value: formatValue(row[col.key], col, unit),
            kind,
            ...(failed?.has(col.key) ? { failed: true } : {}),
          });
        }
      }
      return out;
    });

    return {
      formId: cf.formId,
      title: spec?.title ?? cf.formId,
      ...(spec?.clause ? { clause: spec.clause } : {}),
      ...(cf.rangeIndex ? { rangeIndex: cf.rangeIndex } : {}),
      verdict: cf.verdict,
      ...(cf.environment?.length ? { environment: cf.environment } : {}),
      columns: columns.map(toRenderColumn),
      rows,
      ...(spec?.formulas?.length ? { formulas: spec.formulas } : {}),
      ...(spec?.acceptance ? { acceptance: spec.acceptance } : {}),
      ...(spec?.notes?.length ? { notes: spec.notes } : {}),
    };
  });

  const summary: SummaryRow[] = forms.map((f) => ({
    formId: f.formId,
    title: f.title,
    verdict: f.verdict,
    ...(f.notApplicableReason ? { notApplicableReason: f.notApplicableReason } : {}),
    ...(f.rangeIndex ? { rangeIndex: f.rangeIndex } : {}),
  }));

  // A report is PASSED only once every applicable form has passed. Any failure fails the
  // whole report; anything still missing leaves it in progress rather than passing by default.
  const applicable = forms.filter((f) => f.verdict !== "NA");
  const overallVerdict: Verdict | null = applicable.some((f) => f.verdict === "FAILED")
    ? "FAILED"
    : applicable.length > 0 && applicable.every((f) => f.verdict === "PASSED")
      ? "PASSED"
      : null;

  const LOCKED_STATES = ["LOCKED", "CERTIFICATE_ISSUED", "PUBLISHED"];

  return {
    identity: {
      reportId: input.reportId,
      ...(input.applicationNo ? { applicationNo: input.applicationNo } : {}),
      ...(input.approvalMark ? { approvalMark: input.approvalMark } : {}),
      profile: input.profile,
      rulesetId: input.rulesetId,
      ...(input.rulesetVersion ? { rulesetVersion: input.rulesetVersion } : {}),
      edition: input.edition,
    },
    lab: input.lab,
    instrument: describeInstrument(input.instrument, input.instrumentExtras),
    status: input.status,
    draft: !LOCKED_STATES.includes(input.status),
    overallVerdict,
    ...(input.testEquipment ? { testEquipment: input.testEquipment } : {}),
    summary,
    forms,
    ...(input.checklists ? { checklists: input.checklists } : {}),
    ...(input.family ? { family: input.family } : {}),
    ...(input.modules ? { modules: input.modules } : {}),
    ...(input.signatures ? { signatures: input.signatures } : {}),
    ...(input.audit ? { audit: input.audit } : {}),
    generatedAt: input.generatedAt,
    ...(input.caveats?.length ? { caveats: input.caveats } : {}),
  };
}

// --- Presentation of the instrument ----------------------------------------

/**
 * Render the instrument block the way the form prints it.
 *
 * A multi-interval instrument is written "Max 2 / 5 / 15 kg", "e = 1 / 2 / 10 g" — one Max,
 * one weighing range, several partial ranges — which is exactly how R 76-1 §3.3's worked
 * example writes it. A multiple-range instrument is a set of independent ranges and is
 * written with an explicit "range 1 / range 2" prefix instead, because conflating the two
 * presentations would misrepresent what was tested.
 */
export function describeInstrument(
  p: InstrumentProfile,
  extras: Partial<ReportDocument["instrument"]> = {},
): ReportDocument["instrument"] {
  const u = p.unit;
  const ranges = p.ranges;

  const maxCapacityText =
    p.rangeKind === "multiple-range"
      ? ranges.map((r, idx) => `range ${idx + 1}: ${fmt(r.max)} ${u}`).join("; ")
      : `${ranges.map((r) => fmt(r.max)).join(" / ")} ${u}`;

  const scaleIntervalText =
    p.rangeKind === "multiple-range"
      ? ranges.map((r, idx) => `range ${idx + 1}: ${fmt(r.e)} ${u}`).join("; ")
      : `${ranges.map((r) => fmt(r.e)).join(" / ")} ${u}`;

  const first = ranges[0];
  const minCapacityText = first ? `${fmt(first.min)} ${u}` : undefined;

  const nText = ranges
    .map((r, idx) => {
      const n = r.n ?? (r.e > 0 ? Math.round(r.max / r.e) : undefined);
      return n === undefined ? "—" : p.rangeKind === "single" ? String(n) : `n${idx + 1} = ${n}`;
    })
    .join(", ");

  return {
    ...(p.manufacturer ? { manufacturer: p.manufacturer } : {}),
    ...(p.model ? { model: p.model } : {}),
    ...(p.serialNumber ? { serialNumber: p.serialNumber } : {}),
    accuracyClass: describeClass(p.accuracyClass, p.directSalesToPublic),
    maxCapacityText,
    ...(minCapacityText ? { minCapacityText } : {}),
    scaleIntervalText,
    nText,
    indicatingType: p.indicatingType,
    rangeKind: p.rangeKind,
    electronic: p.electronic,
    ...(p.powerSupply?.length ? { powerSupply: p.powerSupply.join(", ") } : {}),
    ...(p.softwareVersion ? { softwareVersion: p.softwareVersion } : {}),
    ...(p.softwareChecksum ? { softwareChecksum: p.softwareChecksum } : {}),
    ...extras,
  };
}

/**
 * Print the class symbol.
 *
 * The canonical OIML symbol is kept, with India's alternate spelling shown alongside for the
 * ordinary class — India's own Seventh Schedule uses "IV" in its tables and "IIII" in its test
 * procedures, in the same document, so a report that shows only one of them is ambiguous to
 * exactly the reader who cares. Class II intended for direct sales to the public prints as
 * "II*", which is an Indian designation with no OIML equivalent.
 */
export function describeClass(cls: AccuracyClass, directSales?: boolean): string {
  if (cls === "IIII") return "IIII (written IV in the Seventh Schedule tables)";
  if (cls === "II" && directSales) return "II* (class II for direct sales to the public)";
  return cls;
}

// --- Formatting -------------------------------------------------------------

function toRenderColumn(c: FormColumnSpec) {
  return {
    key: c.key,
    label: c.label,
    ...(c.kind ? { kind: c.kind } : {}),
    ...(c.subcolumns?.length ? { subcolumns: c.subcolumns } : {}),
  };
}

function formatValue(v: unknown, col: FormColumnSpec, unit: MassUnit): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";

  // A value can arrive as a { "↓": …, "↑": … } pair for a column the form does not split.
  // Stringifying it would print "[object Object]" onto a legal document — which is exactly
  // what happened before this guard existed. Take the down-direction reading, or the first
  // value present, and render that.
  if (typeof v === "object") {
    const bucket = v as Record<string, unknown>;
    const first = bucket["↓"] ?? bucket["down"] ?? Object.values(bucket)[0];
    // One level only: a nested object is a bug upstream, and blank is the honest rendering.
    return first === undefined || typeof first === "object" ? "" : formatValue(first, col, unit);
  }

  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "—";
  return col.unit === "mass" ? `${fmt(v)} ${unit}` : fmt(v);
}

/**
 * Format a mass for printing.
 *
 * Trailing zeros are trimmed but significant digits are not: an error of 0.5 g must never be
 * shown as "1" because a display rule rounded it. Anything below the resolution the engine
 * computed at would misrepresent the measurement.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  // Six decimals covers class I work at e = 0.001 g with room to spare.
  return String(Number(n.toFixed(6)));
}

/** Fallback when the forms file has no spec for a form id — derived from the data present. */
function inferColumns(cf: ComputedForm): FormColumnSpec[] {
  const keys = new Set<string>();
  for (const r of cf.rows ?? []) for (const k of Object.keys(r)) keys.add(k);
  return [...keys].map((k) => ({ key: k, label: k, unit: "mass" }));
}
