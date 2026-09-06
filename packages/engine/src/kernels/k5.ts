/**
 * K5 — significant fault.
 *
 * R 76-1 §T.5.5.5 (fault), §T.5.5.6 (significant fault), §5.1.1/§5.2 (acting upon significant
 * faults) / Annex B.3 (disturbance test procedures) / R 76-2 forms 12.1-12.7.
 *
 * Definitions, verbatim:
 *   T.5.5.5 Fault: "Difference between the error of indication and the intrinsic error of an
 *     instrument." (i.e. the extra error caused specifically by the disturbance.)
 *   T.5.5.6 Significant fault: "Fault greater than e." (Note: for a multi-interval instrument,
 *     e is that appropriate to the partial weighing range.)
 *     "The following are not considered to be significant faults, even when they exceed e:
 *       - faults arising from simultaneous and mutually independent causes in the instrument;
 *       - faults implying the impossibility to perform any measurement;
 *       - faults being so serious that they are bound to be noticed by all those interested
 *         in the result of measurement; or
 *       - transitory faults, being momentary variations in the indication which cannot be
 *         interpreted, memorized or transmitted as a measuring result."
 *   §5.1.1: an electronic instrument complies if, under disturbance, either (a) significant
 *     faults do not occur, or (b) significant faults are detected and acted upon. Per its own
 *     Note: "A fault equal to or smaller than e is allowed irrespective of the value of the
 *     error of indication" — i.e. the ">" in "greater than e" is strict; a fault of exactly e
 *     is not significant.
 *   §5.2: "acted upon" means the instrument is made inoperative automatically, or a visual or
 *     audible indication is provided automatically and continues until the user acts or the
 *     fault disappears.
 *
 * R 76-2 forms 12.1-12.7 record, per disturbance trial, the indication under disturbance and
 * a single "Significant fault (> e) or detection and reaction — No / Yes (see remarks)"
 * column, with the explanatory note: "faults greater than e are acceptable provided that they
 * are detected and acted upon, or that they result from circumstances such that these faults
 * shall not be considered as significant" (R 76-2 general notes, p.5).
 *
 * This kernel is PURE: no I/O, no DB, no randomness.
 */

import type { Verdict } from "../types.js";

/** The four verbatim exclusions in R 76-1 §T.5.5.6, none of which count as a significant fault. */
export type SignificantFaultExclusionReason =
  | "simultaneous_independent_causes"
  | "impossible_to_measure"
  | "obviously_wrong"
  | "transitory";

export interface K5Trial {
  /** R 76-2 form 12.x row label, e.g. "0 % Utest, 0.5 cycles". */
  label?: string;
  /**
   * The fault magnitude: |indication under disturbance - indication without disturbance
   * (intrinsic error)| (R 76-1 §T.5.5.5 / §5.3.4), in the same unit as `e`.
   */
  faultMagnitude: number;
  /** e appropriate to the partial weighing range the trial's load falls in (§T.5.5.6 note). */
  e: number;
  /**
   * Did the instrument detect the fault and react per §5.2 (make itself inoperative, or raise
   * a visual/audible alarm that persists until the user acts or the fault disappears)?
   * Only relevant when the fault is significant; ignored otherwise.
   */
  detectedAndReacted?: boolean;
  /** If the fault falls under one of §T.5.5.6's verbatim exclusions, it is never significant,
   * regardless of magnitude or detection. */
  exclusionReason?: SignificantFaultExclusionReason;
}

export interface K5Result {
  label?: string;
  faultMagnitude: number;
  e: number;
  /** Fault > e (§T.5.5.6). Strict inequality — a fault of exactly e is not a fault at all for
   * this purpose (§5.1.1 Note). */
  isFault: boolean;
  excluded: boolean;
  exclusionReason?: SignificantFaultExclusionReason;
  /** isFault && !excluded. */
  significant: boolean;
  /** significant && detectedAndReacted — the disturbance is nonetheless acceptable (§5.1.1 b). */
  excusedByDetection: boolean;
  /** FAILED iff significant && !excusedByDetection. */
  verdict: Verdict;
}

export function k5SignificantFault(trial: K5Trial): K5Result {
  const isFault = trial.faultMagnitude > trial.e;
  const excluded = trial.exclusionReason !== undefined;
  const significant = isFault && !excluded;
  const excusedByDetection = significant && trial.detectedAndReacted === true;
  const verdict: Verdict = significant && !excusedByDetection ? "FAILED" : "PASSED";

  return {
    ...(trial.label !== undefined ? { label: trial.label } : {}),
    faultMagnitude: trial.faultMagnitude,
    e: trial.e,
    isFault,
    excluded,
    ...(trial.exclusionReason !== undefined ? { exclusionReason: trial.exclusionReason } : {}),
    significant,
    excusedByDetection,
    verdict,
  };
}

/** Evaluate every trial of an R 76-2 form 12.x and roll up to the form's own verdict
 * ("Check if a significant fault occurred" -> Passed iff none of the trials FAILED). */
export function k5Form(trials: K5Trial[]): { rows: K5Result[]; verdict: Verdict } {
  const rows = trials.map(k5SignificantFault);
  const verdict: Verdict = rows.some((r) => r.verdict === "FAILED") ? "FAILED" : "PASSED";
  return { rows, verdict };
}
