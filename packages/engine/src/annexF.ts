/**
 * Annex F — compatibility checking of modules of non-automatic weighing instruments.
 *
 * When an indicator and load cell(s) are type-approved *separately* (the "modular
 * approach", R 76-1 §3.10.2), the manufacturer must still prove the assembled combination
 * meets R 76 as a whole. Annex F is the mandatory checklist for that proof (its own heading:
 * "(Mandatory for separately tested modules)").
 *
 * Primary source: docs/standards/extracted/OIML_R76-1_2006_requirements.txt
 *   F.1 (Weighing instrument data)               — lines ~5727-5782
 *   F.2 (Separately tested load cells)           — lines ~5783-5851 (F.2.1-F.2.8)
 *   F.3 (Separately tested indicators)           — lines ~5858-5916 (F.3.1-F.3.5)
 *   F.4 (the actual compatibility-check form, items (1)-(10)) — lines ~5917-5989
 *   F.5 (digital modules — most of F.4 does not apply)         — lines ~5996-6003
 *   F.6.1 (worked numeric example, road-vehicle weigher)        — lines ~6004-6113
 *   §3.10.2.1 (error apportioning, Table 7)      — lines ~1599-1645
 *
 * CLAUDE.md §6 summarizes this as four checks: "n_LC >= n, capacity margin
 * Emax >= Q*Max*R/N, vmin <= e*R/sqrt(N), temperature-range overlap, error apportionment
 * sum(p_i^2) <= 1 (p_i <= 0.8; purely digital module may be 0)". Checked against Annex F's
 * actual text, that summary is *mostly* right but incomplete/imprecise in three ways —
 * flagged loudly here and in the delivery report, not silently corrected away:
 *
 *   1. "temperature-range overlap" is the wrong shape. F.4 item (2) is not a symmetric
 *      overlap test; it is a *containment* test: the WI's declared range must be covered by
 *      BOTH the load cell's AND the indicator's rated ranges (Tmin_LC <= Tmin_WI and
 *      Tmin_IND <= Tmin_WI; Tmax_LC >= Tmax_WI and Tmax_IND >= Tmax_WI). Two ranges that
 *      merely "overlap" without the WI's range being fully inside both would fail F.4 but
 *      pass a naive overlap test. Implemented here as containment, per item (2).
 *   2. The error-apportionment rule has two more provisions CLAUDE.md's summary omits
 *      (§3.10.2.1): "For weighing modules pi may be equal to 1" (not just "purely digital
 *      may be 0"), and "For all other modules ... the fraction shall not exceed 0.8 and
 *      shall not be less than 0.3, when more than one module contributes". The pack's
 *      `module_error_fractions` only carries `p_max` (0.8) and `digital_module_may_be_zero`
 *      — it has no lower bound and no weighing-module exception. Recommend adding
 *      `p_min: 0.3` and `weighing_module_may_be_one: true`.
 *   3. CLAUDE.md's list omits the accuracy-class correspondence check (F.2.1/F.3.1, Tables
 *      13-14 — item (1) of the F.4 form) and the indicator scale-interval check (F.3.4,
 *      nind >= n — item (4), the sibling of nLC >= n at item (6a)). Both are implemented
 *      here because they are as load-bearing as the four CLAUDE.md named explicitly.
 *
 * NOT implemented (out of scope for this pass — electrical/cabling items (8)-(10) of the
 * F.4 form: minimum input voltage, indicator input-impedance range, and extension-cable
 * length vs. cross-section). These are real Annex F requirements but are indicator-model
 * electrical specs rather than the metrological chain CLAUDE.md asked for; flagged in the
 * delivery report rather than silently omitted.
 *
 * Symbol glossary (Annex F.1, F.2, F.3 — restated here so this file is self-contained):
 *   Max   maximum capacity of the weighing instrument (per range, for multi-range/interval).
 *   e, ei verification scale interval (ei for partial/weighing range i; e1 = smallest).
 *   n, ni number of verification scale intervals, ni = Maxi / ei.
 *   R     reduction ratio of the load-transmitting device, e.g. leverwork:
 *         R = (force on the load cell) / (force on the load receptor). R = 1 with no leverwork.
 *   N     number of load cells.
 *   DL    dead load of the load receptor (its own mass + anything permanently mounted on it,
 *         resting on the load cells).
 *   IZSR  initial zero-setting range (T.2.7.2.4).
 *   NUD   correction for non-uniform distributed load (F.1 footnote gives typical %-of-Max
 *         figures by WI type — not derived here; caller supplies the value directly).
 *   T+    additive tare.
 *   Q     Q = (Max + DL + IZSR + NUD + T+) / Max — correction factor for capacity margin.
 *   Emax  maximum capacity of the load cell (OIML R 60).
 *   Emin  minimum dead load for the load cell (a lot of load cells have Emin = 0).
 *   nLC   maximum number of load-cell verification intervals (OIML R 60).
 *   vmin  minimum load-cell verification interval, in mass units. vmin = Emax / Y.
 *   Y     Y = Emax / vmin (a load cell's OIML R 60 certificate typically states Y directly).
 *   nind  maximum number of verification scale intervals for the indicator.
 *   pLC, pind, pcon  fraction of mpe apportioned to load cell / indicator / connecting
 *         elements. sum(pi^2) <= 1 (§3.10.2.1).
 *
 * Engine is PURE: no I/O, no randomness. Unit handling mirrors family.ts's toGrams()
 * (duplicated locally rather than imported, since neither file owns the other's internals
 * and both are self-contained).
 */

import type { AccuracyClass, MassUnit, Verdict } from "./types.js";
import type { RulePack } from "./rulepack.js";

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const UNIT_TO_GRAMS: Record<MassUnit, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 };

function toGrams(value: number, unit: MassUnit): number {
  return value * UNIT_TO_GRAMS[unit];
}

function fmt(g: number): string {
  if (g >= 1000) return `${round(g / 1000, 6)} kg`;
  return `${round(g, 6)} g`;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface TemperatureRange {
  minC: number;
  maxC: number;
}

/** One weighing range / partial range: T.3.1.1 (Max) and T.3.2.3 (e). ni = Maxi / ei. */
export interface WeighingRangeSpec {
  max: number;
  e: number;
}

/** R 76-1 Annex F.1 — the weighing-instrument-side data needed for the compatibility check. */
export interface WeighingInstrumentModuleData {
  accuracyClass: AccuracyClass;
  unit: MassUnit;
  /**
   * One entry for a single-range instrument; ascending-e entries for multi-interval or
   * multiple-range (ranges[0].e is e1, the smallest). Overall Max used in the Q formula is
   * the largest range's Max, per F.1's "(Max1, Max2, ..., Max)" notation.
   */
  ranges: WeighingRangeSpec[];
  /** R — reduction ratio of the load-transmitting device (§6.2.3, F.1). R = 1 with no leverwork. */
  reductionRatio: number;
  /** N — number of load cells (F.1). */
  numberOfLoadCells: number;
  /** DL — dead load of the load receptor (F.1). */
  deadLoad: number;
  /** IZSR — initial zero-setting range (F.1, T.2.7.2.4). */
  initialZeroSettingRange: number;
  /**
   * NUD — correction for non-uniform distributed load (F.1). The F.1 footnote gives typical
   * values as a % of Max by WI type (0% for lever-work-with-one-cell / single-point-cell
   * receptors; 20% for other conventional WIs; 50% for fork-lift/overhead-track/weighbridge;
   * 50% of Max_total or Max_single-bridge for multi-platform machines) — that classification
   * is not automated here; the caller supplies the resulting mass value directly.
   */
  nonUniformLoadCorrection: number;
  /** T+ — additive tare (F.1). Defaults to 0 when omitted. */
  additiveTare?: number;
  temperatureRange: TemperatureRange;
}

/** OIML R 60 load-cell accuracy classes (Annex F Table 13). */
export type LoadCellAccuracyClass = "A" | "B" | "C" | "D";

/** R 76-1 Annex F.2 — a load cell separately certified under OIML R 60. */
export interface LoadCellModuleData {
  accuracyClass: LoadCellAccuracyClass;
  unit: MassUnit;
  /** Emax — maximum capacity of the load cell (F.2.4). */
  maxCapacity: number;
  /** Emin — minimum dead load for the load cell (F.2.5). Many load cells have Emin = 0. */
  minDeadLoad?: number;
  /** nLC — maximum number of load-cell verification intervals (F.2.6). */
  maxScaleIntervals: number;
  /** vmin — minimum load-cell verification interval, in mass units (F.2.7). Supply this or `y`. */
  minVerificationInterval?: number;
  /** Y = Emax / vmin (F.2.7 note; F.6 worked examples state Y directly from the R 60 certificate). */
  y?: number;
  temperatureRange: TemperatureRange;
  /** pLC — fraction of mpe. F.2.2: defaults to 0.7 if the OIML Certificate states no value. */
  fractionOfMpe?: number;
  /** F.2: only SH or CH tested load cells are allowed under the modular approach (not NH). */
  humidityMark?: "SH" | "CH" | "NH";
}

/** R 76-1 Annex F.3 — an indicator (or analog data-processing device) separately certified under Annex C. */
export interface IndicatorModuleData {
  accuracyClass: AccuracyClass;
  /** nind — maximum number of verification scale intervals for the indicator (F.3.4). */
  maxScaleIntervals: number;
  temperatureRange: TemperatureRange;
  /** pind — fraction of mpe. F.3.2: defaults to 0.5 if the OIML Certificate states no value. */
  fractionOfMpe?: number;
}

/** Connecting elements (cabling, junction boxes, etc.) — Table 7's "Connecting elements, etc." column. */
export interface ConnectingElementsData {
  /**
   * pcon — fraction of mpe. Annex F gives no explicit numeric default for connecting
   * elements the way F.2.2/F.3.2 do for the load cell/indicator; Table 7's "Combined
   * effect" column lists 0.5 as the typical value, used here as the default (matches
   * OIML_R76_2006.json's `module_error_fractions.typical.connecting`).
   */
  fractionOfMpe?: number;
}

export interface ModuleCompatibilityInput {
  instrument: WeighingInstrumentModuleData;
  loadCell: LoadCellModuleData;
  indicator: IndicatorModuleData;
  connecting?: ConnectingElementsData;
}

export interface ModuleCheckResult {
  /** Stable machine id, e.g. "annexF.class_compatibility.loadCell". */
  check: string;
  passed: boolean;
  /** Clause reference, e.g. "R 76-1 Annex F.2.4". */
  clause: string;
  /** Human-readable working, fit to print on the report. */
  detail: string;
  required: number | string;
  actual: number | string;
}

// ---------------------------------------------------------------------------
// F.2.1 / F.3.1 — Tables 13 & 14, accuracy-class correspondence
// ---------------------------------------------------------------------------

/**
 * Table 13 — corresponding accuracy classes, load cell vs. weighing instrument.
 * The "*" entries (A* for WI II, B* for WI III) are accepted only if the temperature ranges
 * are sufficient and the humidity/creep evaluation matches the lower class — both folded
 * into this checker's own temperature check, so the class check accepts the asterisked
 * adjacent class and the detail text calls out that the temperature check must also pass.
 */
const LC_CLASS_ACCEPTABLE: Record<AccuracyClass, LoadCellAccuracyClass[]> = {
  I: ["A"],
  II: ["A", "B"],
  III: ["B", "C"],
  IIII: ["C", "D"],
};

/** Table 14 — corresponding accuracy classes, indicator vs. weighing instrument. Same asterisk caveat as Table 13. */
const IND_CLASS_ACCEPTABLE: Record<AccuracyClass, AccuracyClass[]> = {
  I: ["I"],
  II: ["I", "II"],
  III: ["II", "III"],
  IIII: ["III", "IIII"],
};

function bestOf(list: LoadCellAccuracyClass[] | AccuracyClass[]): string {
  return list[0]!;
}

// ---------------------------------------------------------------------------
// Individual checks (F.4 form items, numbered in comments to match the standard's own form)
// ---------------------------------------------------------------------------

/** F.4 item (1), load-cell half — F.2.1 / Table 13. */
function checkLoadCellClass(instrument: WeighingInstrumentModuleData, loadCell: LoadCellModuleData): ModuleCheckResult {
  const acceptable = LC_CLASS_ACCEPTABLE[instrument.accuracyClass];
  const passed = acceptable.includes(loadCell.accuracyClass);
  const isAsteriskCase = passed && acceptable.indexOf(loadCell.accuracyClass) > 0;
  return {
    check: "annexF.class_compatibility.loadCell",
    passed,
    clause: "R 76-1 Annex F.2.1, Table 13",
    detail: isAsteriskCase
      ? `Load cell class ${loadCell.accuracyClass} is accepted for WI class ${instrument.accuracyClass} only under Table 13's asterisked allowance — verify the temperature-range check below also passes and that humidity/creep evaluation matches WI class ${instrument.accuracyClass}.`
      : `Load cell class ${loadCell.accuracyClass} vs. WI class ${instrument.accuracyClass} (Table 13 acceptable set: {${acceptable.join(", ")}}).`,
    required: `one of {${acceptable.join(", ")}}`,
    actual: loadCell.accuracyClass,
  };
}

/** F.4 item (1), indicator half — F.3.1 / Table 14. */
function checkIndicatorClass(instrument: WeighingInstrumentModuleData, indicator: IndicatorModuleData): ModuleCheckResult {
  const acceptable = IND_CLASS_ACCEPTABLE[instrument.accuracyClass];
  const passed = acceptable.includes(indicator.accuracyClass);
  const isAsteriskCase = passed && acceptable.indexOf(indicator.accuracyClass) > 0;
  return {
    check: "annexF.class_compatibility.indicator",
    passed,
    clause: "R 76-1 Annex F.3.1, Table 14",
    detail: isAsteriskCase
      ? `Indicator class ${indicator.accuracyClass} is accepted for WI class ${instrument.accuracyClass} only under Table 14's asterisked allowance — verify the temperature-range check below also passes and that humidity evaluation matches WI class ${instrument.accuracyClass}.`
      : `Indicator class ${indicator.accuracyClass} vs. WI class ${instrument.accuracyClass} (Table 14 acceptable set: {${acceptable.join(", ")}}).`,
    required: `one of {${acceptable.join(", ")}}`,
    actual: indicator.accuracyClass,
  };
}

/**
 * F.4 item (2) — temperature. This is CONTAINMENT, not overlap: the module's rated range
 * must cover the WI's declared range on both ends (Tmin_module <= Tmin_WI, Tmax_module >= Tmax_WI).
 */
function checkTemperatureContainment(
  moduleName: string,
  clauseSuffix: string,
  wi: TemperatureRange,
  mod: TemperatureRange,
): ModuleCheckResult {
  const passed = mod.minC <= wi.minC && mod.maxC >= wi.maxC;
  return {
    check: `annexF.temperature.${moduleName}`,
    passed,
    clause: `R 76-1 Annex F.4 item (2)${clauseSuffix}`,
    detail: `${moduleName} rated range [${mod.minC} °C, ${mod.maxC} °C] must contain WI's declared range [${wi.minC} °C, ${wi.maxC} °C] (Tmin_${moduleName} <= Tmin_WI and Tmax_${moduleName} >= Tmax_WI) — this is containment, not mere overlap.`,
    required: `[<= ${wi.minC} °C, >= ${wi.maxC} °C]`,
    actual: `[${mod.minC} °C, ${mod.maxC} °C]`,
  };
}

/**
 * F.4 item (3) / §3.10.2.1 — sum(pi^2) <= 1, with each pi bounded: 0 for a purely digital
 * module, 1 for a weighing module, else 0.3 <= pi <= 0.8 "when more than one module
 * contributes to the effect in question".
 */
function checkErrorApportionment(
  pLC: number,
  pInd: number,
  pCon: number,
  pack: RulePack,
): ModuleCheckResult {
  const meta = (pack.module_error_fractions ?? {}) as {
    p_max?: number;
    p_min?: number;
    digital_module_may_be_zero?: boolean;
  };
  const pMax = meta.p_max ?? 0.8; // §3.10.2.1
  const pMin = meta.p_min ?? 0.3; // §3.10.2.1 — NOT in OIML_R76_2006.json today; recommend adding `p_min: 0.3`.
  const digitalMayBeZero = meta.digital_module_may_be_zero ?? true;

  const boundsOk = (label: string, p: number): string | undefined => {
    if (digitalMayBeZero && p === 0) return undefined;
    if (p === 1) return undefined; // weighing modules may be 1 (§3.10.2.1) — not in the pack; see report.
    if (p < pMin || p > pMax) {
      return `${label}=${p} is outside [${pMin}, ${pMax}] (§3.10.2.1: "shall not exceed 0.8 and shall not be less than 0.3").`;
    }
    return undefined;
  };

  const sumSquares = pLC * pLC + pInd * pInd + pCon * pCon;
  const boundViolations = [boundsOk("pLC", pLC), boundsOk("pInd", pInd), boundsOk("pCon", pCon)].filter(
    (m): m is string => !!m,
  );
  const passed = sumSquares <= 1 && boundViolations.length === 0;

  return {
    check: "annexF.error_apportionment",
    passed,
    clause: "R 76-1 §3.10.2.1 / Annex F.4 item (3)",
    detail:
      `pcon^2 + pind^2 + pLC^2 = ${round(pCon, 3)}^2 + ${round(pInd, 3)}^2 + ${round(pLC, 3)}^2 = ${round(sumSquares, 4)}` +
      (boundViolations.length > 0 ? ` — also: ${boundViolations.join(" ")}` : ""),
    required: "<= 1 (each pi in [0, 0.8] as 0/1/[0.3,0.8] per §3.10.2.1)",
    actual: round(sumSquares, 4),
  };
}

/** F.4 items (4) and (6a) — nind >= ni and nLC >= ni, per range. */
function checkScaleIntervals(
  moduleName: string,
  formItem: string,
  clauseNote: string,
  nModule: number,
  ranges: WeighingRangeSpec[],
): ModuleCheckResult[] {
  return ranges.map((r, i) => {
    const ni = r.max / r.e;
    const passed = nModule >= ni;
    const label = ranges.length > 1 ? ` (range ${i + 1}: Max=${r.max}, e=${r.e})` : "";
    return {
      check: `annexF.scale_intervals.${moduleName}${ranges.length > 1 ? `[${i}]` : ""}`,
      passed,
      clause: `R 76-1 Annex F.4 item ${formItem}${clauseNote}`,
      detail: `n_${moduleName} (${nModule}) >= ni = Maxi/ei = ${round(ni, 4)}${label}.`,
      required: `>= ${round(ni, 4)}`,
      actual: nModule,
    };
  });
}

/** F.4 item (5) / F.2.4 — capacity margin: Emax >= Q x Max x R / N, Q = (Max+DL+IZSR+NUD+T+)/Max. */
function checkCapacityMargin(instrument: WeighingInstrumentModuleData, loadCell: LoadCellModuleData): {
  check: ModuleCheckResult;
  q: number;
} {
  const overallMaxG = Math.max(...instrument.ranges.map((r) => toGrams(r.max, instrument.unit)));
  const dlG = toGrams(instrument.deadLoad, instrument.unit);
  const izsrG = toGrams(instrument.initialZeroSettingRange, instrument.unit);
  const nudG = toGrams(instrument.nonUniformLoadCorrection, instrument.unit);
  const tPlusG = toGrams(instrument.additiveTare ?? 0, instrument.unit);
  const q = (overallMaxG + dlG + izsrG + nudG + tPlusG) / overallMaxG;

  const requiredG = q * overallMaxG * instrument.reductionRatio / instrument.numberOfLoadCells;
  const emaxG = toGrams(loadCell.maxCapacity, loadCell.unit);
  const passed = emaxG >= requiredG;

  return {
    q,
    check: {
      check: "annexF.capacity_margin",
      passed,
      clause: "R 76-1 Annex F.2.4 (Q per F.1)",
      detail: `Q = (Max+DL+IZSR+NUD+T+)/Max = ${round(q, 4)}; Emax (${fmt(emaxG)}) >= Q x Max x R/N = ${round(q, 4)} x ${fmt(overallMaxG)} x ${instrument.reductionRatio}/${instrument.numberOfLoadCells} = ${fmt(requiredG)}.`,
      required: `>= ${fmt(requiredG)}`,
      actual: fmt(emaxG),
    },
  };
}

/** F.4 item (6d) / F.2.5 — DL x R / N >= Emin. Emin defaults to 0 ("a lot of load cells have Emin = 0"). */
function checkMinDeadLoad(instrument: WeighingInstrumentModuleData, loadCell: LoadCellModuleData): ModuleCheckResult {
  const dlG = toGrams(instrument.deadLoad, instrument.unit);
  const actualG = (dlG * instrument.reductionRatio) / instrument.numberOfLoadCells;
  const eminG = toGrams(loadCell.minDeadLoad ?? 0, loadCell.unit);
  const passed = actualG >= eminG;
  return {
    check: "annexF.min_dead_load",
    passed,
    clause: "R 76-1 Annex F.2.5 / F.4 item (6d)",
    detail: `DL x R/N = ${fmt(dlG)} x ${instrument.reductionRatio}/${instrument.numberOfLoadCells} = ${fmt(actualG)} >= Emin (${fmt(eminG)}).`,
    required: `>= ${fmt(eminG)}`,
    actual: fmt(actualG),
  };
}

/** F.4 item (7) / F.2.7 — vmin <= e1 x R / sqrt(N). vmin derived from Y (= Emax/vmin) when not given directly. */
function checkMinVerificationInterval(instrument: WeighingInstrumentModuleData, loadCell: LoadCellModuleData): ModuleCheckResult {
  const e1G = Math.min(...instrument.ranges.map((r) => toGrams(r.e, instrument.unit)));
  const boundG = (e1G * instrument.reductionRatio) / Math.sqrt(instrument.numberOfLoadCells);

  let vminG: number;
  let vminSource: string;
  if (loadCell.minVerificationInterval !== undefined) {
    vminG = toGrams(loadCell.minVerificationInterval, loadCell.unit);
    vminSource = "given directly";
  } else if (loadCell.y !== undefined) {
    vminG = toGrams(loadCell.maxCapacity, loadCell.unit) / loadCell.y;
    vminSource = `derived from Y = Emax/vmin = ${loadCell.y}`;
  } else {
    throw new Error("Annex F: load cell must supply either minVerificationInterval (vmin) or y (Emax/vmin).");
  }

  const passed = vminG <= boundG;
  return {
    check: "annexF.min_verification_interval",
    passed,
    clause: "R 76-1 Annex F.2.7 / F.4 item (7)",
    detail: `vmin (${vminSource}: ${fmt(vminG)}) <= e1 x R / sqrt(N) = ${fmt(e1G)} x ${instrument.reductionRatio} / sqrt(${instrument.numberOfLoadCells}) = ${fmt(boundG)}.`,
    required: `<= ${fmt(boundG)}`,
    actual: fmt(vminG),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function checkModuleCompatibility(
  input: ModuleCompatibilityInput,
  pack: RulePack,
): { checks: ModuleCheckResult[]; verdict: Verdict } {
  const { instrument, loadCell, indicator, connecting } = input;

  const typical = (pack.module_error_fractions ?? {}).typical as
    | { load_cell?: number; indicator?: number; connecting?: number }
    | undefined;
  const pLC = loadCell.fractionOfMpe ?? typical?.load_cell ?? 0.7; // F.2.2 default
  const pInd = indicator.fractionOfMpe ?? typical?.indicator ?? 0.5; // F.3.2 default
  const pCon = connecting?.fractionOfMpe ?? typical?.connecting ?? 0.5; // Table 7 "Combined effect" typical

  const capacityMargin = checkCapacityMargin(instrument, loadCell);

  const checks: ModuleCheckResult[] = [
    checkLoadCellClass(instrument, loadCell),
    checkIndicatorClass(instrument, indicator),
    checkTemperatureContainment("loadCell", ", F.2.3", instrument.temperatureRange, loadCell.temperatureRange),
    checkTemperatureContainment("indicator", ", F.3.3", instrument.temperatureRange, indicator.temperatureRange),
    checkErrorApportionment(pLC, pInd, pCon, pack),
    ...checkScaleIntervals("indicator", "(4)", " / F.3.4", indicator.maxScaleIntervals, instrument.ranges),
    capacityMargin.check,
    ...checkScaleIntervals("loadCell", "(6a)", " / F.2.6", loadCell.maxScaleIntervals, instrument.ranges),
    checkMinDeadLoad(instrument, loadCell),
    checkMinVerificationInterval(instrument, loadCell),
  ];

  if (loadCell.humidityMark === "NH") {
    checks.push({
      check: "annexF.humidity_mark",
      passed: false,
      clause: "R 76-1 Annex F.2",
      detail: 'Only SH or CH tested load cells are allowed under the modular approach; this load cell is marked "NH".',
      required: "SH or CH",
      actual: "NH",
    });
  }

  const verdict: Verdict = checks.every((c) => c.passed) ? "PASSED" : "FAILED";
  return { checks, verdict };
}
