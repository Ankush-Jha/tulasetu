/**
 * K4 — time-dependence.
 *
 * Four independent forms share the "reading changes over time, compare to a threshold" shape
 * but each has its own exact threshold and edge cases per the standard. Modeled as four
 * separate exported functions rather than one god-function (see task brief).
 *
 *   k4Creep              — creep (R 76-1 §3.9.4.1 / §A.4.11.1 / R 76-2 form 6.2)
 *   k4ZeroReturn         — zero return (R 76-1 §3.9.4.2 / §A.4.11.2 / R 76-2 form 6.1)
 *   k4TemperatureNoLoad  — temperature effect on no-load indication (R 76-1 §3.9.2.3 / R 76-2 form 2)
 *   k4SpanStability      — span stability (R 76-1 §5.3.3 / Annex B.4 / R 76-2 form 14)
 *
 * This kernel is PURE: no I/O, no DB, no randomness. mpe is injected (see MpeLookup) because
 * mpe.ts is being built in parallel and is not yet importable.
 */

import type { AccuracyClass, MpeResolution, RangeKind, Verdict } from "../types.js";

/** Resolves the mpe applicable to a given load. Real implementation lives in `mpe.ts`. */
export type MpeLookup = (load: number) => MpeResolution;

function overallVerdict(verdicts: Verdict[]): Verdict {
  return verdicts.includes("FAILED") ? "FAILED" : "PASSED";
}

// ---------------------------------------------------------------------------
// k4Creep — R 76-1 §3.9.4.1 / §A.4.11.1 / R 76-2 form 6.2
// ---------------------------------------------------------------------------
//
// Verbatim (§3.9.4.1): "When any load is kept on an instrument, the difference between the
// indication obtained immediately after placing a load and the indication observed during
// the following 30 minutes, shall not exceed 0.5 e. However, the difference between the
// indication obtained at 15 minutes and that at 30 minutes shall not exceed 0.2 e.
// If these conditions are not met, the difference between the indication obtained
// immediately after placing a load on the instrument and the indication observed during the
// following four hours shall not exceed the absolute value of the maximum permissible error
// at the load applied."
//
// So condition (a) is a *conjunction* (both 0.5e-at-30min AND 0.2e-between-15-and-30min);
// only if (a) fails does the test fall back to condition (b) over 4 hours against |mpe|,
// which is a strictly weaker/different pass condition, not a repeat of (a). This matches
// CLAUDE.md §5's summary.

export interface K4CreepReading {
  /** Minutes since the load was placed: 0, 15, 30 required; 60/120/180/240 only if (a) fails. */
  atMinutes: number;
  /** P = I + 1/2 e - delta L (R 76-2 form 6.2 header formula). */
  priorToRounding: number;
}

export interface K4CreepInput {
  /** The test load (close to Max — R 76-1 §A.4.11.1). */
  load: number;
  /** Verification scale interval applicable at `load`. */
  e: number;
  /** Must include readings at 0, 15 and 30 minutes at minimum. */
  readings: K4CreepReading[];
  mpe: MpeLookup;
}

export interface K4CreepResult {
  deltaAt30: number; // |P30 - P0|
  deltaBetween15And30: number; // |P30 - P15|
  /** Condition (a): both sub-checks must hold. */
  conditionAMet: boolean;
  /** True when the standard allows the test to stop at 30 minutes (condition (a) met). */
  terminatedAt30: boolean;
  /** Populated only when a reading at 240 min is present (i.e. condition (a) failed and the
   * test ran the full 4 hours). */
  deltaOverFourHours?: number;
  mpeAtLoad?: number;
  conditionBMet?: boolean;
  verdict: Verdict;
  notes: string[];
}

function findReading(readings: K4CreepReading[], atMinutes: number): K4CreepReading | undefined {
  return readings.find((r) => r.atMinutes === atMinutes);
}

export function k4Creep(input: K4CreepInput): K4CreepResult {
  const notes: string[] = [];
  const r0 = findReading(input.readings, 0);
  const r15 = findReading(input.readings, 15);
  const r30 = findReading(input.readings, 30);
  const r240 = findReading(input.readings, 240);

  if (!r0 || !r15 || !r30) {
    return {
      deltaAt30: NaN,
      deltaBetween15And30: NaN,
      conditionAMet: false,
      terminatedAt30: false,
      verdict: "FAILED",
      notes: ["Missing required reading(s) at 0, 15 or 30 minutes (R 76-1 §A.4.11.1)."],
    };
  }

  const deltaAt30 = Math.abs(r30.priorToRounding - r0.priorToRounding);
  const deltaBetween15And30 = Math.abs(r30.priorToRounding - r15.priorToRounding);
  const conditionAMet = deltaAt30 <= 0.5 * input.e && deltaBetween15And30 <= 0.2 * input.e;

  if (conditionAMet) {
    notes.push("Condition (a) met — test may be terminated at 30 minutes (R 76-1 §A.4.11.1).");
    return {
      deltaAt30,
      deltaBetween15And30,
      conditionAMet: true,
      terminatedAt30: true,
      verdict: "PASSED",
      notes,
    };
  }

  // Condition (a) failed: fall back to the 4-hour check against |mpe| (§3.9.4.1 2nd para).
  if (!r240) {
    notes.push(
      "Condition (a) not met and no 240-minute reading supplied — the 4-hour extension (condition b) is required by R 76-1 §3.9.4.1 but cannot be evaluated.",
    );
    return {
      deltaAt30,
      deltaBetween15And30,
      conditionAMet: false,
      terminatedAt30: false,
      verdict: "FAILED",
      notes,
    };
  }

  const deltaOverFourHours = Math.abs(r240.priorToRounding - r0.priorToRounding);
  const mpeAtLoad = Math.abs(input.mpe(input.load).mpe);
  const conditionBMet = deltaOverFourHours <= mpeAtLoad;
  notes.push(
    conditionBMet
      ? "Condition (a) not met; condition (b) (4-hour, |mpe|) met."
      : "Neither condition (a) nor condition (b) met.",
  );

  return {
    deltaAt30,
    deltaBetween15And30,
    conditionAMet: false,
    terminatedAt30: false,
    deltaOverFourHours,
    mpeAtLoad,
    conditionBMet,
    verdict: conditionBMet ? "PASSED" : "FAILED",
    notes,
  };
}

// ---------------------------------------------------------------------------
// k4ZeroReturn — R 76-1 §3.9.4.2 / §A.4.11.2 / R 76-2 form 6.1
// ---------------------------------------------------------------------------
//
// Verbatim (§3.9.4.2):
//   "The deviation on returning to zero as soon as the indication has stabilized, after the
//   removal of any load which has remained on the instrument for half an hour, shall not
//   exceed 0.5 e.
//   For a multi-interval instrument, the deviation shall not exceed 0.5 e1.
//   On a multiple range instrument, the deviation on returning to zero from Max_i shall not
//   exceed 0.5 e_i. Furthermore, after returning to zero from any load greater than Max_1 and
//   immediately after switching to the lowest weighing range, the indication near zero shall
//   not vary by more than e1 during the following 5 minutes."
//
// NOTE (flag for the lead): CLAUDE.md §5 summarizes this kernel's "zero return" branch as a
// flat "<= 0.5e" — it is NOT flat. Three distinct sub-rules apply depending on RangeKind:
//   single           -> deviation <= 0.5 * e
//   multi-interval   -> deviation <= 0.5 * e1        (the *smallest* e, not the e at the load)
//   multiple-range   -> deviation <= 0.5 * e_i (e of the range unloaded from), PLUS a second,
//                        stricter 5-minute-after-switching check against e1 (not 0.5 e1).

export interface K4ZeroReturnInput {
  rangeKind: RangeKind;
  /** e_i — the verification scale interval of the range the load was applied in (= e for `single`). */
  eAtLoad: number;
  /** e1 — the smallest verification scale interval across all (partial) ranges. Required for
   * `multi-interval` and `multiple-range`; ignored for `single`. */
  e1?: number;
  /** Zero reading before loading. */
  p0: number;
  /** Zero reading after unloading, once stabilized (taken after >= 30 min under load). */
  p30: number;
  /** `multiple-range` only: reading taken 5 minutes after switching to the lowest range,
   * required only when the load removed was greater than Max_1. */
  p35?: number;
}

export interface K4ZeroReturnResult {
  deviation: number; // |p30 - p0|
  allowedDeviation: number;
  conditionAMet: boolean;
  secondaryDeviation?: number; // |p35 - p30|
  secondaryAllowed?: number; // e1
  conditionBMet?: boolean;
  verdict: Verdict;
  notes: string[];
}

export function k4ZeroReturn(input: K4ZeroReturnInput): K4ZeroReturnResult {
  const notes: string[] = [];
  const deviation = Math.abs(input.p30 - input.p0);

  let allowedDeviation: number;
  if (input.rangeKind === "single") {
    allowedDeviation = 0.5 * input.eAtLoad;
  } else if (input.rangeKind === "multi-interval") {
    if (input.e1 === undefined) {
      throw new Error("k4ZeroReturn: e1 is required for a multi-interval instrument (R 76-1 §3.9.4.2).");
    }
    allowedDeviation = 0.5 * input.e1; // NOT 0.5 * eAtLoad — the standard uses e1 here.
    notes.push("Multi-interval: limit is 0.5 x e1 (smallest e), per R 76-1 §3.9.4.2.");
  } else {
    // multiple-range
    allowedDeviation = 0.5 * input.eAtLoad; // 0.5 * e_i of the range unloaded from
    notes.push("Multiple-range: limit is 0.5 x e_i of the range the load was in, per R 76-1 §3.9.4.2.");
  }

  const conditionAMet = deviation <= allowedDeviation;

  if (input.rangeKind !== "multiple-range" || input.p35 === undefined) {
    return {
      deviation,
      allowedDeviation,
      conditionAMet,
      verdict: conditionAMet ? "PASSED" : "FAILED",
      notes,
    };
  }

  if (input.e1 === undefined) {
    throw new Error("k4ZeroReturn: e1 is required to evaluate the 5-minute post-switch check (R 76-1 §3.9.4.2).");
  }
  const secondaryDeviation = Math.abs(input.p35 - input.p30);
  const secondaryAllowed = input.e1; // NOT 0.5 * e1 — the second sub-rule is a full e1.
  const conditionBMet = secondaryDeviation <= secondaryAllowed;
  notes.push(
    "Multiple-range, unloaded from > Max1: additional check — zero shall not vary by more than e1 (not 0.5 e1) during the 5 minutes after switching to the lowest range (R 76-1 §3.9.4.2).",
  );

  return {
    deviation,
    allowedDeviation,
    conditionAMet,
    secondaryDeviation,
    secondaryAllowed,
    conditionBMet,
    verdict: conditionAMet && conditionBMet ? "PASSED" : "FAILED",
    notes,
  };
}

// ---------------------------------------------------------------------------
// k4TemperatureNoLoad — R 76-1 §3.9.2.3 / §A.5.3.2 / R 76-2 form 2
// ---------------------------------------------------------------------------
//
// Verbatim (§3.9.2.3): "The indication at zero or near zero shall not vary by more than one
// verification scale interval for a difference in ambient temperature of 1 °C for
// instruments of class I and 5 °C for other classes. For multi-interval instruments and for
// multiple range instruments this applies to the smallest verification scale interval of the
// instrument."
//
// R 76-2 form 2 restates this as a normalized rate check: "Check if the zero-change per 5 °C
// is smaller than e (class II, III or IIII)" / "per 1 °C ... (class I)" — i.e. the rate
// |deltaP| / |deltaTemp|, extrapolated to the reference interval, is compared to e.
//
// NOTE (flag for the lead): the multi-interval/multiple-range "use the smallest e" rule is
// not mentioned at all in CLAUDE.md §5 — callers must pass e1, not e_i, for those RangeKinds.

export interface K4TemperatureNoLoadInput {
  /** P = I + 1/2 e - delta L, at the first of two consecutive readings. */
  pStart: number;
  pEnd: number;
  temperatureStartC: number;
  temperatureEndC: number;
  accuracyClass: AccuracyClass;
  /** e to use: e1 (the *smallest* e) for multi-interval / multiple-range instruments per
   * §3.9.2.3's last sentence, otherwise the instrument's single e. */
  e: number;
}

export interface K4TemperatureNoLoadParams {
  /**
   * The reference temperature interval (deg C) over which drift <= e is required, by class.
   * Mirrors OIML_R76_2006.json's existing `tests[].params.drift_per_C` for test id
   * "temp_no_load" ({ I: 1, default: 5 }) — reuse that pack value rather than this default
   * where available.
   */
  intervalC?: Partial<Record<AccuracyClass, number>> & { default: number };
}

export interface K4TemperatureNoLoadResult {
  deltaP: number;
  deltaTempC: number;
  /** |deltaP| normalized to the reference interval: deltaP / deltaTempC * intervalCUsed. */
  ratePerReferenceInterval: number;
  allowedE: number;
  intervalCUsed: number;
  verdict: Verdict;
}

const DEFAULT_TEMPERATURE_INTERVAL_C: Partial<Record<AccuracyClass, number>> & { default: number } = {
  I: 1,
  default: 5,
};

export function k4TemperatureNoLoad(
  input: K4TemperatureNoLoadInput,
  params: K4TemperatureNoLoadParams = {},
): K4TemperatureNoLoadResult {
  const intervals = params.intervalC ?? DEFAULT_TEMPERATURE_INTERVAL_C;
  const intervalCUsed = intervals[input.accuracyClass] ?? intervals.default;

  const deltaP = Math.abs(input.pEnd - input.pStart);
  const deltaTempC = Math.abs(input.temperatureEndC - input.temperatureStartC);

  // No temperature change observed -> no drift to normalize; treat as compliant (avoids /0).
  const ratePerReferenceInterval = deltaTempC === 0 ? 0 : (deltaP / deltaTempC) * intervalCUsed;

  const verdict: Verdict = ratePerReferenceInterval <= input.e ? "PASSED" : "FAILED";

  return {
    deltaP,
    deltaTempC,
    ratePerReferenceInterval,
    allowedE: input.e,
    intervalCUsed,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// k4SpanStability — R 76-1 §5.3.3 / Annex B.4 / R 76-2 form 14
// ---------------------------------------------------------------------------
//
// Verbatim (§5.3.3): "The error near maximum capacity shall not exceed the maximum
// permissible error and the absolute value of the difference between the errors obtained for
// any two measurements shall not exceed half the verification scale interval or half the
// absolute value of the maximum permissible error, whichever is greater."
// (Annex B.4 "Maximum allowable variations" restates the second half identically.)
//
// NOTE (flag for the lead): this is a *compound* check the rule pack and CLAUDE.md §5 do not
// capture at all:
//   1. every individual measurement's error must itself satisfy |E| <= |mpe| (a K1-shaped
//      check, evaluated near Max), AND
//   2. the *variation* across all measurements (max error - min error) must not exceed
//      max(0.5 * e, 0.5 * |mpe|).
// Also: the rule pack (OIML_R76_2006.json) currently tags form "14" (span_stability) with
// kernel "K1", not "K4" — but the task brief explicitly asks for `k4SpanStability` here and
// the actual Annex B.4 pass condition is not a per-row K1 check, it's the variation-across-
// measurements check above. This is a real inconsistency between the rule pack and the
// standard/task brief; flagged for the lead to reconcile (see final report).

export interface K4SpanStabilityMeasurement {
  /** Day/time label for the report, purely informational. */
  atDay?: number;
  /** E_SP,i — the error of indication at this measurement, near Max (R 76-1 Annex B.4). */
  error: number;
}

export interface K4SpanStabilityInput {
  measurements: K4SpanStabilityMeasurement[];
  /** Verification scale interval at the test load (near Max). */
  e: number;
  /** |mpe| on initial verification, at the test load (near Max) — Annex B.4 explicitly says
   * "on initial verification", not the in-service mpe, regardless of the stage being tested. */
  mpeInitial: number;
}

export interface K4SpanStabilityResult {
  variation: number; // max(error) - min(error)
  allowedVariation: number; // max(0.5e, 0.5|mpeInitial|)
  variationConditionMet: boolean;
  /** Per-measurement §5.3.3 first clause: |E| <= |mpeInitial|. */
  perMeasurementVerdicts: Verdict[];
  verdict: Verdict;
  notes: string[];
}

export function k4SpanStability(input: K4SpanStabilityInput): K4SpanStabilityResult {
  const notes: string[] = [];
  const mpeAbs = Math.abs(input.mpeInitial);
  const allowedVariation = Math.max(0.5 * input.e, 0.5 * mpeAbs);

  const perMeasurementVerdicts: Verdict[] = input.measurements.map((m) =>
    Math.abs(m.error) <= mpeAbs ? "PASSED" : "FAILED",
  );

  if (input.measurements.length < 2) {
    notes.push("Fewer than 2 measurements supplied — variation cannot be computed; only the per-measurement |E| <= |mpe| check applies.");
    return {
      variation: 0,
      allowedVariation,
      variationConditionMet: true,
      perMeasurementVerdicts,
      verdict: overallVerdict(perMeasurementVerdicts),
      notes,
    };
  }

  const errors = input.measurements.map((m) => m.error);
  const variation = Math.max(...errors) - Math.min(...errors);
  const variationConditionMet = variation <= allowedVariation;

  const verdict = overallVerdict([...perMeasurementVerdicts, variationConditionMet ? "PASSED" : "FAILED"]);

  return {
    variation,
    allowedVariation,
    variationConditionMet,
    perMeasurementVerdicts,
    verdict,
    notes,
  };
}
