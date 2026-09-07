/**
 * @tulasetu/engine — core domain types.
 *
 * Every threshold, band boundary and clause reference lives in a rule pack (JSON),
 * never in this file. These types describe the *shape* of the domain only.
 *
 * Primary sources: docs/standards/extracted/OIML_R76-1_2006_requirements.txt
 *                  docs/standards/extracted/OIML_R76-2_2007_report_format.txt
 */

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Canonical OIML accuracy-class symbols. India writes "IV" for "IIII" — normalize on input. */
export type AccuracyClass = "I" | "II" | "III" | "IIII";

/** R 76-1 T.3.x — how equilibrium is reached. */
export type IndicatingType = "self" | "semi-self" | "non-self";

/** Which set of limits applies. R 76-1 §3.5.2: in-service mpe = 2 x initial. */
export type VerificationStage = "initial" | "in-service";

/** R 76-1 §3.2 / §3.3 — how the weighing range is structured. */
export type RangeKind = "single" | "multi-interval" | "multiple-range";

/** Units the engine understands. All internal maths is done in a single base unit (grams). */
export type MassUnit = "mg" | "g" | "kg" | "t";

// ---------------------------------------------------------------------------
// Instrument profile
// ---------------------------------------------------------------------------

/**
 * One partial weighing range (multi-interval) or one weighing range (multiple-range).
 *
 * R 76-1 §3.3.1: partial range i is defined by e_i (e_{i+1} > e_i), Max_i, and
 * Min_i = Max_{i-1}; for i = 1, Min_1 = Min. n_i = Max_i / e_i.
 */
export interface PartialRange {
  /** Verification scale interval e_i, in `unit`. */
  e: number;
  /** Actual scale interval d_i, in `unit`. d <= e. */
  d: number;
  /** Maximum capacity Max_i, in `unit`. */
  max: number;
  /** Minimum capacity Min_i, in `unit`. */
  min: number;
  /** n_i = Max_i / e_i. Derived when absent. */
  n?: number;
}

/**
 * Everything the applicability resolver and the mpe resolver need to know about the
 * instrument under test. Field names mirror AoM Rule 5 / R 76-2 "General information".
 */
export interface InstrumentProfile {
  /** Unit in which every mass quantity in this profile is expressed. */
  unit: MassUnit;
  accuracyClass: AccuracyClass;
  indicatingType: IndicatingType;
  rangeKind: RangeKind;
  /**
   * Ordered ranges. `single` -> exactly one entry.
   * `multi-interval` -> the partial ranges, ascending e.
   * `multiple-range` -> the weighing ranges, ascending e (each treated as its own instrument).
   */
  ranges: PartialRange[];

  /** Has electronic parts -> unlocks warm-up, voltage, disturbance, damp-heat, span-stability forms. */
  electronic: boolean;
  /** India-specific: class II intended for direct sales to the public becomes "II*". */
  directSalesToPublic?: boolean;
  /** Price-computing / label-printing -> R 76-2 checklist 17.2. */
  priceComputing?: boolean;
  /** Software-controlled -> R 76-2 checklist 17.4 + R 76-1 Annex G software identification. */
  softwareControlled?: boolean;
  /** Powered from a road-vehicle supply -> R 76-2 form 12.7 applies. */
  vehiclePowered?: boolean;
  /** Battery/mains -> voltage-variation variants. */
  powerSupply?: ("mains" | "battery" | "vehicle" | "external")[];
  hasTareDevice?: boolean;
  /** Storage or printing device -> R 76-2 form 7 (stability of equilibrium). */
  hasPrintOrStorage?: boolean;
  /** Instrument can be tilted in normal use -> R 76-2 form 8. */
  tiltable?: boolean;
  /** Load can be rolled onto the receptor -> R 76-2 form 3.2 instead of / besides 3.1. */
  rollingLoad?: boolean;
  /** Modular construction -> Annex F compatibility check. */
  modular?: boolean;

  /** Free-text identity fields, carried through to the report header. Not used in maths. */
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  softwareVersion?: string;
  softwareChecksum?: string;
}

// ---------------------------------------------------------------------------
// Observations (what the operator types at the bench)
// ---------------------------------------------------------------------------

/**
 * One weighing row. R 76-2 explanatory notes:
 *   P  = I + 1/2 e - dL          (indication prior to rounding)
 *   E  = I + 1/2 e - dL - L      (error)
 *   Ec = E - E0                  (corrected error)
 */
export interface WeighingObservation {
  /** Applied test load L, in the profile's unit. */
  load: number;
  /** Indication I as displayed, in the profile's unit. */
  indication: number;
  /**
   * Additional load dL applied to reach the next changeover point, in the profile's unit.
   * Only meaningful for digital indications where rounding is eliminated (d > 0.2 e).
   */
  additionalLoad?: number;
  /** Optional label rendered in the report row (e.g. "Max", "Min", "changeover"). */
  label?: string;
}

/** Environmental header carried on env-sensitive R 76-2 forms ("at start / at max / at end"). */
export interface EnvironmentalConditions {
  temperatureC?: number;
  relativeHumidityPct?: number;
  /** Barometric pressure in hPa. Mandatory for class I. */
  pressureHPa?: number;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** R 76-2 marking convention: PASSED / FAILED / not applicable rendered as "- -". */
export type Verdict = "PASSED" | "FAILED" | "NA";

/** Which mpe band R 76-1 Table 6 put this load in, and why. */
export interface MpeResolution {
  /** The absolute mpe value, in the profile's unit. */
  mpe: number;
  /** Band multiplier: 0.5, 1.0 or 1.5. */
  factor: 0.5 | 1.0 | 1.5;
  /** The e used — for multi-interval this is e_i of the partial range the load fell in. */
  e: number;
  /** 1-based index of the partial range / weighing range used. */
  rangeIndex: number;
  /** Load expressed in verification scale intervals: m = load / e. */
  m: number;
  stage: VerificationStage;
  /** Human-readable trace for the report and for debugging. */
  reason: string;
  /** Clause reference from the rule pack, e.g. "R 76-1:2006 Table 6". */
  clause?: string;
}

/** One computed row of a weighing-type form (kernel K1). */
export interface WeighingRowResult {
  load: number;
  indication: number;
  additionalLoad: number;
  /** P = I + 1/2 e - dL. */
  priorToRounding: number;
  /** E = P - L. */
  error: number;
  /** Ec = E - E0. */
  correctedError: number;
  mpe: MpeResolution;
  verdict: Verdict;
  /** True when the rounding error was eliminated (d > 0.2 e). */
  roundingEliminated: boolean;
  label?: string;
}

/** Result of one R 76-2 form. */
export interface FormResult {
  /** R 76-2 form number, e.g. "1", "3.1", "12.4". */
  formId: string;
  /** Rule-pack test id, e.g. "weighing_performance". */
  testId: string;
  kernel: KernelId;
  verdict: Verdict;
  rows: unknown[];
  /** Populated when verdict === "NA". */
  notApplicableReason?: string;
  notes?: string[];
}

/**
 * K6 is not a sixth kind of maths — it is R 76-2 form 7, which checks against fixed multiples
 * of e rather than against a resolved mpe band and so fits none of the first five.
 * docs/VERIFIED.md §14 records the four forms that sit outside the reduction.
 */
export type KernelId = "K1" | "K2" | "K3" | "K4" | "K5" | "K6";

// ---------------------------------------------------------------------------
// Engine-wide error reporting
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning" | "info";

/** A validation finding. Never thrown for data problems — returned, so the UI can render it. */
export interface Issue {
  severity: IssueSeverity;
  /** Stable machine code, e.g. "E_SCALE_INTERVAL_FORM". */
  code: string;
  message: string;
  /** Dotted path into the input that caused it, e.g. "ranges[1].e". */
  path?: string;
  /** Clause reference from the rule pack. */
  clause?: string;
}
