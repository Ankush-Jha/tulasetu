// Core domain types. Fill/extend against docs/standards/OIML_R76-1_2006_requirements.pdf.

export type AccuracyClass = "I" | "II" | "III" | "IIII"; // India also writes "IV" -> normalize to "IIII"
export type IndicatingType = "self" | "semi-self" | "non-self";

/** A single weighing range (multi-interval / multiple-range instruments have several). */
export interface Range {
  e: number;      // verification scale interval (in the instrument's unit)
  d: number;      // actual scale interval (d <= e)
  max: number;    // maximum capacity of this range
  min: number;    // minimum capacity
  n?: number;     // = max / e (derive if absent)
}

export interface InstrumentProfile {
  unit: "mg" | "g" | "kg" | "t";
  accuracyClass: AccuracyClass;
  indicatingType: IndicatingType;
  electronic: boolean;
  ranges: Range[];              // one entry = single range; many = multi-interval / multiple-range
  multiInterval?: boolean;      // true = multi-interval (e changes with load within one range)
  directSalesToPublic?: boolean;// class II here becomes "II*" for tilting applicability
  vehiclePowered?: boolean;
  hasTare?: boolean;
  hasPrintOrStorage?: boolean;
  tiltable?: boolean;
}

export interface Observation {
  load: number;          // L, the applied test load
  indication: number;    // I, what the display showed
  addLoad?: number;      // ΔL, small weights added to reach the next changeover point
  zeroError?: number;    // E0, error at/near zero for correction
}

export type Verdict = "PASSED" | "FAILED" | "NA"; // NA renders as "– –"

export interface RowResult {
  load: number;
  error: number;         // E
  correctedError: number;// Ec
  mpe: number;           // resolved for this load band
  verdict: Verdict;
  reason?: string;       // e.g. why NA, or which band was used
}
