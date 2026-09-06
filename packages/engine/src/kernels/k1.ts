/**
 * Kernel K1 — error vs mpe.
 *
 * R 76-2:2007 explanatory notes (docs/standards/extracted/OIML_R76-2_2007_report_format.txt,
 * around line 178) and R 76-1:2006 §A.4.4.3 (docs/standards/extracted/OIML_R76-1_2006_requirements.txt,
 * around line 4086) give the formula chain:
 *
 *   P  = I + 1/2 e - dL          (indication prior to rounding, digital instruments)
 *   E  = I - L    or    = P - L  (error)
 *   Ec = E - E0                  (corrected error; E0 = error at or near zero)
 *   pass if |Ec| <= |mpe|
 *
 * R 76-1 §3.5.3.2: "The rounding error included in any digital indication shall be
 * eliminated if the actual scale interval is greater than 0.2 e." That is: only when
 * d > 0.2e do we use the changeover-point procedure (P = I + 1/2e - dL); when
 * d <= 0.2e the display is already fine enough that the 1/2e correction and the
 * additional-load reading are not applied, and E is simply I - L.
 *
 * R 76-1 §3.3.3, last paragraph: "e is to be taken according to the load applied" —
 * for a multi-interval instrument, e in the 1/2e term is e_i of the partial range
 * governing this row, exactly the same e the mpe resolver picked for this load (see
 * mpe.ts). We reuse resolveMpe's range selection for this reason: the two must never
 * disagree about which partial range a load belongs to.
 *
 * Pure function: no I/O, no randomness, no dependency on wall-clock time.
 */

import { resolveMpe } from "../mpe.js";
import type { RulePack } from "../rulepack.js";
import type {
  InstrumentProfile,
  VerificationStage,
  Verdict,
  WeighingObservation,
  WeighingRowResult,
} from "../types.js";

export interface K1Input {
  profile: InstrumentProfile;
  observations: WeighingObservation[];
  /**
   * E0, the error at or near zero (R 76-2 explanatory notes). If omitted, it is
   * derived from the observation whose `load` is exactly 0 in the same batch (the
   * "changeover point at zero" reading called for by A.4.4.3). If neither is
   * available, E0 defaults to 0 — see the judgment call noted in kernels/k1.test.ts
   * and the handoff report; a caller that always has a dedicated zero row need not
   * think about this.
   */
  zeroError?: number;
  stage?: VerificationStage;
}

export interface K1Output {
  rows: WeighingRowResult[];
  verdict: Verdict;
}

// Same epsilon philosophy as mpe.ts: comparisons here are on quantities expressed
// in the profile's unit or in multiples of e, never on raw float noise. 1e-9 is
// far above float64 noise (~1e-16 relative) and far below any legally meaningful
// difference (the standard's thresholds are exact multiples of e or of mpe).
const EPSILON_FACTOR = 1e-9;

/** R 76-1 §3.3.3 last paragraph — pick e_i for the 1/2e term via the same range the mpe resolver used for this load. */
function resolveEForRow(profile: InstrumentProfile, load: number, pack: RulePack, stage: VerificationStage) {
  const mpe = resolveMpe(profile, load, pack, stage);
  const range = profile.ranges[mpe.rangeIndex - 1];
  if (range === undefined) {
    // Unreachable: resolveMpe only ever returns a rangeIndex that indexes profile.ranges.
    throw new Error("k1: internal error — mpe resolver returned an out-of-bounds rangeIndex.");
  }
  return { mpe, e: range.e, d: range.d };
}

/**
 * R 76-1 §3.5.3.2 — rounding elimination applies only when the actual scale
 * interval d is (strictly) greater than 0.2 e. The pack states this as data
 * (`rounding_elimination_when`); today it is always "d > 0.2e", but the ratio
 * itself (0.2) is not repeated in code — we parse it from the pack string.
 */
function roundingIsEliminated(d: number, e: number, pack: RulePack): boolean {
  const spec = pack.rounding_elimination_when ?? "d > 0.2e";
  const m = /^\s*d\s*>\s*([0-9]*\.?[0-9]+)\s*e\s*$/i.exec(spec);
  if (!m || m[1] === undefined) {
    throw new Error(`k1: unparseable rounding_elimination_when ${JSON.stringify(spec)} in rule pack.`);
  }
  const ratio = Number(m[1]);
  const eps = e * EPSILON_FACTOR;
  return d > ratio * e + eps;
}

/**
 * Compute one row's P / E, given the formula-chain inputs. Ec is filled in by the
 * caller once E0 is known (E0 itself is the E of the zero row, computed by this
 * same function).
 */
function computeErrorPriorToCorrection(
  obs: WeighingObservation,
  e: number,
  d: number,
  pack: RulePack,
): { priorToRounding: number; error: number; roundingEliminated: boolean } {
  const additionalLoad = obs.additionalLoad ?? 0;
  const eliminated = roundingIsEliminated(d, e, pack);
  if (eliminated) {
    // P = I + 1/2 e - dL ; E = P - L
    const priorToRounding = obs.indication + e / 2 - additionalLoad;
    return { priorToRounding, error: priorToRounding - obs.load, roundingEliminated: true };
  }
  // d <= 0.2 e: rounding error is already negligible relative to mpe: E = I - L,
  // the 1/2e correction and the additional-load reading are not applied.
  return { priorToRounding: obs.indication, error: obs.indication - obs.load, roundingEliminated: false };
}

/**
 * Kernel K1 — error vs mpe. Drives R 76-2 forms 1 (weighing performance), 3.1/3.2
 * (eccentricity), 5 (repeatability), 8 (tilting), 9 (tare), 10 (warm-up), 11
 * (voltage), 13 (damp heat), 14 (span stability), 15 (endurance) — anything whose
 * pass/fail is "|Ec| <= |mpe|" on a set of load/indication pairs.
 */
export function k1ErrorVsMpe(input: K1Input, pack: RulePack): K1Output {
  const { profile, observations, stage = "initial" } = input;

  // Pass 1: raw P/E per row (E0-independent), plus mpe + e/d bookkeeping.
  const raw = observations.map((obs) => {
    const { mpe, e, d } = resolveEForRow(profile, obs.load, pack, stage);
    const { priorToRounding, error, roundingEliminated } = computeErrorPriorToCorrection(obs, e, d, pack);
    return { obs, mpe, priorToRounding, error, roundingEliminated };
  });

  // E0 = error at or near zero (R 76-2 explanatory notes). Prefer an explicit
  // zeroError; otherwise use the batch's own load === 0 row, if any; otherwise 0.
  // (See the K1Input.zeroError doc comment for why 0 is the fallback, not a throw:
  // the engine must still return a result for e.g. a single-row unit test that has
  // no interest in E0 at all.)
  let e0 = input.zeroError;
  if (e0 === undefined) {
    const zeroRow = raw.find((r) => r.obs.load === 0);
    e0 = zeroRow ? zeroRow.error : 0;
  }

  const rows: WeighingRowResult[] = raw.map(({ obs, mpe, priorToRounding, error, roundingEliminated }) => {
    const correctedError = error - (e0 as number);
    const eps = mpe.mpe * EPSILON_FACTOR + EPSILON_FACTOR; // guard the |mpe|===0 case too
    const verdict: Verdict = Math.abs(correctedError) <= mpe.mpe + eps ? "PASSED" : "FAILED";
    return {
      load: obs.load,
      indication: obs.indication,
      additionalLoad: obs.additionalLoad ?? 0,
      priorToRounding,
      error,
      correctedError,
      mpe,
      verdict,
      roundingEliminated,
      ...(obs.label !== undefined ? { label: obs.label } : {}),
    };
  });

  const verdict: Verdict = rows.some((r) => r.verdict === "FAILED") ? "FAILED" : "PASSED";
  return { rows, verdict };
}
