/**
 * K3 — sensitivity of a non-self-indicating instrument, in mm.
 *
 * R 76-1 §6.1 "Minimum sensitivity" / §A.4.9 (test procedure) / R 76-2 form 4.2.
 * Applies only to non-self-indicating instruments (self/semi-self have no displacement to
 * measure in mm — their sensitivity is checked by K2's analog/digital sub-tests instead).
 *
 * Procedure (§A.4.9): with the instrument oscillating normally, place an extra load equal to
 * |mpe| for the applied load (not less than 1 mg — see k2.ts file header for why that floor
 * is not modeled as a kernel input) and read the permanent displacement of the indicating
 * element. Minimum of two loads tested (e.g. zero and Max).
 *
 * Threshold (§6.1) — verbatim:
 *   1 mm   for an instrument of class I or II;
 *   2 mm   for an instrument of class III or IIII with Max <= 30 kg;
 *   5 mm   for an instrument of class III or IIII with Max > 30 kg.
 *
 * This kernel is PURE: no I/O, no DB, no randomness.
 */

import type { AccuracyClass, Verdict } from "../types.js";

// Note: unlike K2/K4, this kernel does not need an injected mpe lookup — §6.1's pass/fail
// threshold depends only on accuracy class and Max, not on the mpe value itself (the extra
// load being *equal to* |mpe| is a bench-procedure detail, not part of the verdict).

function overallVerdict(verdicts: Verdict[]): Verdict {
  return verdicts.includes("FAILED") ? "FAILED" : "PASSED";
}

export interface K3Trial {
  load: number;
  /** The permanent displacement of the indicating element caused by the extra load, in mm. */
  permanentDisplacementMm: number;
  label?: string;
}

/**
 * R 76-1 §6.1 thresholds, in mm. NOT present in OIML_R76_2006.json today — recommend adding
 * `sensitivity.min_displacement_mm = { class_I_II: 1, class_III_IIII_le_30kg: 2,
 * class_III_IIII_gt_30kg: 5 }` and `sensitivity.max_boundary_kg = 30` to the rule pack.
 */
export interface K3Params {
  minDisplacementMm?: {
    classIOrII: number;
    classIIIOrIIII_atOrBelowBoundary: number;
    classIIIOrIIII_aboveBoundary: number;
  };
  /** Max capacity boundary, in kg, separating the 2 mm and 5 mm bands for class III/IIII. */
  maxBoundaryKg?: number;
}

export interface K3Result {
  load: number;
  permanentDisplacementMm: number;
  requiredMm: number;
  verdict: Verdict;
  label?: string;
}

const DEFAULT_MIN_DISPLACEMENT_MM = {
  classIOrII: 1,
  classIIIOrIIII_atOrBelowBoundary: 2,
  classIIIOrIIII_aboveBoundary: 5,
};
const DEFAULT_MAX_BOUNDARY_KG = 30;

/**
 * @param accuracyClass the instrument's accuracy class.
 * @param maxCapacityKg the instrument's Max, expressed in kg (unit conversion is the
 *   caller's job — this kernel does not import units.ts, which is owned elsewhere and
 *   not yet built).
 */
export function k3Sensitivity(
  accuracyClass: AccuracyClass,
  maxCapacityKg: number,
  trials: K3Trial[],
  params: K3Params = {},
): { rows: K3Result[]; requiredMm: number; verdict: Verdict } {
  const thresholds = params.minDisplacementMm ?? DEFAULT_MIN_DISPLACEMENT_MM;
  const boundaryKg = params.maxBoundaryKg ?? DEFAULT_MAX_BOUNDARY_KG;

  const requiredMm: number =
    accuracyClass === "I" || accuracyClass === "II"
      ? thresholds.classIOrII
      : maxCapacityKg <= boundaryKg
        ? thresholds.classIIIOrIIII_atOrBelowBoundary
        : thresholds.classIIIOrIIII_aboveBoundary;

  const rows = trials.map((t): K3Result => {
    const verdict: Verdict = t.permanentDisplacementMm >= requiredMm ? "PASSED" : "FAILED";
    return {
      load: t.load,
      permanentDisplacementMm: t.permanentDisplacementMm,
      requiredMm,
      verdict,
      ...(t.label !== undefined ? { label: t.label } : {}),
    };
  });

  return { rows, requiredMm, verdict: overallVerdict(rows.map((r) => r.verdict)) };
}
