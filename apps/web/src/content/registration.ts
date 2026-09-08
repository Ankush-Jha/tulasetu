/**
 * The words the instrument form uses.
 *
 * Each choice carries what it is and what it changes. The second half matters: ticking
 * "software-controlled" adds a 54-item checklist, and choosing class II over class III moves
 * the permissible error by a factor of ten. A form that collects those answers silently is
 * asking someone to sign for a consequence they cannot see.
 *
 * What it no longer carries is a paragraph of explanation per option. Those ran to a screen and
 * a half of prose for fifteen fields, and the officer knows the instrument in front of them.
 * The long-form class descriptions, the Table 3 limits and the four wizard-step blurbs went
 * with the sub-wizard they were written for; the limits are enforced by the engine and reported
 * as findings, which is a better place for them than a caption nobody reads.
 */

import type { InstrumentProfileShape } from "../pages/report/ReportLayout";

// ---------------------------------------------------------------------------
// Accuracy class
// ---------------------------------------------------------------------------

export interface ClassOption {
  id: "I" | "II" | "III" | "IIII";
  symbol: string;
  name: string;
  /** What instruments are actually in this class — the officer picks by this, not by the number. */
  examples: string;
}

export const ACCURACY_CLASSES: ClassOption[] = [
  { id: "I", symbol: "I", name: "Special", examples: "Analytical and micro-balances" },
  { id: "II", symbol: "II", name: "High", examples: "Laboratory, precious metals, pharmacy" },
  { id: "III", symbol: "III", name: "Medium", examples: "Retail counter scales, most commerce" },
  // India's Seventh Schedule writes this class as "IV" in its tables and "IIII" in its test
  // procedures. The rule pack's class_aliases normalise the two; the form shows the OIML symbol.
  { id: "IIII", symbol: "IIII", name: "Ordinary", examples: "Weighbridges, platform scales" },
];

// ---------------------------------------------------------------------------
// Range structure
// ---------------------------------------------------------------------------

export interface RangeKindOption {
  id: InstrumentProfileShape["rangeKind"];
  name: string;
  clause: string;
}

export const RANGE_KINDS: RangeKindOption[] = [
  { id: "single", name: "Single range", clause: "R 76-1 §3.1" },
  { id: "multi-interval", name: "Multi-interval", clause: "R 76-1 §3.3" },
  { id: "multiple-range", name: "Multiple range", clause: "R 76-1 §3.2" },
];

// ---------------------------------------------------------------------------
// Construction features
// ---------------------------------------------------------------------------

export interface FeatureOption {
  key: keyof InstrumentProfileShape;
  label: string;
  /** Which forms or checklists this switches on. Shown only once the answer is yes. */
  effect: string;
}

export const FEATURES: FeatureOption[] = [
  {
    key: "electronic",
    label: "Electronic parts",
    effect: "Adds warm-up, voltage variations, the nine disturbance forms, damp heat and span stability.",
  },
  {
    key: "softwareControlled",
    label: "Software-controlled",
    effect: "Adds checklist 17.4 and the Annex G software-identification audit.",
  },
  {
    key: "vehiclePowered",
    label: "Powered from a road vehicle",
    effect: "Adds forms 12.7a and 12.7b, the road-vehicle transient tests.",
  },
  {
    key: "modular",
    label: "Modular construction",
    effect: "Enables the Annex F indicator/load-cell compatibility check.",
  },
  { key: "hasTareDevice", label: "Tare device", effect: "Adds form 9, the tare weighing test." },
  {
    key: "hasPrintOrStorage",
    label: "Printing or storage device",
    effect: "Adds form 7 — printing must be impossible before equilibrium is reached.",
  },
  {
    key: "tiltable",
    label: "Liable to be tilted in use",
    effect: "Adds form 8, the tilting test. Class I instruments are exempt.",
  },
  {
    key: "rollingLoad",
    label: "Loaded by a rolling load",
    effect: "Adds form 3.2, eccentricity using a rolling load, alongside 3.1.",
  },
  {
    key: "directSalesToPublic",
    label: "Direct sales to the public",
    effect: "Adds checklist 17.2. A class II instrument used this way becomes India's class II*.",
  },
  {
    key: "priceComputing",
    label: "Price computing or labelling",
    effect: "Adds checklist 17.2.",
  },
];
