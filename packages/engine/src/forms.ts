/**
 * The form runner — one printed R 76-2 form in, one computed form out.
 *
 * Before this existed the API ran `k1ErrorVsMpe` on every form, whatever the form was. That is
 * wrong for nine of the twenty tests in the pack: creep is judged on ΔP against 0.5 e, not on
 * error against mpe; discrimination is judged on whether the indication moved by d; sensitivity
 * on a permanent displacement in millimetres; the disturbance forms on whether a fault exceeded
 * e without being detected. Feeding weighing rows into those forms produced a verdict that
 * looked exactly like a real one and answered a different question — the worst failure mode a
 * legal document has.
 *
 * So dispatch is data, like everything else here. The rule pack says which kernel decides a
 * form (`tests[].kernel`); `packages/rulepacks/forms/R76-2_2007_forms.json` says which columns
 * that form prints. This module is the join between them: it reads rows keyed by the printed
 * column keys, feeds the right kernel, and writes the computed values back under the column
 * keys the same form declares. The entry screen and the renderer both work off that one
 * description, so a column can never appear on screen that the report cannot print, or be
 * computed by a kernel the form does not name.
 *
 * Pure, per CLAUDE.md design rule #3: no I/O, no clock, no randomness. Both the forms file and
 * the rule pack are passed in.
 */

import type {
  AccuracyClass,
  InstrumentProfile,
  KernelId,
  VerificationStage,
  Verdict,
  WeighingObservation,
} from "./types.js";
import type { RulePack, TestRule } from "./rulepack.js";
import { resolveMpe } from "./mpe.js";
import { k1ErrorVsMpe } from "./kernels/k1.js";
import { k2Digital, k2Analog, k2NonSelfIndicating, type MpeLookup } from "./kernels/k2.js";
import { k3Sensitivity } from "./kernels/k3.js";
import { k4Creep, k4ZeroReturn, k4TemperatureNoLoad, k4SpanStability } from "./kernels/k4.js";
import { k5Form, type K5Trial } from "./kernels/k5.js";
import { k6StabilityOfEquilibrium } from "./kernels/k6.js";

// ---------------------------------------------------------------------------
// The shape a form is described in
// ---------------------------------------------------------------------------

export interface FormColumnSpec {
  key: string;
  label: string;
  /** "mass" | "time" | "count" | "percent" | "boolean" | "text" — drives the input control. */
  unit?: string;
  /** "input" is typed by the officer; "computed" is filled by the kernel and never editable. */
  kind?: "input" | "computed";
  subcolumns?: string[];
}

/**
 * Some forms print more than one table under one heading.
 *
 * Form 7 is the case: printing/storage, zero-setting and tare balancing are three tables with
 * different columns and one shared acceptance, so the form's own `columns` is empty and the
 * real layout lives here. A row records which sub-table it belongs to in its `subform` key.
 */
export interface FormSubformSpec {
  id: string;
  title: string;
  columns?: FormColumnSpec[];
  formulas?: string[];
  acceptance?: string;
  /** How many rows the printed form provides — five trials each, on form 7. */
  rows?: number;
}

export interface FormSpec {
  formId: string;
  title: string;
  clause?: string | null;
  kernel?: KernelId;
  columns?: FormColumnSpec[];
  subforms?: FormSubformSpec[];
  formulas?: string[];
  acceptance?: string | null;
  notes?: string[];
  environmental?: { checkpoints?: string[] } & Record<string, unknown>;
}

/**
 * A form with no columns, no formulas and no acceptance criterion is not a measurement.
 *
 * R 76-2 form 16 is a free-text page for describing the construction of the instrument; the
 * summary table still carries a PASSED/FAILED box for it, because it is an *examination* — an
 * officer's judgement recorded with remarks, not a number compared with a threshold. Deciding
 * that from the form's own layout means the rule pack does not have to carry a second flag
 * that could disagree with it.
 */
export function isExamination(spec: FormSpec | undefined): boolean {
  if (!spec) return false;
  const hasTable = (spec.columns?.length ?? 0) > 0 || (spec.subforms?.length ?? 0) > 0;
  return !hasTable;
}

/** Every column a form asks for, whether it prints one table or several. */
export function allColumns(spec: FormSpec | undefined): FormColumnSpec[] {
  if (!spec) return [];
  if (spec.columns?.length) return spec.columns;
  return (spec.subforms ?? []).flatMap((sf) => sf.columns ?? []);
}

export interface FormsFile {
  forms: FormSpec[];
  [key: string]: unknown;
}

/** One row as typed on the form: values keyed by the printed column key. */
export type FormRow = Record<string, number | string | boolean | null | undefined>;

/**
 * Form-level values that are printed in a form's header rather than in its table — the test
 * load a warm-up test is run at, the nominal mains voltage the disturbance forms record, the
 * two temperatures form 2 compares. They are part of the observation, so they are recorded
 * with it; they are not columns, so they do not go in `rows`.
 */
export type FormExtras = Record<string, number | string | boolean | null | undefined>;

export interface RunFormInput {
  formId: string;
  profile: InstrumentProfile;
  rows: FormRow[];
  extras?: FormExtras;
  stage?: VerificationStage;
}

export interface RunFormOutput {
  formId: string;
  testId: string;
  kernel: KernelId;
  verdict: Verdict;
  /**
   * The rows as they will be printed: every value the officer typed, plus every value the
   * kernel computed, under the column keys this form declares. The renderer needs no knowledge
   * of which kernel ran.
   */
  rows: (FormRow & { verdict?: Verdict })[];
  /** Form-level results that are not per-row — creep's ΔP conditions, a span variation. */
  summary: { label: string; value: string; verdict?: Verdict }[];
  /** What the kernel wants said about how it reached the verdict. */
  notes: string[];
  /** The acceptance criterion, copied from the printed form. */
  acceptance?: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function findTestRule(pack: RulePack, formId: string): TestRule | undefined {
  return pack.tests.find((t) => t.form === formId);
}

export function findFormSpec(forms: FormsFile, formId: string): FormSpec | undefined {
  return forms.forms.find((f) => f.formId === formId);
}

/**
 * Compute one form.
 *
 * Throws rather than guessing when the form is unknown to the pack: a form that no rule names
 * has no kernel, and a verdict produced anyway would be an assertion nothing stands behind.
 */
export function runForm(
  input: RunFormInput,
  pack: RulePack,
  forms: FormsFile,
): RunFormOutput {
  const rule = findTestRule(pack, input.formId);
  if (!rule) {
    throw new Error(
      `No test rule in rule pack ${pack.ruleset_id} names form ${input.formId}. Every form the ` +
        `entry screen offers must come from the pack, so this means the two have drifted apart.`,
    );
  }
  const spec = findFormSpec(forms, input.formId);
  const params = (rule.params ?? {}) as Record<string, unknown>;

  const base = {
    formId: input.formId,
    testId: rule.id,
    kernel: rule.kernel,
    ...(spec?.acceptance ? { acceptance: spec.acceptance } : {}),
  };

  // An examination is recorded, not computed: the officer's verdict and their remarks are the
  // observation. Running a kernel over it would be inventing a measurement that was not made.
  if (isExamination(spec)) {
    const verdict = (String(input.extras?.["verdict"] ?? "PASSED").toUpperCase() as Verdict);
    const remarks = input.extras?.["remarks"];
    return {
      ...base,
      verdict: verdict === "FAILED" ? "FAILED" : verdict === "NA" ? "NA" : "PASSED",
      rows: [],
      summary: [
        { label: "Examination", value: remarks ? String(remarks) : "Recorded", verdict },
      ],
      notes: [
        "R 76-2 records this as an examination rather than a measurement: there is no computed " +
          "value, and the summary table carries the examiner's own PASSED / FAILED mark.",
      ],
    };
  }

  switch (rule.kernel) {
    case "K1":
      return { ...base, ...runK1(input, pack) };
    case "K2":
      return { ...base, ...runK2(input, pack, rule, params) };
    case "K3":
      return { ...base, ...runK3(input, pack, params) };
    case "K4":
      return { ...base, ...runK4(input, pack, rule, params) };
    case "K5":
      return { ...base, ...runK5(input, pack) };
    case "K6":
      return { ...base, ...runK6(input, pack, params) };
    default:
      throw new Error(`Form ${input.formId} names kernel ${String(rule.kernel)}, which does not exist.`);
  }
}

// ---------------------------------------------------------------------------
// Reading a row
// ---------------------------------------------------------------------------

function num(row: FormRow, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function optNum(row: FormRow, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function bool(row: FormRow, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    // The printed forms mark a positive observation with "+" or "X", not with the word "true".
    if (["+", "x", "yes", "y", "true", "1"].includes(s)) return true;
    if (["-", "–", "no", "n", "false", "0"].includes(s)) return false;
  }
  return false;
}

function text(row: FormRow, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    return String(v);
  }
  return undefined;
}

/** The e in force at a given load — the number every fixed-multiple threshold is set on. */
function eAt(profile: InstrumentProfile, load: number, pack: RulePack): number {
  try {
    return resolveMpe(profile, load, pack).e;
  } catch {
    return profile.ranges[0]?.e ?? 1;
  }
}

/** e1 — the smallest verification scale interval across all ranges (R 76-1 §3.9.2.3). */
function smallestE(profile: InstrumentProfile): number {
  return Math.min(...profile.ranges.map((r) => r.e));
}

function mpeLookup(profile: InstrumentProfile, pack: RulePack, stage?: VerificationStage): MpeLookup {
  return (load: number) => resolveMpe(profile, load, pack, stage ?? "initial");
}

const GRAMS_PER_UNIT: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 };

function toKg(value: number, unit: string): number {
  return (value * (GRAMS_PER_UNIT[unit] ?? 1)) / 1000;
}

// ---------------------------------------------------------------------------
// K1 — error against mpe
// ---------------------------------------------------------------------------

/**
 * Forms 1, 3.1, 3.2, 5, 8, 9, 10, 11, 13a-c, 15a/c and 16.
 *
 * Two of these do not print a `load` column at all. Form 10 (warm-up) prints "Unloaded /
 * Loaded" against a test load recorded in the header, and form 8 (tilting) does the same. The
 * load is still what the kernel needs, so it is reconstructed from the header value — which is
 * why `testLoad` is an extra rather than something the officer retypes on every row.
 */
function runK1(input: RunFormInput, pack: RulePack) {
  const testLoad = Number(input.extras?.["testLoad"] ?? 0);

  const observations: WeighingObservation[] = input.rows.map((row) => {
    const condition = text(row, "loadCondition", "position")?.toLowerCase() ?? "";
    const explicit = optNum(row, "load", "load0");
    const load =
      explicit !== undefined
        ? explicit
        : condition.includes("unload") || condition.includes("no load")
          ? 0
          : condition.includes("load")
            ? testLoad
            : testLoad;

    const label = text(row, "label", "location", "section", "direction", "weighingNo", "time", "voltage", "no");
    return {
      load,
      indication: num(row, "indication", "indicationOfLoad", "indicationOfZero"),
      additionalLoad: num(row, "additionalLoad", "additionalLoad0"),
      ...(label ? { label } : {}),
    };
  });

  const zeroError = optNum(input.extras ?? {}, "zeroError");
  const result = k1ErrorVsMpe(
    {
      profile: input.profile,
      observations,
      ...(zeroError !== undefined ? { zeroError } : {}),
      ...(input.stage ? { stage: input.stage } : {}),
    },
    pack,
  );

  const rows = result.rows.map((r, i) => ({
    ...input.rows[i],
    load: r.load,
    indication: r.indication,
    additionalLoad: r.additionalLoad,
    p: round(r.priorToRounding),
    error: round(r.error),
    correctedError: round(r.correctedError),
    // Form 10 prints the same quantity under its own name: EL - E0 is the corrected error.
    elMinusE0: round(r.correctedError),
    mpe: round(r.mpe.mpe),
    verdict: r.verdict,
  }));

  const notes = result.rows.some((r) => r.roundingEliminated)
    ? ["Rounding error eliminated (d > 0.2 e) — E = I + ½e − ΔL − L (R 76-1 §3.5.3.2)."]
    : ["Rounding error not eliminated (d ≤ 0.2 e) — E = I − L (R 76-1 §3.5.3.2)."];

  return { verdict: result.verdict, rows, summary: [], notes };
}

// ---------------------------------------------------------------------------
// K2 — discrimination
// ---------------------------------------------------------------------------

/** Forms 4.1.1 (digital), 4.1.2 (analog) and 4.1.3 (non-self-indicating). */
function runK2(
  input: RunFormInput,
  pack: RulePack,
  rule: TestRule,
  params: Record<string, unknown>,
) {
  const packParams =
    ((pack as unknown as { kernel_params?: Record<string, Record<string, unknown>> })
      .kernel_params?.["discrimination"] ?? {}) as Record<string, unknown>;
  const mpe = mpeLookup(input.profile, pack, input.stage);

  if (rule.form === "4.1.1") {
    const factor = Number(params["extra_load_factor"] ?? packParams["extra_load_factor"] ?? 1.4);
    const trials = input.rows.map((row) => {
      const load = num(row, "load");
      return {
        load,
        indicationBefore: num(row, "indication1"),
        // d is the actual scale interval in force at this load, not a value retyped per row.
        actualScaleInterval: input.profile.ranges.find((r) => load <= r.max)?.d ?? input.profile.ranges[0]!.d,
        extraLoadApplied: num(row, "extraLoad"),
        indicationAfter: num(row, "indication2"),
        ...(text(row, "label") ? { label: text(row, "label")! } : {}),
      };
    });
    const out = k2Digital(trials, { extraLoadFactor: factor });
    const rows = out.rows.map((r, i) => ({
      ...input.rows[i],
      difference: round(r.delta),
      requiredDifference: round(r.requiredDelta),
      expectedExtraLoad: round(r.extraLoadExpected),
      verdict: r.verdict,
    }));
    const offProcedure = out.rows.filter((r) => r.extraLoadOffProcedure).length;
    return {
      verdict: out.verdict,
      rows,
      summary: [],
      notes: [
        `Add ${factor} d and require the indication to rise by at least d (R 76-1 §3.8.2.2).`,
        ...(offProcedure > 0
          ? [`${offProcedure} row(s) applied an extra load more than 5 % away from ${factor} d.`]
          : []),
      ],
    };
  }

  if (rule.form === "4.1.2") {
    const fraction = Number(params["displacement_fraction"] ?? packParams["displacement_fraction"] ?? 0.7);
    const trials = input.rows.map((row) => ({
      load: num(row, "load"),
      indicationBefore: num(row, "indication1"),
      extraLoadApplied: num(row, "extraLoad"),
      indicationAfter: num(row, "indication2"),
      ...(text(row, "label") ? { label: text(row, "label")! } : {}),
    }));
    const out = k2Analog(trials, mpe, { displacementFraction: fraction });
    const rows = out.rows.map((r, i) => ({
      ...input.rows[i],
      difference: round(r.delta),
      mpe: round(r.mpeAtLoad),
      requiredDifference: round(r.requiredDelta),
      verdict: r.verdict,
    }));
    return {
      verdict: out.verdict,
      rows,
      summary: [],
      notes: [`Add |mpe| and require a displacement of at least ${fraction} × |mpe| (R 76-1 §3.8.2.1).`],
    };
  }

  // 4.1.3 — non-self-indicating. The form records "+" for a visible displacement, so there is
  // no magnitude to compare; the observation itself is the verdict.
  const fraction = Number(
    params["non_self_extra_load_fraction"] ?? packParams["non_self_extra_load_fraction"] ?? 0.4,
  );
  const trials = input.rows.map((row) => ({
    load: num(row, "load"),
    extraLoadApplied: num(row, "extraLoad"),
    visibleDisplacement: bool(row, "visibleDisplacement"),
    ...(text(row, "label") ? { label: text(row, "label")! } : {}),
  }));
  const out = k2NonSelfIndicating(trials, mpe, { extraLoadFraction: fraction });
  const rows = out.rows.map((r, i) => ({
    ...input.rows[i],
    mpe: round(r.mpeAtLoad),
    expectedExtraLoad: round(r.extraLoadExpected),
    verdict: r.verdict,
  }));
  return {
    verdict: out.verdict,
    rows,
    summary: [],
    notes: [
      `Add ${fraction} × |mpe| and require a visible displacement of the indicating element ` +
        `(R 76-1 §3.8.1). Mark the displacement with "+".`,
    ],
  };
}

// ---------------------------------------------------------------------------
// K3 — sensitivity
// ---------------------------------------------------------------------------

/** Form 4.2. Judged in millimetres of permanent displacement, never against mpe. */
function runK3(input: RunFormInput, pack: RulePack, params: Record<string, unknown>) {
  const maxKg = toKg(
    Math.max(...input.profile.ranges.map((r) => r.max)),
    input.profile.unit,
  );
  const trials = input.rows.map((row) => ({
    load: num(row, "load"),
    permanentDisplacementMm: num(row, "permanentDisplacement", "permanentDisplacementMm"),
    ...(text(row, "label") ? { label: text(row, "label")! } : {}),
  }));

  const k3Params = params["min_displacement_mm"] as
    | { classIOrII: number; classIIIOrIIII_atOrBelowBoundary: number; classIIIOrIIII_aboveBoundary: number }
    | undefined;

  const out = k3Sensitivity(
    input.profile.accuracyClass as AccuracyClass,
    maxKg,
    trials,
    k3Params ? { minDisplacementMm: k3Params } : {},
  );

  const rows = out.rows.map((r, i) => ({
    ...input.rows[i],
    requiredDisplacement: r.requiredMm,
    verdict: r.verdict,
  }));
  return {
    verdict: out.verdict,
    rows,
    summary: [
      { label: "Required permanent displacement", value: `≥ ${out.requiredMm} mm` },
      { label: "Max", value: `${round(maxKg)} kg` },
    ],
    notes: [
      `Class ${input.profile.accuracyClass} at Max ${round(maxKg)} kg requires a permanent ` +
        `displacement of at least ${out.requiredMm} mm (R 76-1 §4.4.1).`,
    ],
  };
}

// ---------------------------------------------------------------------------
// K4 — the time-delta family
// ---------------------------------------------------------------------------

/** Forms 2 (temperature at no load), 6.1 (zero return), 6.2 (creep) and 14 (span stability). */
function runK4(
  input: RunFormInput,
  pack: RulePack,
  rule: TestRule,
  params: Record<string, unknown>,
) {
  if (rule.form === "6.2") return runCreep(input, pack);
  if (rule.form === "6.1") return runZeroReturn(input, pack);
  if (rule.form === "2") return runTempNoLoad(input, pack, params);
  return runSpanStability(input, pack);
}

/** Minutes, from the printed labels the form uses ("30 min", "1h", "4h"). */
function minutesOf(row: FormRow): number {
  const raw = row["timeOfReading"] ?? row["time"] ?? row["atMinutes"];
  if (raw === undefined || raw === null || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().toLowerCase();
  const hours = s.match(/^([\d.]+)\s*h/);
  if (hours) return Number(hours[1]) * 60;
  const mins = s.match(/([\d.]+)/);
  return mins ? Number(mins[1]) : 0;
}

function runCreep(input: RunFormInput, pack: RulePack) {
  const load = num(input.rows[0] ?? {}, "load") || Number(input.extras?.["testLoad"] ?? 0);
  const e = eAt(input.profile, load, pack);

  const readings = input.rows.map((row) => ({
    atMinutes: minutesOf(row),
    // P = I + ½e − ΔL, the indication prior to rounding. Computed here so the form's own
    // P column is the engine's number and not a second arithmetic done in the browser.
    priorToRounding: num(row, "indication") + e / 2 - num(row, "additionalLoad"),
  }));

  const out = k4Creep({ load, e, readings, mpe: mpeLookup(input.profile, pack, input.stage) });

  const p0 = readings[0]?.priorToRounding ?? 0;
  const rows = input.rows.map((row, i) => ({
    ...row,
    load,
    p: round(readings[i]!.priorToRounding),
    deltaP: round(Math.abs(readings[i]!.priorToRounding - p0)),
  }));

  return {
    verdict: out.verdict,
    rows,
    summary: [
      {
        label: "a) ΔP at 30 min ≤ 0.5 e",
        value: `${round(out.deltaAt30 ?? 0)} against ${round(0.5 * e)}`,
        verdict: (out.conditionAMet ? "PASSED" : "FAILED") as Verdict,
      },
      ...(out.conditionBMet === undefined
        ? []
        : [
            {
              label: "b) ΔP over 4 h ≤ |mpe|",
              value: `${round(out.deltaOverFourHours ?? 0)} against ${round(out.mpeAtLoad ?? 0)}`,
              verdict: (out.conditionBMet ? "PASSED" : "FAILED") as Verdict,
            },
          ]),
    ],
    notes: out.notes,
  };
}

function runZeroReturn(input: RunFormInput, pack: RulePack) {
  const e = smallestE(input.profile);
  const p = (row: FormRow | undefined) =>
    row ? num(row, "indicationOfZero", "indication") + e / 2 - num(row, "additionalLoad") : 0;

  // The form's rows are the successive zero readings: before loading, after >= 30 min under
  // load, and (multiple-range only) 5 minutes after switching back to the lowest range.
  const byTime = [...input.rows].sort((a, b) => minutesOf(a) - minutesOf(b));
  const p0 = p(byTime[0]);
  const p30 = p(byTime[byTime.length - 1]);
  const p35 = byTime.length > 2 ? p(byTime[byTime.length - 1]) : undefined;

  const eAtLoad = eAt(input.profile, Number(input.extras?.["testLoad"] ?? 0), pack);
  const out = k4ZeroReturn({
    rangeKind: input.profile.rangeKind,
    eAtLoad,
    e1: e,
    p0,
    p30,
    ...(input.profile.rangeKind === "multiple-range" && p35 !== undefined ? { p35 } : {}),
  });

  const rows = input.rows.map((row) => ({ ...row, p: round(p(row)) }));

  return {
    verdict: out.verdict,
    rows,
    summary: [
      {
        label: "Zero deviation |P₃₀ − P₀|",
        value: `${round(out.deviation)} against ${round(out.allowedDeviation)}`,
        verdict: (out.conditionAMet ? "PASSED" : "FAILED") as Verdict,
      },
      ...(out.conditionBMet === undefined
        ? []
        : [
            {
              label: "After switching to the lowest range",
              value: `${round(out.secondaryDeviation ?? 0)} against ${round(out.secondaryAllowed ?? 0)}`,
              verdict: (out.conditionBMet ? "PASSED" : "FAILED") as Verdict,
            },
          ]),
    ],
    notes: out.notes,
  };
}

function runTempNoLoad(input: RunFormInput, pack: RulePack, params: Record<string, unknown>) {
  // R 76-1 §3.9.2.3's last sentence: on a multi-interval or multiple-range instrument the
  // drift limit is set on the *smallest* e, not the one in force at the reading.
  const e = smallestE(input.profile);
  const p = (row: FormRow) => num(row, "zeroIndication", "indication") + e / 2 - num(row, "additionalLoad");

  const rows: (FormRow & { verdict?: Verdict })[] = [];
  const verdicts: Verdict[] = [];
  const drift = params["drift_per_C"] as (Partial<Record<AccuracyClass, number>> & { default: number }) | undefined;

  // Each row is compared with the one before it: the form checks the change between two
  // consecutive readings, not against the first reading of the day.
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const prev = input.rows[i - 1];
    const pNow = p(row);
    if (!prev) {
      rows.push({ ...row, p: round(pNow) });
      continue;
    }
    const out = k4TemperatureNoLoad(
      {
        pStart: p(prev),
        pEnd: pNow,
        temperatureStartC: num(prev, "temperature"),
        temperatureEndC: num(row, "temperature"),
        accuracyClass: input.profile.accuracyClass as AccuracyClass,
        e,
      },
      drift ? { intervalC: drift } : {},
    );
    verdicts.push(out.verdict);
    rows.push({
      ...row,
      p: round(pNow),
      deltaP: round(out.deltaP),
      deltaTemp: round(out.deltaTempC),
      zeroChangePerInterval: round(out.ratePerReferenceInterval),
      verdict: out.verdict,
    });
  }

  const intervalC = drift?.[input.profile.accuracyClass as AccuracyClass] ?? drift?.default ?? 5;
  return {
    verdict: (verdicts.includes("FAILED") ? "FAILED" : "PASSED") as Verdict,
    rows,
    summary: [{ label: `Allowed zero change per ${intervalC} °C`, value: `≤ ${round(e)} (1 e)` }],
    notes: [
      `Zero drift is normalised to ${intervalC} °C and compared with e = ${round(e)} ` +
        `(R 76-1 §3.9.2.3). On a multi-range instrument the smallest e is used.`,
    ],
  };
}

function runSpanStability(input: RunFormInput, pack: RulePack) {
  const e = smallestE(input.profile);
  const testLoad = Number(input.extras?.["testLoad"] ?? Math.max(...input.profile.ranges.map((r) => r.max)));
  const mpeInitial = Math.abs(resolveMpe(input.profile, testLoad, pack, "initial").mpe);

  // Each row is one measurement: a zero reading and a reading at (near) Max. The error of the
  // measurement is the difference of the two errors, which is what Annex B.4 tracks.
  const measurements = input.rows.map((row, i) => {
    const e0 = num(row, "indicationOfZero") + e / 2 - num(row, "additionalLoad0") - 0;
    const eL = num(row, "indicationOfLoad") + e / 2 - num(row, "additionalLoad") - testLoad;
    return { atDay: optNum(row, "no", "day") ?? i + 1, error: eL - e0, error0: e0, errorL: eL };
  });

  const out = k4SpanStability({
    measurements: measurements.map((m) => ({ atDay: m.atDay, error: m.error })),
    e,
    mpeInitial,
  });

  const rows = input.rows.map((row, i) => ({
    ...row,
    error0: round(measurements[i]!.error0),
    errorL: round(measurements[i]!.errorL),
    elMinusE0: round(measurements[i]!.error),
    correctedValue: round(measurements[i]!.error),
    verdict: out.perMeasurementVerdicts[i],
  }));

  return {
    verdict: out.verdict,
    rows,
    summary: [
      {
        label: "Variation across measurements",
        value: `${round(out.variation)} against ${round(out.allowedVariation)}`,
        verdict: (out.variationConditionMet ? "PASSED" : "FAILED") as Verdict,
      },
      { label: "|mpe| at the test load", value: round(mpeInitial).toString() },
    ],
    notes: [
      `Every measurement's error must satisfy |E| ≤ |mpe|, and the variation across all of ` +
        `them must not exceed max(0.5 e, 0.5 |mpe|) = ${round(out.allowedVariation)} ` +
        `(R 76-1 §5.3.3 / Annex B.4).`,
      ...out.notes,
    ],
  };
}

// ---------------------------------------------------------------------------
// K5 — significant fault
// ---------------------------------------------------------------------------

/**
 * Forms 12.1 through 12.7b.
 *
 * The form's first row is a baseline "without disturbance" reading; every later row's fault is
 * its indication less that baseline. A fault larger than e is acceptable only when it was
 * detected and acted upon (R 76-1 T.5.5.6), which is what the form's "Yes (remarks)" column
 * records — so ticking Yes without a remark is treated as an undetected fault, not an excuse.
 */
function runK5(input: RunFormInput, pack: RulePack) {
  const load = num(input.rows[0] ?? {}, "load");
  const e = eAt(input.profile, load, pack);
  const baseline = num(input.rows[0] ?? {}, "indication");

  const trials: K5Trial[] = input.rows.slice(1).map((row) => {
    const detected = bool(row, "significantFaultYes");
    return {
      faultMagnitude: num(row, "indication") - baseline,
      e,
      detectedAndReacted: detected,
      ...(text(row, "label") ? { label: text(row, "label")! } : {}),
    };
  });

  const out = k5Form(trials);

  const rows: (FormRow & { verdict?: Verdict })[] = [
    { ...input.rows[0], fault: 0, label: "Without disturbance (baseline)" },
    ...out.rows.map((r, i) => ({
      ...input.rows[i + 1],
      fault: round(r.faultMagnitude),
      isFault: r.isFault,
      significant: r.significant,
      verdict: r.verdict,
    })),
  ];

  return {
    verdict: out.verdict,
    rows,
    summary: [
      { label: "e", value: round(e).toString() },
      { label: "Baseline indication", value: round(baseline).toString() },
    ],
    notes: [
      `A fault greater than e = ${round(e)} is significant unless it was detected and acted ` +
        `upon (R 76-1 T.5.5.6). Each row's fault is its indication less the undisturbed baseline.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// K6 — stability of equilibrium
// ---------------------------------------------------------------------------

/**
 * Form 7. Three sub-tables in one form: printing, zero-setting and tare balancing. Which
 * sub-table a row belongs to is the row's own `subform` value, because the printed form stacks
 * them under one heading.
 */
function runK6(input: RunFormInput, pack: RulePack, params: Record<string, unknown>) {
  const load = num(input.rows[0] ?? {}, "load");
  const e = eAt(input.profile, load, pack);

  const of = (name: string) =>
    input.rows.filter((r) => (text(r, "subform") ?? "print").toLowerCase().startsWith(name));

  const printTrials = of("print").map((row) => ({
    load: num(row, "load"),
    printedValue: num(row, "firstPrintedOrStoredValue", "printedValue"),
    minimumReading: num(row, "readingMin", "minimumReading"),
    maximumReading: num(row, "readingMax", "maximumReading"),
    ...(optNum(row, "distinctValuesIndicated") !== undefined
      ? { distinctValuesIndicated: optNum(row, "distinctValuesIndicated")! }
      : {}),
  }));
  // E0 = I0 + ½e − ΔL − L0, so the kernel needs the applied load, the small release load and
  // the indication — not a pre-computed error, which would be arithmetic done twice.
  const zeroLike = (row: FormRow) => ({
    appliedLoad: num(row, "zeroLoad", "tareLoad", "appliedLoad", "load"),
    l0: num(row, "load0", "l0", "releaseLoad"),
    indication: num(row, "indicationAfterZeroSetting", "indicationAfterTareBalancing", "indication"),
    additionalLoad: num(row, "additionalLoad"),
  });
  const zeroTrials = of("zero").map(zeroLike);
  const tareTrials = of("tare").map(zeroLike);

  const out = k6StabilityOfEquilibrium({
    e,
    printTrials,
    zeroSettingTrials: zeroTrials,
    tareBalancingTrials: tareTrials,
    ...(params ? { params: params as never } : {}),
  });

  // Stitch each sub-table's verdicts back onto the rows the officer typed, in order.
  const queues: Record<string, Verdict[]> = {
    print: out.print.rows.map((r) => r.verdict),
    zero: out.zeroSetting.rows.map((r) => r.verdict),
    tare: out.tareBalancing.rows.map((r) => r.verdict),
  };
  const errorQueues: Record<string, number[]> = {
    print: out.print.rows.map((r) => r.deviation),
    zero: out.zeroSetting.rows.map((r) => r.error),
    tare: out.tareBalancing.rows.map((r) => r.error),
  };
  const rows = input.rows.map((row) => {
    const sub = (text(row, "subform") ?? "print").toLowerCase();
    const kind = sub.startsWith("zero") ? "zero" : sub.startsWith("tare") ? "tare" : "print";
    const computed = errorQueues[kind]!.shift();
    return {
      ...row,
      // Both zero-setting and tare balancing print the result under "error0"; printing prints
      // its deviation. Written under the key the sub-table actually carries.
      ...(computed !== undefined ? (kind === "print" ? { deviation: round(computed) } : { error0: round(computed) }) : {}),
      verdict: queues[kind]!.shift(),
    };
  });

  return {
    verdict: out.verdict,
    rows,
    summary: [
      { label: "Printing", value: `deviation ≤ 1 e = ${round(e)}`, verdict: out.print.verdict },
      { label: "Zero-setting", value: `|E₀| ≤ 0.25 e`, verdict: out.zeroSetting.verdict },
      { label: "Tare balancing", value: `|E₀| ≤ 0.25 e`, verdict: out.tareBalancing.verdict },
    ],
    notes: [
      ...(out.failedDocumentationChecks.length > 0
        ? [`Documentation checks answered "no": ${out.failedDocumentationChecks.join("; ")}.`]
        : []),
      "Checked against fixed multiples of e, never the resolved mpe (R 76-1 A.4.12).",
    ],
  };
}

// ---------------------------------------------------------------------------

/** Trim float noise without pretending to more precision than the readings carry. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
