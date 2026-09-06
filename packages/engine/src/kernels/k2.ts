/**
 * K2 — difference threshold (discrimination).
 *
 * R 76-1 §3.8 (requirements) / §A.4.8 (test procedure) / R 76-2 form 4.1.
 *
 * Three independent sub-tests, one per indication technology (R 76-1 §3.8.1, §3.8.2.1,
 * §3.8.2.2). A given instrument runs exactly one of these, chosen by its IndicatingType
 * and, for digital indication, by whether d >= 5 mg (R 76-1 §A.4.8.2 — "This test applies
 * only to type examination and to instruments with d >= 5 mg"; that applicability gate is
 * the applicability resolver's job, not this kernel's).
 *
 * Every sub-test's procedure floors the "extra load" at 1 mg (R 76-1 §A.4.8: "but not less
 * than 1 mg", repeated verbatim in §A.4.8.1). That floor is a bench-procedure constraint on
 * how the extra load is chosen, not a function of the recorded readings, so it is surfaced
 * here only as an optional non-blocking check (`extraLoadTooSmall`) — never a kernel input.
 *
 * This kernel is PURE: no I/O, no DB, no randomness. mpe is injected (see MpeLookup) because
 * mpe.ts is being built in parallel and is not yet importable.
 */

import type { MpeResolution, Verdict } from "../types.js";

/** Resolves the mpe applicable to a given load. Real implementation lives in `mpe.ts`. */
export type MpeLookup = (load: number) => MpeResolution;

function overallVerdict(verdicts: Verdict[]): Verdict {
  return verdicts.includes("FAILED") ? "FAILED" : "PASSED";
}

// ---------------------------------------------------------------------------
// 3.8.2.2 / A.4.8.2 — digital indication
// ---------------------------------------------------------------------------

/**
 * One row of R 76-2 form 4.1.1. The bench procedure (R 76-1 §A.4.8.2, Figure 10):
 *   1. Load to L, add weights until stabilized, then remove them until the indication
 *      drops unambiguously by one actual scale interval -> that stabilized reading is I1.
 *   2. Add back 1/10 d, then gently add an extra load of 1.4 d -> the resulting reading is I2.
 *   3. Pass iff I2 - I1 >= d.
 */
export interface K2DigitalTrial {
  /** Test load L (the applied load the discrimination is checked at, e.g. Min, 1/2 Max, Max). */
  load: number;
  /** I1 — indication after the intentional one-interval decrease. */
  indicationBefore: number;
  /** d — actual scale interval, in the same unit as the indications. */
  actualScaleInterval: number;
  /** The extra load actually placed to go from I1 to I2 (nominal: 1.4 x d — R 76-1 §A.4.8.2). */
  extraLoadApplied: number;
  /** I2 — indication after the extra load. */
  indicationAfter: number;
  label?: string;
}

export interface K2DigitalParams {
  /**
   * Multiplier applied to d to get the nominal extra load (R 76-1 §A.4.8.2: "1.4 d").
   * Not in OIML_R76_2006.json today — recommend adding `discrimination.extra_load_factor_digital: 1.4`.
   */
  extraLoadFactor?: number;
  /** Relative tolerance for flagging extraLoadApplied as off-procedure. Not a pass/fail input. */
  extraLoadToleranceFraction?: number;
}

export interface K2DigitalResult {
  load: number;
  delta: number; // I2 - I1
  requiredDelta: number; // d
  /** Pass iff delta >= requiredDelta (R 76-2 form 4.1.1: "Check if I2 - I1 >= d"). */
  verdict: Verdict;
  extraLoadExpected: number; // extraLoadFactor x d
  /** True when the extra load actually used deviated from the nominal 1.4 d beyond tolerance. Advisory only. */
  extraLoadOffProcedure: boolean;
  label?: string;
}

const DEFAULT_DIGITAL_EXTRA_LOAD_FACTOR = 1.4; // R 76-1 §A.4.8.2 / §3.8.2.2
const DEFAULT_EXTRA_LOAD_TOLERANCE = 0.05;

export function k2Digital(
  trials: K2DigitalTrial[],
  params: K2DigitalParams = {},
): { rows: K2DigitalResult[]; verdict: Verdict } {
  const extraLoadFactor = params.extraLoadFactor ?? DEFAULT_DIGITAL_EXTRA_LOAD_FACTOR;
  const tolerance = params.extraLoadToleranceFraction ?? DEFAULT_EXTRA_LOAD_TOLERANCE;

  const rows = trials.map((t): K2DigitalResult => {
    const delta = t.indicationAfter - t.indicationBefore;
    const requiredDelta = t.actualScaleInterval;
    const verdict: Verdict = delta >= requiredDelta ? "PASSED" : "FAILED";
    const extraLoadExpected = extraLoadFactor * t.actualScaleInterval;
    const extraLoadOffProcedure =
      extraLoadExpected > 0 &&
      Math.abs(t.extraLoadApplied - extraLoadExpected) > tolerance * extraLoadExpected;
    return {
      load: t.load,
      delta,
      requiredDelta,
      verdict,
      extraLoadExpected,
      extraLoadOffProcedure,
      ...(t.label !== undefined ? { label: t.label } : {}),
    };
  });

  return { rows, verdict: overallVerdict(rows.map((r) => r.verdict)) };
}

// ---------------------------------------------------------------------------
// 3.8.2.1 / A.4.8.1 — analog (self- or semi-self-indicating) indication
// ---------------------------------------------------------------------------

/**
 * R 76-2 form 4.1.2. Extra load = |mpe| for the applied load (not less than 1 mg — floor
 * not modeled here, see file header). Pass iff I2 - I1 >= 0.7 x |mpe|.
 */
export interface K2AnalogTrial {
  load: number;
  indicationBefore: number; // I1
  extraLoadApplied: number; // nominal |mpe| at `load`
  indicationAfter: number; // I2
  label?: string;
}

export interface K2AnalogParams {
  /** R 76-1 §3.8.2.1: displacement must be >= this fraction of the extra load. Default 0.7. */
  displacementFraction?: number;
}

export interface K2AnalogResult {
  load: number;
  delta: number; // I2 - I1
  mpeAtLoad: number;
  requiredDelta: number; // displacementFraction x |mpe|
  verdict: Verdict;
  label?: string;
}

const DEFAULT_ANALOG_DISPLACEMENT_FRACTION = 0.7; // R 76-1 §3.8.2.1

export function k2Analog(
  trials: K2AnalogTrial[],
  mpe: MpeLookup,
  params: K2AnalogParams = {},
): { rows: K2AnalogResult[]; verdict: Verdict } {
  const fraction = params.displacementFraction ?? DEFAULT_ANALOG_DISPLACEMENT_FRACTION;

  const rows = trials.map((t): K2AnalogResult => {
    const mpeAtLoad = Math.abs(mpe(t.load).mpe);
    const delta = t.indicationAfter - t.indicationBefore;
    const requiredDelta = fraction * mpeAtLoad;
    const verdict: Verdict = delta >= requiredDelta ? "PASSED" : "FAILED";
    return {
      load: t.load,
      delta,
      mpeAtLoad,
      requiredDelta,
      verdict,
      ...(t.label !== undefined ? { label: t.label } : {}),
    };
  });

  return { rows, verdict: overallVerdict(rows.map((r) => r.verdict)) };
}

// ---------------------------------------------------------------------------
// 3.8.1 / A.4.8.1 — non-self-indicating instruments
// ---------------------------------------------------------------------------

/**
 * R 76-2 form 4.1.3. Extra load = 0.4 x |mpe| for the applied load (not less than 1 mg — see
 * file header). Pass iff a visible displacement of the indicating element is observed —
 * there is no numeric magnitude recorded, only an observed boolean (form 4.1.3: "Mark a
 * visible displacement by '+'").
 */
export interface K2NonSelfTrial {
  load: number;
  extraLoadApplied: number; // nominal 0.4 x |mpe| at `load`
  visibleDisplacement: boolean;
  label?: string;
}

export interface K2NonSelfParams {
  /** R 76-1 §3.8.1: the extra load is this fraction of |mpe|. Default 0.4. */
  extraLoadFraction?: number;
}

export interface K2NonSelfResult {
  load: number;
  mpeAtLoad: number;
  extraLoadExpected: number; // extraLoadFraction x |mpe|
  visibleDisplacement: boolean;
  verdict: Verdict;
  label?: string;
}

const DEFAULT_NONSELF_EXTRA_LOAD_FRACTION = 0.4; // R 76-1 §3.8.1

export function k2NonSelfIndicating(
  trials: K2NonSelfTrial[],
  mpe: MpeLookup,
  params: K2NonSelfParams = {},
): { rows: K2NonSelfResult[]; verdict: Verdict } {
  const fraction = params.extraLoadFraction ?? DEFAULT_NONSELF_EXTRA_LOAD_FRACTION;

  const rows = trials.map((t): K2NonSelfResult => {
    const mpeAtLoad = Math.abs(mpe(t.load).mpe);
    const verdict: Verdict = t.visibleDisplacement ? "PASSED" : "FAILED";
    return {
      load: t.load,
      mpeAtLoad,
      extraLoadExpected: fraction * mpeAtLoad,
      visibleDisplacement: t.visibleDisplacement,
      verdict,
      ...(t.label !== undefined ? { label: t.label } : {}),
    };
  });

  return { rows, verdict: overallVerdict(rows.map((r) => r.verdict)) };
}
