/**
 * Golden tests for the mpe resolver.
 *
 * The primary fixture is R 76-1:2006 §3.3's own worked example:
 *   Max = 2 / 5 / 15 kg, e = 1 / 2 / 10 g, class III, Min = 20 g.
 * See docs/standards/extracted/OIML_R76-1_2006_requirements.txt around line 1207
 * (Table 4 + the "Example for a multi-interval instrument" paragraph):
 *
 *   for m = 0 g      to 500 g    mpe = +/- 0.5 e1 = +/- 0.5 g
 *   for m > 500 g    to 2 000 g  mpe = +/- 1   e1 = +/- 1 g
 *   for m > 2 000 g  to 4 000 g  mpe = +/- 1   e2 = +/- 2 g
 *   for m > 4 000 g  to 5 000 g  mpe = +/- 1.5 e2 = +/- 3 g
 *   for m > 5 000 g  to 15 000 g mpe = +/- 1   e3 = +/- 10 g
 *
 * We test both sides of every boundary, including the two boundaries where the
 * *partial range* changes (at 2 000 g and at 5 000 g) — this is exactly where a
 * naive "walk a single mpe table by load" implementation gets it wrong, because e
 * itself jumps there (CLAUDE.md §5).
 */
import { describe, expect, it } from "vitest";
import { resolveMpe } from "../src/mpe.js";
import { validateRulePack, type RulePack } from "../src/rulepack.js";
import type { InstrumentProfile } from "../src/types.js";

// NOTE: this is a literal transcription of packages/rulepacks/OIML_R76_2006.json
// (the fields resolveMpe / validateRulePack touch), not a file read. The engine's
// tsconfig has neither `resolveJsonModule` nor `@types/node` wired up in this repo
// yet, so a static/dynamic JSON import or an `fs.readFileSync` fails `tsc --noEmit`.
// Once the lead adds `@types/node` (or `resolveJsonModule`), swap this back to
// reading packages/rulepacks/OIML_R76_2006.json directly so the test can never
// drift from the real pack. Flagged in the handoff report.
const pack: RulePack = {
  ruleset_id: "OIML_R76_2006",
  edition: "2007-report-format",
  class_aliases: { IIII: ["IV"] },
  accuracy_classes: ["I", "II", "III", "IIII"],
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
  mpe_in_service_factor: 2,
  multi_interval_boundary: { I: 50000, II: 5000, III: 500, IIII: 50 },
  rounding_elimination_when: "d > 0.2e",
  module_error_fractions: {
    rule: "sum(p_i^2) <= 1",
    p_max: 0.8,
    digital_module_may_be_zero: true,
    typical: { load_cell: 0.7, indicator: 0.5, connecting: 0.5 },
  },
  family_solver: {
    eut_must_include: ["highest_n", "smallest_e"],
    accept_without_test_if: [
      "Max between two tested capacities AND ratio(tested capacities) <= 10",
      "n <= n_test AND e >= e_test AND Max <= 5 * Max_test * (n_test / n)",
    ],
  },
  tests: [
    { id: "weighing_performance", form: "1", kernel: "K1", applies: { always: true } },
    { id: "temp_no_load", form: "2", kernel: "K4", applies: { always: true } },
    { id: "eccentricity_weights", form: "3.1", kernel: "K1", applies: { always: true } },
    { id: "eccentricity_rolling", form: "3.2", kernel: "K1", applies: { rolling_load: true } },
    { id: "discrimination", form: "4.1", kernel: "K2", applies: { not: { digital_d_lt_5mg: true } } },
    { id: "sensitivity", form: "4.2", kernel: "K3", applies: { indicating_type: "non-self" } },
    { id: "repeatability", form: "5", kernel: "K1", applies: { always: true } },
    { id: "zero_return", form: "6.1", kernel: "K4", applies: { always: true } },
    { id: "creep", form: "6.2", kernel: "K4", applies: { always: true } },
    { id: "stability", form: "7", kernel: "K4", applies: { has_print_or_storage: true } },
    { id: "tilting", form: "8", kernel: "K1", applies: { class_in: ["II", "III", "IIII"], tiltable: true } },
    { id: "tare", form: "9", kernel: "K1", applies: { has_tare: true } },
    { id: "warm_up", form: "10", kernel: "K1", applies: { electronic: true } },
    { id: "voltage_variation", form: "11", kernel: "K1", applies: { electronic: true } },
    { id: "disturbances", form: "12", kernel: "K5", applies: { electronic: true } },
    {
      id: "damp_heat",
      form: "13",
      kernel: "K1",
      applies: { electronic: true, not_class: ["I"], not_class_II_if_e_lt: "1g" },
    },
    { id: "span_stability", form: "14", kernel: "K1", applies: { electronic: true, not_class: ["I"] } },
    { id: "endurance", form: "15", kernel: "K1", applies: { max_capacity_kg_lte: 100 }, order: "last" },
  ],
  checklists: ["17.1", "17.2 (direct-sales)", "17.3 (electronic)", "17.4 (software)"],
};

describe("OIML_R76_2006.json", () => {
  it("is structurally valid", () => {
    expect(validateRulePack(pack)).toEqual([]);
  });
});

// R 76-1 §3.3's worked example instrument.
const multiInterval: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: false,
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

describe("resolveMpe — R 76-1 §3.3 multi-interval worked example (golden test)", () => {
  it("m = 0 to 500 -> +/-0.5 e1 = +/-0.5 g (range 1)", () => {
    const r0 = resolveMpe(multiInterval, 0, pack);
    expect(r0.mpe).toBeCloseTo(0.5, 9);
    expect(r0.rangeIndex).toBe(1);
    expect(r0.e).toBe(1);
    expect(r0.factor).toBe(0.5);
  });

  it("boundary at 500 g: 500 -> 0.5 g, 500.001 -> 1 g", () => {
    const at = resolveMpe(multiInterval, 500, pack);
    expect(at.mpe).toBeCloseTo(0.5, 9);
    expect(at.factor).toBe(0.5);

    const over = resolveMpe(multiInterval, 500.001, pack);
    expect(over.mpe).toBeCloseTo(1, 9);
    expect(over.factor).toBe(1.0);
    expect(over.rangeIndex).toBe(1); // still range 1, only the band changed
  });

  it("m > 500 to 2 000 -> +/-1 e1 = +/-1 g (still range 1)", () => {
    const r = resolveMpe(multiInterval, 1500, pack);
    expect(r.mpe).toBeCloseTo(1, 9);
    expect(r.rangeIndex).toBe(1);
    expect(r.e).toBe(1);
  });

  it("boundary at 2 000 g (range AND band both change): 2000 -> 1 g, 2000.001 -> 2 g", () => {
    const at = resolveMpe(multiInterval, 2000, pack);
    expect(at.mpe).toBeCloseTo(1, 9);
    expect(at.rangeIndex).toBe(1);
    expect(at.e).toBe(1);

    // Crossing into range 2 (e2 = 2 g) lands back at the *start* of the 1.0e band
    // in m-terms (m = 2000.001/2 ~ 1000), yet the mpe jumps from 1 g straight to 2 g
    // because e itself doubled. This is the case CLAUDE.md calls "the #1 thing
    // manual Excel gets wrong."
    const over = resolveMpe(multiInterval, 2000.001, pack);
    expect(over.mpe).toBeCloseTo(2, 9);
    expect(over.rangeIndex).toBe(2);
    expect(over.e).toBe(2);
    expect(over.factor).toBe(1.0);
  });

  it("m > 2 000 to 4 000 -> +/-1 e2 = +/-2 g (range 2)", () => {
    const r = resolveMpe(multiInterval, 3000, pack);
    expect(r.mpe).toBeCloseTo(2, 9);
    expect(r.rangeIndex).toBe(2);
  });

  it("boundary at 4 000 g: 4000 -> 2 g, 4000.001 -> 3 g", () => {
    const at = resolveMpe(multiInterval, 4000, pack);
    expect(at.mpe).toBeCloseTo(2, 9);
    expect(at.factor).toBe(1.0);

    const over = resolveMpe(multiInterval, 4000.001, pack);
    expect(over.mpe).toBeCloseTo(3, 9);
    expect(over.factor).toBe(1.5);
    expect(over.rangeIndex).toBe(2);
  });

  it("m > 4 000 to 5 000 -> +/-1.5 e2 = +/-3 g (still range 2)", () => {
    const r = resolveMpe(multiInterval, 4500, pack);
    expect(r.mpe).toBeCloseTo(3, 9);
    expect(r.rangeIndex).toBe(2);
  });

  it("boundary at 5 000 g (range changes again): 5000 -> 3 g, 5000.01 -> 10 g", () => {
    const at = resolveMpe(multiInterval, 5000, pack);
    expect(at.mpe).toBeCloseTo(3, 9);
    expect(at.rangeIndex).toBe(2);
    expect(at.e).toBe(2);

    const over = resolveMpe(multiInterval, 5000.01, pack);
    expect(over.mpe).toBeCloseTo(10, 9);
    expect(over.rangeIndex).toBe(3);
    expect(over.e).toBe(10);
    expect(over.factor).toBe(1.0);
  });

  it("m > 5 000 to 15 000 -> +/-1 e3 = +/-10 g (range 3, constant across the whole sub-range)", () => {
    const mid = resolveMpe(multiInterval, 10000, pack);
    expect(mid.mpe).toBeCloseTo(10, 9);
    expect(mid.rangeIndex).toBe(3);

    const atMax = resolveMpe(multiInterval, 15000, pack);
    expect(atMax.mpe).toBeCloseTo(10, 9);
    expect(atMax.rangeIndex).toBe(3);
  });

  it("throws for a load beyond the instrument's overall Max", () => {
    expect(() => resolveMpe(multiInterval, 15000.001, pack)).toThrow();
  });

  it("is robust to float noise (0.1 + 0.2 style arithmetic) right at a boundary", () => {
    // 500 built via addition should not slip into the next band by float noise.
    const load = 0.1 + 0.2 + 499.7; // exactly 500 mathematically, noisy in float64
    const r = resolveMpe(multiInterval, load, pack);
    expect(r.factor).toBe(0.5);
    expect(r.mpe).toBeCloseTo(0.5, 9);
  });
});

describe("resolveMpe — single-range instruments against Table 6 directly", () => {
  const classIII: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "single",
    electronic: false,
    ranges: [{ e: 5, d: 5, max: 60000, min: 100 }],
  };

  it("class III, e = 5 g: m <= 500 -> 0.5e, m in (500,2000] -> 1.0e, m in (2000,10000] -> 1.5e", () => {
    expect(resolveMpe(classIII, 5 * 500, pack).mpe).toBeCloseTo(2.5, 9); // 0.5 * 5
    expect(resolveMpe(classIII, 5 * 2000, pack).mpe).toBeCloseTo(5, 9); // 1.0 * 5
    expect(resolveMpe(classIII, 5 * 10000, pack).mpe).toBeCloseTo(7.5, 9); // 1.5 * 5
  });

  it("class I, e = 0.001 g: m <= 50 000 -> 0.5e, (50000,200000] -> 1.0e, above 200000 -> unbounded 1.5e", () => {
    const classI: InstrumentProfile = {
      unit: "g",
      accuracyClass: "I",
      indicatingType: "self",
      rangeKind: "single",
      electronic: false,
      ranges: [{ e: 0.001, d: 0.001, max: 20000, min: 0.1 }],
    };
    expect(resolveMpe(classI, 0.001 * 50000, pack).factor).toBe(0.5);
    expect(resolveMpe(classI, 0.001 * 50000.001, pack).factor).toBe(1.0);
    expect(resolveMpe(classI, 0.001 * 200000.001, pack).factor).toBe(1.5);
    // Class I's top band is unbounded (max_m_in_e.I === null) — a very large m must
    // still resolve, not throw.
    expect(resolveMpe(classI, 0.001 * 10_000_000, pack).factor).toBe(1.5);
  });

  it("class IIII (India's 'IV'), e = 20 g: m <= 50 -> 0.5e, (50,200] -> 1.0e, (200,1000] -> 1.5e", () => {
    const classIIII: InstrumentProfile = {
      unit: "g",
      accuracyClass: "IIII",
      indicatingType: "self",
      rangeKind: "single",
      electronic: false,
      ranges: [{ e: 20, d: 20, max: 20000, min: 200 }],
    };
    expect(resolveMpe(classIIII, 20 * 50, pack).mpe).toBeCloseTo(10, 9); // 0.5*20
    expect(resolveMpe(classIIII, 20 * 200, pack).mpe).toBeCloseTo(20, 9); // 1.0*20
    expect(resolveMpe(classIIII, 20 * 1000, pack).mpe).toBeCloseTo(30, 9); // 1.5*20
  });
});

describe("resolveMpe — in-service stage (R 76-1 §3.5.2: 2x initial)", () => {
  it("doubles the initial-verification mpe", () => {
    const initial = resolveMpe(multiInterval, 1500, pack, "initial");
    const inService = resolveMpe(multiInterval, 1500, pack, "in-service");
    expect(initial.mpe).toBeCloseTo(1, 9);
    expect(inService.mpe).toBeCloseTo(2, 9);
    expect(inService.stage).toBe("in-service");
  });
});
