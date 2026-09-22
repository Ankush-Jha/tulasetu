/**
 * The report document — the single structure every renderer consumes.
 *
 * There are three output formats (PDF for the record copy, DOCX for the AD/DD review cycle,
 * JSON for machines) and they must never disagree about content. So the engine's results are
 * assembled into this shape once, and each renderer is a pure projection of it. A renderer
 * never computes a verdict, never resolves an mpe, and never decides applicability — if a
 * renderer needs a number that is not in this document, the fix belongs upstream.
 *
 * The layout of each form comes from `packages/rulepacks/forms/R76-2_2007_forms.json`, which
 * was transcribed from R 76-2:2007 itself. That separation is the same rule as everywhere
 * else in Taraazu: the standard is data. Switching to the draft 5-part edition means loading
 * a different forms file, not editing a renderer.
 */

import type { Verdict } from "@taraazu/engine";

/** The R 76-2 marking convention: not-applicable prints as an en-dash pair, not as blank. */
export const NOT_APPLICABLE_MARK = "– –";

export interface BilingualText {
  en: string;
  /** Devanagari. The sampled certificates are bilingual, so the report furniture is too. */
  hi?: string;
}

export interface ReportIdentity {
  reportId: string;
  applicationNo?: string;
  /** Rule 12 approval mark: IND / lab-code / year / model-code. Present once approved. */
  approvalMark?: string;
  certificateNo?: string;
  /** Which output profile this rendering targets. Rule 7(1)(a) permits either. */
  profile: "IN_Sch7A" | "OIML_R76";
  rulesetId: string;
  rulesetVersion?: string;
  /** R 76-2 edition being rendered. Drives which forms file is used. */
  edition: string;
}

export interface LabBlock {
  name: string;
  kind: string;
  labCode?: string;
  nablAccredited?: boolean;
  address?: string;
}

export interface InstrumentBlock {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  accuracyClass: string;
  /** As printed on the form: "Max 2 / 5 / 15 kg". */
  maxCapacityText: string;
  minCapacityText?: string;
  scaleIntervalText?: string;
  nText?: string;
  indicatingType: string;
  rangeKind: string;
  electronic: boolean;
  powerSupply?: string;
  softwareVersion?: string;
  /** R 76-1 Annex G software identification. Validated, not merely displayed. */
  softwareChecksum?: string;
  loadCell?: string;
  /** Findings from the checksum validator, printed under the field they concern. */
  softwareIdentificationIssues?: { code: string; message: string; clause?: string }[];
}

export interface EnvironmentBlock {
  /** "At start" / "At max" / "At end" — the header R 76-2 puts on env-sensitive forms. */
  checkpoint: string;
  temperatureC?: number;
  relativeHumidityPct?: number;
  pressureHPa?: number;
}

/** One rendered cell. `computed` cells are shaded on the form to distinguish them from entry. */
export interface Cell {
  value: string;
  kind?: "input" | "computed";
  /** Set when this cell is the one that failed, so the renderer can mark it. */
  failed?: boolean;
}

export interface RenderedForm {
  formId: string;
  title: string;
  clause?: string;
  /** Non-null only for multiple-range instruments, which get a form set per range. */
  rangeIndex?: number;
  verdict: Verdict;
  /** Required when verdict === "NA"; printed beside the "– –". */
  notApplicableReason?: string;
  environment?: EnvironmentBlock[];
  /** Column headers, in order, from the forms file. */
  columns: { key: string; label: string; kind?: string; subcolumns?: string[] }[];
  rows: Cell[][];
  formulas?: string[];
  acceptance?: string;
  notes?: string[];
}

export interface SummaryRow {
  formId: string;
  title: string;
  verdict: Verdict;
  notApplicableReason?: string;
  rangeIndex?: number;
}

export interface ChecklistAnswer {
  ref: string;
  text: string;
  answer: "yes" | "no" | "na";
  remark?: string;
}

export interface ChecklistBlock {
  id: string;
  title: string;
  applicable: boolean;
  notApplicableReason?: string;
  answers: ChecklistAnswer[];
}

/** The family/EUT solver's output, rendered as its own section. */
export interface FamilyBlock {
  variants: { id: string; family?: string; max: string; e: string; d: string; n: string; eut: boolean; justification: string }[];
  /** The generated certificate clause — the thing the certificate itself carries. */
  coverageClause: string;
}

export interface ModuleBlock {
  checks: { check: string; passed: boolean; clause: string; required: string; actual: string; detail: string }[];
  verdict: Verdict;
}

export interface SignatureBlock {
  role: string;
  name: string;
  at?: string;
  /** Present once the event log entry for this step was signed (FR16). */
  signatureHash?: string;
}

export interface AuditBlock {
  eventCount: number;
  chainVerified: boolean;
  chainNote?: string;
  firstRecordedAt?: string;
  lastRecordedAt?: string;
}

export interface ReportDocument {
  identity: ReportIdentity;
  lab: LabBlock;
  instrument: InstrumentBlock;
  /** Report-level status; drives the DRAFT watermark. */
  status: string;
  /** True until the report is LOCKED. DOCX and any non-final PDF carry a DRAFT watermark. */
  draft: boolean;
  overallVerdict: Verdict | null;
  testEquipment?: { description: string; identification?: string; traceability?: string }[];
  summary: SummaryRow[];
  forms: RenderedForm[];
  checklists?: ChecklistBlock[];
  family?: FamilyBlock;
  modules?: ModuleBlock;
  signatures?: SignatureBlock[];
  audit?: AuditBlock;
  generatedAt: string;
  /** Anything the engine could not determine, surfaced rather than silently omitted. */
  caveats?: string[];
}

/**
 * Report furniture in both languages. The sampled certificates on the national register are
 * bilingual, so a report that feeds them should be too.
 *
 * Only fixed furniture is translated. Test data, instrument identity and the standard's own
 * clause text stay as recorded — machine-translating a legal threshold would be exactly the
 * kind of thing CLAUDE.md's "no AI in the legally relevant path" rule exists to prevent.
 */
export const LABELS: Record<string, BilingualText> = {
  reportTitle: {
    en: "Type Evaluation Test Report — Non-Automatic Weighing Instrument",
    hi: "प्ररूप मूल्यांकन परीक्षण रिपोर्ट — अस्वचालित तौल यंत्र",
  },
  generalInformation: { en: "General information", hi: "सामान्य जानकारी" },
  laboratory: { en: "Laboratory", hi: "प्रयोगशाला" },
  manufacturer: { en: "Manufacturer", hi: "विनिर्माता" },
  model: { en: "Model", hi: "मॉडल" },
  serialNumber: { en: "Serial number", hi: "क्रम संख्या" },
  accuracyClass: { en: "Accuracy class", hi: "यथार्थता वर्ग" },
  maxCapacity: { en: "Maximum capacity, Max", hi: "अधिकतम क्षमता" },
  minCapacity: { en: "Minimum capacity, Min", hi: "न्यूनतम क्षमता" },
  scaleInterval: { en: "Verification scale interval, e", hi: "सत्यापन पैमाना अंतराल" },
  summaryOfTypeEvaluation: { en: "Summary of type evaluation", hi: "प्ररूप मूल्यांकन का सारांश" },
  test: { en: "Test", hi: "परीक्षण" },
  result: { en: "Result", hi: "परिणाम" },
  passed: { en: "PASSED", hi: "उत्तीर्ण" },
  failed: { en: "FAILED", hi: "अनुत्तीर्ण" },
  notApplicable: { en: "Not applicable", hi: "लागू नहीं" },
  checklist: { en: "Checklist", hi: "जाँच सूची" },
  signatures: { en: "Signatures", hi: "हस्ताक्षर" },
  draft: { en: "DRAFT", hi: "प्रारूप" },
  auditTrail: { en: "Audit trail", hi: "अंकेक्षण अभिलेख" },
  familyCoverage: { en: "Family coverage", hi: "श्रेणी कवरेज" },
  moduleCompatibility: { en: "Module compatibility", hi: "मॉड्यूल संगतता" },
};

export function label(key: string, bilingual: boolean): string {
  const l = LABELS[key];
  if (!l) return key;
  return bilingual && l.hi ? `${l.en} / ${l.hi}` : l.en;
}
