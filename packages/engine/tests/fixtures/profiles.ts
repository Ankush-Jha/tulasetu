/**
 * Shared sample InstrumentProfile fixtures for applicability.test.ts and
 * validate.test.ts. Kept small and documented so other agents' test suites (kernels,
 * mpe, family) can reuse them instead of inventing their own ad-hoc profiles.
 *
 * All profiles are in grams (`unit: "g"`) unless noted, to keep the arithmetic in this
 * file matching the standard's own worked examples verbatim.
 */
import type { InstrumentProfile } from "../../src/types.js";

/**
 * R 76-1:2006 §3.3's OWN worked example (docs/standards/extracted/
 * OIML_R76-1_2006_requirements.txt, "Example for a multi-interval instrument"):
 *   Max = 2 / 5 / 15 kg, class III, e = 1 / 2 / 10 g.
 *   Min = 20 g, Max1 = 2 kg (e1 = 1 g, n1 = 2000)
 *   Min2 = 2 kg, Max2 = 5 kg (e2 = 2 g, n2 = 2500)
 *   Min3 = 5 kg, Max3 = 15 kg (e3 = 10 g, n3 = 1500)
 * This is the golden fixture for the multi-interval "one form set, not one per partial
 * range" rule, and for validateProfile's Table 3 / Table 4 checks.
 */
export const CLASS_III_MULTI_INTERVAL: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  ranges: [
    { e: 1, d: 1, min: 20, max: 2000 },
    { e: 2, d: 2, min: 2000, max: 5000 },
    { e: 10, d: 10, min: 5000, max: 15000 },
  ],
  electronic: true,
  hasTareDevice: false,
  hasPrintOrStorage: false,
  tiltable: true,
  rollingLoad: false,
  vehiclePowered: false,
};

/**
 * A class I analytical balance: self-indicating, electronic, single range, no
 * tilting/span-stability/damp-heat (all exempt for class I per R 76-1 §3.9.1.1 /
 * §5.3.2 / §5.3.3), no endurance (Annex A.6 excludes class I regardless of Max).
 */
export const CLASS_I_ANALYTICAL_BALANCE: InstrumentProfile = {
  unit: "g",
  accuracyClass: "I",
  indicatingType: "self",
  rangeKind: "single",
  ranges: [{ e: 0.001, d: 0.001, min: 0.1, max: 220 }],
  electronic: true,
  hasTareDevice: true,
  hasPrintOrStorage: false,
  tiltable: false, // class I instruments are fitted with a leveling device instead (§3.9.1.1)
  rollingLoad: false,
  vehiclePowered: false,
};

/**
 * A class IIII (India: "IV") non-self-indicating instrument: a simple, non-electronic
 * beam/steelyard scale. Discrimination uses the §3.8.1 (non-self) variant; sensitivity
 * (form 4.2) and non-self discrimination both require indicatingType === "non-self".
 */
export const CLASS_IIII_NON_SELF: InstrumentProfile = {
  unit: "g",
  accuracyClass: "IIII",
  indicatingType: "non-self",
  rangeKind: "single",
  ranges: [{ e: 5, d: 5, min: 50, max: 500 }],
  electronic: false,
  hasTareDevice: false,
  hasPrintOrStorage: false,
  tiltable: false,
  rollingLoad: false,
  vehiclePowered: false,
};

/**
 * A class III multiple-range instrument (two independently-selectable weighing
 * ranges, e.g. a dual-range bench scale): e1 < e2, each range independently valid
 * against Table 3. Golden fixture for "multiple-range -> a full form set per range".
 */
export const CLASS_III_MULTIPLE_RANGE: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multiple-range",
  ranges: [
    { e: 1, d: 1, min: 20, max: 1000 },
    { e: 2, d: 2, min: 100, max: 3000 },
  ],
  electronic: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  tiltable: true,
  rollingLoad: false,
  vehiclePowered: false,
};

/**
 * India Seventh Schedule class II* -- a class II instrument intended for direct sales
 * to the public (docs/research/heading-a-raw.txt: "instruments...intended for direct
 * sales to the public are designated class II*"). Not an OIML concept; modeled here as
 * accuracyClass "II" + directSalesToPublic: true. Gets the extra no-load tilting
 * sub-test (surfaced via `title`, see applicability.ts).
 */
export const INDIA_CLASS_II_STAR: InstrumentProfile = {
  unit: "g",
  accuracyClass: "II",
  indicatingType: "self",
  rangeKind: "single",
  ranges: [{ e: 1, d: 1, min: 50, max: 15000 }],
  electronic: true,
  directSalesToPublic: true,
  priceComputing: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  tiltable: true,
  rollingLoad: false,
  vehiclePowered: false,
};

/** A vehicle-powered, road-weighbridge-style class III instrument, for form 12.7. */
export const CLASS_III_VEHICLE_POWERED: InstrumentProfile = {
  unit: "kg",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "single",
  ranges: [{ e: 10, d: 10, min: 200, max: 40000 }],
  electronic: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  tiltable: false,
  rollingLoad: true,
  vehiclePowered: true,
  powerSupply: ["vehicle"],
};
