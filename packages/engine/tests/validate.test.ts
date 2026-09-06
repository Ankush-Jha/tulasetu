/**
 * Golden tests for the input validation layer (validateProfile, validateObservations,
 * validateSoftwareIdentification).
 *
 * As with tests/kernels/*.test.ts, the rule pack is transcribed literally rather than
 * read from packages/rulepacks/OIML_R76_2006.json (no resolveJsonModule wired up yet).
 */
import { describe, expect, it } from "vitest";
import { validateObservations, validateProfile, validateSoftwareIdentification } from "../src/validate.js";
import type { RulePack } from "../src/rulepack.js";
import type { WeighingObservation } from "../src/types.js";
import {
  CLASS_III_MULTI_INTERVAL,
  CLASS_I_ANALYTICAL_BALANCE,
  CLASS_IIII_NON_SELF,
  CLASS_III_MULTIPLE_RANGE,
  INDIA_CLASS_II_STAR,
} from "./fixtures/profiles.js";

const PACK: RulePack = {
  ruleset_id: "OIML_R76_2006",
  class_aliases: { IIII: ["IV"] },
  e_form: [1, 2, 5],
  classification: [
    { class: "I", e_min_g: 0.001, e_max_g: null, n_min: 50000, n_max: null, min_capacity: "100e" },
    { class: "II", e_min_g: 0.001, e_max_g: 0.05, n_min: 100, n_max: 100000, min_capacity: "20e" },
    { class: "II", e_min_g: 0.1, e_max_g: null, n_min: 5000, n_max: 100000, min_capacity: "50e" },
    { class: "III", e_min_g: 0.1, e_max_g: 2, n_min: 100, n_max: 10000, min_capacity: "20e" },
    { class: "III", e_min_g: 5, e_max_g: null, n_min: 500, n_max: 10000, min_capacity: "20e" },
    { class: "IIII", e_min_g: 5, e_max_g: null, n_min: 100, n_max: 1000, min_capacity: "10e" },
  ],
  mpe_bands_initial: [
    { limit: "0.5e", max_m_in_e: { I: 50000, II: 5000, III: 500, IIII: 50 } },
    { limit: "1.0e", max_m_in_e: { I: 200000, II: 20000, III: 2000, IIII: 200 } },
    { limit: "1.5e", max_m_in_e: { I: null, II: 100000, III: 10000, IIII: 1000 } },
  ],
  multi_interval_boundary: { I: 50000, II: 5000, III: 500, IIII: 50 },
  tests: [{ id: "weighing_performance", form: "1", kernel: "K1", applies: { always: true } }],
};

function errorsOf(issues: ReturnType<typeof validateProfile>) {
  return issues.filter((i) => i.severity === "error");
}

describe("validateProfile: golden fixtures are clean", () => {
  it("class III multi-interval (2/5/15 kg) -- R 76-1's own worked example -- has no errors", () => {
    const issues = validateProfile(CLASS_III_MULTI_INTERVAL, PACK);
    expect(errorsOf(issues)).toEqual([]);
    // and it should tell us which Table 3 rows were used (traceability).
    expect(issues.some((i) => i.code === "I_CLASSIFICATION_ROW_USED")).toBe(true);
  });

  it("class I analytical balance has no errors", () => {
    expect(errorsOf(validateProfile(CLASS_I_ANALYTICAL_BALANCE, PACK))).toEqual([]);
  });

  it("class IIII non-self-indicating instrument has no errors", () => {
    expect(errorsOf(validateProfile(CLASS_IIII_NON_SELF, PACK))).toEqual([]);
  });

  it("class III multiple-range instrument has no errors", () => {
    expect(errorsOf(validateProfile(CLASS_III_MULTIPLE_RANGE, PACK))).toEqual([]);
  });

  it("India class II* instrument has no errors", () => {
    expect(errorsOf(validateProfile(INDIA_CLASS_II_STAR, PACK))).toEqual([]);
  });
});

describe("validateProfile: e-form (R 76-1 §3.2 / Table 2)", () => {
  it("rejects e = 3 g (not 1/2/5 x 10^k)", () => {
    const bad = { ...CLASS_IIII_NON_SELF, ranges: [{ ...CLASS_IIII_NON_SELF.ranges[0]!, e: 3, d: 3 }] };
    const issues = validateProfile(bad, PACK);
    expect(issues.some((i) => i.code === "E_E_NOT_STANDARD_FORM")).toBe(true);
  });

  it("accepts e = 2 x 10^1 = 20", () => {
    const ok = { ...CLASS_IIII_NON_SELF, ranges: [{ e: 20, d: 20, min: 200, max: 2000 }] };
    const issues = validateProfile(ok, PACK);
    expect(issues.some((i) => i.code === "E_E_NOT_STANDARD_FORM")).toBe(false);
  });
});

describe("validateProfile: d <= e (R 76-1 Table 2 / §3.4.2)", () => {
  it("flags d > e", () => {
    const bad = { ...CLASS_IIII_NON_SELF, ranges: [{ e: 5, d: 10, min: 50, max: 500 }] };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_D_GT_E")).toBe(true);
  });

  it("warns when e > 10d (outside §3.4.2's d < e <= 10d), non-class-I", () => {
    const bad = { ...CLASS_IIII_NON_SELF, ranges: [{ e: 5, d: 0.1, min: 50, max: 500 }] };
    const issues = validateProfile(bad, PACK);
    expect(issues.some((i) => i.code === "E_E_D_RATIO_OUT_OF_RANGE")).toBe(true);
  });

  it("does not warn for the class-I, d < 1mg exemption", () => {
    const okClassI = {
      ...CLASS_I_ANALYTICAL_BALANCE,
      ranges: [{ e: 0.001, d: 0.0001, min: 0.1, max: 220 }], // d = 0.1 mg < 1 mg
    };
    const issues = validateProfile(okClassI, PACK);
    expect(issues.some((i) => i.code === "E_E_D_RATIO_OUT_OF_RANGE")).toBe(false);
  });
});

describe("validateProfile: Table 3 classification", () => {
  it("flags n out of range for the matched row", () => {
    // class IIII, e=5g, Max=10000g -> n=2000, row max n is 1000.
    const bad = { ...CLASS_IIII_NON_SELF, ranges: [{ e: 5, d: 5, min: 50, max: 10000 }] };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_N_OUT_OF_RANGE")).toBe(true);
  });

  it("flags no matching Table 3 row (e too small for the declared class)", () => {
    // class IIII requires e >= 5 g; e = 1 g has no row for class IIII.
    const bad = { ...CLASS_IIII_NON_SELF, ranges: [{ e: 1, d: 1, min: 10, max: 100 }] };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_NO_CLASSIFICATION_ROW")).toBe(true);
  });

  it("flags Min below the required multiple of e", () => {
    // class IIII, min_capacity = 10e = 50g; Min = 10g is too low.
    const bad = { ...CLASS_IIII_NON_SELF, ranges: [{ e: 5, d: 5, min: 10, max: 500 }] };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_MIN_CAPACITY_TOO_LOW")).toBe(true);
  });
});

describe("validateProfile: Table 4 (multi-interval)", () => {
  it("flags a Max_i / e_{i+1} boundary violation", () => {
    // class III boundary is 500. Max1=2000g, e2=10g -> n=200 < 500: violates Table 4.
    const bad = {
      ...CLASS_III_MULTI_INTERVAL,
      ranges: [
        { e: 1, d: 1, min: 20, max: 2000 },
        { e: 10, d: 10, min: 2000, max: 5000 },
        { e: 20, d: 20, min: 5000, max: 15000 },
      ],
    };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_TABLE4_BOUNDARY_VIOLATION")).toBe(true);
  });

  it("flags e not strictly increasing between partial ranges", () => {
    const bad = {
      ...CLASS_III_MULTI_INTERVAL,
      ranges: [
        { e: 2, d: 2, min: 20, max: 2000 },
        { e: 2, d: 2, min: 2000, max: 5000 },
        { e: 10, d: 10, min: 5000, max: 15000 },
      ],
    };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_MULTI_INTERVAL_E_NOT_INCREASING")).toBe(true);
  });

  it("flags Min_i != Max_{i-1}", () => {
    const bad = {
      ...CLASS_III_MULTI_INTERVAL,
      ranges: [
        { e: 1, d: 1, min: 20, max: 2000 },
        { e: 2, d: 2, min: 2500, max: 5000 }, // should be 2000
        { e: 10, d: 10, min: 5000, max: 15000 },
      ],
    };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_MULTI_INTERVAL_MIN_MISMATCH")).toBe(true);
  });
});

describe("validateProfile: multiple-range ascending e", () => {
  it("flags e not ascending across weighing ranges", () => {
    const bad = {
      ...CLASS_III_MULTIPLE_RANGE,
      ranges: [
        { e: 2, d: 2, min: 20, max: 1000 },
        { e: 1, d: 1, min: 100, max: 3000 },
      ],
    };
    expect(validateProfile(bad, PACK).some((i) => i.code === "E_MULTIPLE_RANGE_E_NOT_ASCENDING")).toBe(true);
  });
});

describe("validateObservations", () => {
  it("flags non-finite values", () => {
    const obs: WeighingObservation[] = [{ load: NaN, indication: 100 }];
    expect(validateObservations(CLASS_IIII_NON_SELF, obs).some((i) => i.code === "E_NON_FINITE_VALUE")).toBe(true);
  });

  it("flags a load outside Min..Max", () => {
    const obs: WeighingObservation[] = [{ load: 10000, indication: 10000 }]; // Max=500
    expect(validateObservations(CLASS_IIII_NON_SELF, obs).some((i) => i.code === "E_LOAD_OUT_OF_RANGE")).toBe(true);
  });

  it("flags a negative additionalLoad", () => {
    const obs: WeighingObservation[] = [{ load: 100, indication: 100, additionalLoad: -1 }];
    expect(validateObservations(CLASS_IIII_NON_SELF, obs).some((i) => i.code === "E_NEGATIVE_ADDITIONAL_LOAD")).toBe(true);
  });

  it("flags duplicate rows", () => {
    const obs: WeighingObservation[] = [
      { load: 100, indication: 100 },
      { load: 100, indication: 100 },
    ];
    expect(validateObservations(CLASS_IIII_NON_SELF, obs).some((i) => i.code === "W_DUPLICATE_OBSERVATION")).toBe(true);
  });

  it("catches the multi-interval banding trap: a load inside Min..Max but not inside any partial range", () => {
    // Overall envelope is 20..15000 g, but there is a gap test: pick a load exactly at
    // a boundary (valid) vs one deliberately outside all three partial ranges by
    // constructing a profile with a gap.
    const withGap = {
      ...CLASS_III_MULTI_INTERVAL,
      ranges: [
        { e: 1, d: 1, min: 20, max: 1000 }, // gap between 1000 and 2000
        { e: 2, d: 2, min: 2000, max: 5000 },
        { e: 10, d: 10, min: 5000, max: 15000 },
      ],
    };
    const obs: WeighingObservation[] = [{ load: 1500, indication: 1500 }];
    const issues = validateObservations(withGap, obs);
    expect(issues.some((i) => i.code === "W_LOAD_NOT_IN_ANY_RANGE")).toBe(true);
  });

  it("returns no issues for a clean set of rows within a single-range instrument", () => {
    const obs: WeighingObservation[] = [
      { load: 100, indication: 100 },
      { load: 250, indication: 250 },
      { load: 500, indication: 500 },
    ];
    expect(validateObservations(CLASS_IIII_NON_SELF, obs)).toEqual([]);
  });
});

describe("validateSoftwareIdentification: the certificate-corpus checksum audit", () => {
  // docs/certificates/certificates-analysis.md, "THE CHECKSUM AUDIT" table.

  it("accepts a correct 20-char hex checksum (cert #008)", () => {
    expect(validateSoftwareIdentification("34559a18232bc0c6c417")).toEqual([]);
  });

  it("warns on a 4-char (minimal-length) hex value (certs #050, #200, #251)", () => {
    for (const v of ["0B6A", "3A7F", "D300"]) {
      const issues = validateSoftwareIdentification(v);
      expect(issues.some((i) => i.code === "W_SWID_MINIMAL_LENGTH"), v).toBe(true);
      expect(issues.some((i) => i.severity === "error"), v).toBe(false);
    }
  });

  it("flags a value that looks like a file size (cert #100: \"8100kb\")", () => {
    const issues = validateSoftwareIdentification("8100kb");
    expect(issues.some((i) => i.code === "E_SWID_LOOKS_LIKE_FILESIZE")).toBe(true);
  });

  it("flags a value that looks like a modulus / power of two (cert #349: \"65536\")", () => {
    const issues = validateSoftwareIdentification("65536");
    expect(issues.some((i) => i.code === "E_SWID_LOOKS_LIKE_MODULUS")).toBe(true);
  });

  it("flags template filler (certs #320, #340: \"is\", \"Details\")", () => {
    for (const v of ["is", "Details"]) {
      const issues = validateSoftwareIdentification(v);
      expect(issues.some((i) => i.code === "E_SWID_PLACEHOLDER"), v).toBe(true);
    }
  });

  it("flags non-hex characters generally", () => {
    const issues = validateSoftwareIdentification("not-a-checksum!!");
    expect(issues.some((i) => i.code === "E_SWID_NOT_HEX")).toBe(true);
  });

  it("flags an empty value", () => {
    const issues = validateSoftwareIdentification("   ");
    expect(issues.some((i) => i.code === "E_SWID_EMPTY")).toBe(true);
  });

  it("flags a cross-certificate duplicate used by a different manufacturer (certs #259 & #300)", () => {
    const shared = "e24a8d3c12b7f5a89e1b";
    const knownChecksums = { [shared.toLowerCase()]: "Manufacturer A (cert #259)" };
    const issues = validateSoftwareIdentification(shared, { owner: "Manufacturer B (cert #300)", knownChecksums });
    expect(issues.some((i) => i.code === "E_SWID_DUPLICATE_ACROSS_OWNERS")).toBe(true);
  });

  it("does NOT flag a duplicate when the owner matches (re-validating the same certificate)", () => {
    const shared = "e24a8d3c12b7f5a89e1b";
    const knownChecksums = { [shared.toLowerCase()]: "Manufacturer A (cert #259)" };
    const issues = validateSoftwareIdentification(shared, { owner: "Manufacturer A (cert #259)", knownChecksums });
    expect(issues.some((i) => i.code === "E_SWID_DUPLICATE_ACROSS_OWNERS")).toBe(false);
  });
});
