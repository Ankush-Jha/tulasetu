/**
 * What the registration wizard says, in words a non-specialist can act on.
 *
 * The person filling this in is a laboratory officer, not the author of R 76. They know the
 * instrument in front of them; they do not necessarily know that ticking "software-controlled"
 * adds a 54-item checklist, or that choosing class II over class III changes the permissible
 * error by a factor of ten. A form that collects those answers without saying what they do is
 * asking someone to sign for consequences they cannot see.
 *
 * So every choice here carries three things: what it is, what it means in ordinary terms, and
 * what it will change. That last one is the part most forms leave out.
 */

import type { InstrumentProfileShape } from "../pages/report/ReportLayout";

// ---------------------------------------------------------------------------
// Accuracy class
// ---------------------------------------------------------------------------

export interface ClassOption {
  id: "I" | "II" | "III" | "IIII";
  symbol: string;
  name: string;
  /** What instruments are actually in this class. */
  examples: string;
  /** The plain-language consequence of choosing it. */
  meaning: string;
  /** R 76-1 Table 3's limits, so the officer can check the instrument fits before proceeding. */
  eRange: string;
  nRange: string;
  minCapacity: string;
}

export const ACCURACY_CLASSES: ClassOption[] = [
  {
    id: "I",
    symbol: "I",
    name: "Special",
    examples: "Analytical and micro-balances",
    meaning:
      "The most demanding class. Tightest permissible errors, and several tests fall away because " +
      "the instrument is never used in the conditions they simulate — no tilting, no damp heat, " +
      "no span stability, no endurance.",
    eRange: "e ≥ 0.001 g",
    nRange: "n ≥ 50 000",
    minCapacity: "Min = 100 e",
  },
  {
    id: "II",
    symbol: "II",
    name: "High",
    examples: "Laboratory balances, precious metals, pharmacy scales",
    meaning:
      "Used where the value of what is weighed is high relative to its mass. If the instrument " +
      "is for direct sales to the public, India treats it as class II* and adds a no-load " +
      "tilting test that OIML does not require.",
    eRange: "e 0.001–0.05 g, or e ≥ 0.1 g",
    nRange: "100–100 000, or 5 000–100 000",
    minCapacity: "Min = 20 e or 50 e",
  },
  {
    id: "III",
    symbol: "III",
    name: "Medium",
    examples: "Retail counter scales, most commercial weighing",
    meaning:
      "The commonest class by a wide margin, and the one most model approvals are for. Multi-" +
      "interval instruments in this class are where the permissible error most often widens " +
      "part-way up the range.",
    eRange: "e 0.1–2 g, or e ≥ 5 g",
    nRange: "100–10 000, or 500–10 000",
    minCapacity: "Min = 20 e",
  },
  {
    id: "IIII",
    symbol: "IIII",
    name: "Ordinary",
    examples: "Weighbridges, industrial platform scales, coarse material",
    meaning:
      "The coarsest class, for high-capacity instruments where a gram either way does not " +
      "matter. India's Seventh Schedule writes this class as “IV” in its tables and “IIII” in " +
      "its test procedures — the same class, both spellings.",
    eRange: "e ≥ 5 g",
    nRange: "100–1 000",
    minCapacity: "Min = 10 e",
  },
];

// ---------------------------------------------------------------------------
// Range structure
// ---------------------------------------------------------------------------

export interface RangeKindOption {
  id: InstrumentProfileShape["rangeKind"];
  name: string;
  meaning: string;
  consequence: string;
  clause: string;
}

export const RANGE_KINDS: RangeKindOption[] = [
  {
    id: "single",
    name: "Single range",
    meaning: "One weighing range with one scale interval, from Min to Max.",
    consequence: "One set of test forms. The permissible error still steps as the load rises, but e never changes.",
    clause: "R 76-1 §3.1",
  },
  {
    id: "multi-interval",
    name: "Multi-interval",
    meaning:
      "One Max and one weighing range, divided into partial ranges. The instrument switches " +
      "automatically to a finer or coarser scale interval as the load crosses a changeover point.",
    consequence:
      "One set of forms — but e changes with the load, so the permissible error can widen " +
      "part-way up the range with nothing changing on the display. This is the case a " +
      "spreadsheet gets wrong.",
    clause: "R 76-1 §3.3",
  },
  {
    id: "multiple-range",
    name: "Multiple range",
    meaning:
      "Several independent weighing ranges, each with its own Max and its own scale interval, " +
      "selected by the operator rather than automatically.",
    consequence:
      "Each range is treated as if it were a separate instrument, so the report carries a full " +
      "set of forms per range. Choosing this instead of multi-interval multiplies the work.",
    clause: "R 76-1 §3.2",
  },
];

// ---------------------------------------------------------------------------
// Construction features
// ---------------------------------------------------------------------------

export interface FeatureOption {
  key: keyof InstrumentProfileShape;
  label: string;
  /** What the officer is being asked to confirm about the instrument in front of them. */
  question: string;
  /** Which forms or checklists this switches on. */
  effect: string;
  group: "electrical" | "devices" | "use" | "construction";
}

export const FEATURES: FeatureOption[] = [
  {
    key: "electronic",
    label: "Electronic",
    question: "Does the instrument have electronic parts?",
    effect: "Adds warm-up (10), voltage variations (11), the disturbance forms (12.x), damp heat (13) and span stability (14).",
    group: "electrical",
  },
  {
    key: "softwareControlled",
    label: "Software-controlled",
    question: "Is the legally relevant function under software control?",
    effect: "Adds checklist 17.4 (54 items) and brings the Annex G software-identification audit into play.",
    group: "electrical",
  },
  {
    key: "vehiclePowered",
    label: "Powered from a road vehicle",
    question: "Does it run off a vehicle's electrical supply?",
    effect: "Adds form 12.7 — the road-vehicle transient disturbance tests.",
    group: "electrical",
  },
  {
    key: "modular",
    label: "Modular construction",
    question: "Is it assembled from separately certified modules — an indicator and a load cell?",
    effect: "Enables the Annex F compatibility check. Most instruments on the register are modular.",
    group: "construction",
  },
  {
    key: "hasTareDevice",
    label: "Tare device",
    question: "Can the operator tare the instrument?",
    effect: "Adds form 9, the tare weighing test.",
    group: "devices",
  },
  {
    key: "hasPrintOrStorage",
    label: "Printing or storage device",
    question: "Can it print or store a weight value?",
    effect: "Adds form 7, stability of equilibrium — printing must be impossible before equilibrium is reached.",
    group: "devices",
  },
  {
    key: "tiltable",
    label: "Liable to be tilted in use",
    question: "Can it be tilted or is it mobile in normal use?",
    effect: "Adds form 8, the tilting test. Class I instruments are exempt.",
    group: "use",
  },
  {
    key: "rollingLoad",
    label: "Loaded by a rolling load",
    question: "Is the load rolled onto the receptor — a vehicle onto a weighbridge, for instance?",
    effect: "Adds form 3.2, eccentricity using a rolling load, alongside 3.1.",
    group: "use",
  },
  {
    key: "directSalesToPublic",
    label: "Direct sales to the public",
    question: "Is it used to sell directly to a customer standing in front of it?",
    effect:
      "Adds checklist 17.2. A class II instrument used this way becomes India's class II*, which " +
      "attracts an extra no-load tilting test that OIML does not require.",
    group: "use",
  },
  {
    key: "priceComputing",
    label: "Price computing or labelling",
    question: "Does it compute a price from the weight, or print a label?",
    effect: "Adds checklist 17.2.",
    group: "use",
  },
];

export const FEATURE_GROUPS: { id: FeatureOption["group"]; title: string; hint: string }[] = [
  { id: "electrical", title: "Electrical and software", hint: "These switch on the largest number of tests." },
  { id: "devices", title: "Fitted devices", hint: "What the instrument can do besides weigh." },
  { id: "use", title: "How it is used", hint: "Where and by whom — this changes which rules apply." },
  { id: "construction", title: "Construction", hint: "How the instrument is put together." },
];

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

export interface WizardStep {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  /** What this step decides, said before the officer starts filling it in. */
  purpose: string;
  icon: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "identity",
    number: 1,
    title: "Identity",
    subtitle: "Manufacturer, model, serial",
    purpose:
      "Who made it and which model this report covers. These fields follow the application " +
      "contents in AoM Rule 5, and they are what the certificate will carry.",
    icon: "badge",
  },
  {
    id: "metrology",
    number: 2,
    title: "Metrology",
    subtitle: "Class, capacity, scale intervals",
    purpose:
      "The accuracy class and the weighing ranges. Everything downstream depends on this step — " +
      "the permissible errors, which tests apply, and whether the instrument is a legal " +
      "combination at all.",
    icon: "straighten",
  },
  {
    id: "construction",
    number: 3,
    title: "Construction",
    subtitle: "Features, software, hardware",
    purpose:
      "What the instrument is made of and how it is used. Each answer switches specific test " +
      "forms on or off, and the panel beside it shows the count changing as you go.",
    icon: "memory",
  },
  {
    id: "review",
    number: 4,
    title: "Review",
    subtitle: "Confirm and record",
    purpose:
      "Everything the engine derived from your answers, before anything is written. Saving " +
      "records the profile and resolves the test list.",
    icon: "fact_check",
  },
];
