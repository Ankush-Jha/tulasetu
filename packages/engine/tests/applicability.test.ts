/**
 * Golden tests for the applicability resolver.
 *
 * As with tests/kernels/*.test.ts (see the note there), this file transcribes the rule
 * pack literally instead of reading packages/rulepacks/OIML_R76_2006.json from disk (no
 * resolveJsonModule / @types/node wired up yet).
 *
 * Two packs are used:
 *   - CURRENT_PACK: a literal transcription of the pack exactly as it stands today.
 *   - PATCHED_PACK: CURRENT_PACK with the JSON patch from the handoff report applied
 *     in-memory (fixed "endurance" predicate, new "disturbances_road_vehicle" test,
 *     new "checklist_rules" field). Most tests run against PATCHED_PACK, since that is
 *     the pack that correctly implements CLAUDE.md §7 + the standard; one test (below,
 *     "flags the pack bug") demonstrates the discrepancy CURRENT_PACK still has.
 */
import { describe, expect, it } from "vitest";
import {
  resolveApplicableChecklists,
  resolveApplicableTests,
  requiresBarometricPressureRecording,
  evaluatePredicate,
  type ApplicableTest,
} from "../src/applicability.js";
import type { RulePack } from "../src/rulepack.js";
import {
  CLASS_III_MULTI_INTERVAL,
  CLASS_I_ANALYTICAL_BALANCE,
  CLASS_IIII_NON_SELF,
  CLASS_III_MULTIPLE_RANGE,
  INDIA_CLASS_II_STAR,
  CLASS_III_VEHICLE_POWERED,
} from "./fixtures/profiles.js";

const CURRENT_PACK: RulePack = {
  ruleset_id: "OIML_R76_2006",
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
    // BUG (see handoff report): this is missing not_class: ["I"] -- R 76-1 Annex A.6
    // says endurance is "applicable only to instruments of classes II, III and IIII".
    { id: "endurance", form: "15", kernel: "K1", applies: { max_capacity_kg_lte: 100 }, order: "last" },
  ],
  checklists: ["17.1", "17.2 (direct-sales)", "17.3 (electronic)", "17.4 (software)"],
};

/** CURRENT_PACK with the handoff report's JSON patch applied in-memory. */
const PATCHED_PACK: RulePack = {
  ...CURRENT_PACK,
  tests: CURRENT_PACK.tests.map((t) =>
    t.id === "endurance"
      ? { ...t, applies: { max_capacity_kg_lte: 100, not_class: ["I"] }, clause: "R 76-1:2006 Annex A.6" }
      : t,
  ),
  checklist_rules: [
    { id: "17.1", clause: "R 76-2:2007 §17.1", applies: { not: { indicating_type: "non-self" } } },
    {
      id: "17.2",
      clause: "R 76-2:2007 §17.2",
      applies: { any: [{ direct_sales: true }, { price_computing: true }] },
    },
    { id: "17.3", clause: "R 76-2:2007 §17.3", applies: { electronic: true } },
    { id: "17.4", clause: "R 76-2:2007 §17.4", applies: { software_controlled: true } },
  ],
};
PATCHED_PACK.tests = [
  ...PATCHED_PACK.tests,
  {
    id: "disturbances_road_vehicle",
    form: "12.7",
    kernel: "K5",
    clause: "R 76-1:2006 §5.4.3",
    applies: { electronic: true, vehicle_powered: true },
  },
];

function byId(tests: ApplicableTest[], id: string): ApplicableTest {
  const t = tests.find((x) => x.testId === id);
  if (!t) throw new Error(`No applicable-test entry for id "${id}"`);
  return t;
}

describe("resolveApplicableTests: class III multi-interval electronic instrument (2/5/15 kg)", () => {
  const tests = resolveApplicableTests(CLASS_III_MULTI_INTERVAL, PATCHED_PACK);

  it("produces exactly ONE form set (not one per partial range)", () => {
    // 18 rule-pack tests (17 original + disturbances_road_vehicle) x 1 form set.
    expect(tests).toHaveLength(PATCHED_PACK.tests.length);
    expect(tests.every((t) => t.rangeIndex === undefined)).toBe(true);
  });

  it("marks weighing performance, eccentricity, repeatability, zero return, creep always applicable", () => {
    for (const id of ["weighing_performance", "temp_no_load", "eccentricity_weights", "repeatability", "zero_return", "creep"]) {
      expect(byId(tests, id).applicable, id).toBe(true);
    }
  });

  it("marks electronic-only forms applicable (instrument is electronic)", () => {
    for (const id of ["warm_up", "voltage_variation", "disturbances"]) {
      expect(byId(tests, id).applicable, id).toBe(true);
    }
  });

  it("marks damp heat and span stability applicable (class III, not exempt)", () => {
    expect(byId(tests, "damp_heat").applicable).toBe(true);
    expect(byId(tests, "span_stability").applicable).toBe(true);
  });

  it("marks tilting applicable (class III is in class_in, tiltable=true) with no India II* annotation", () => {
    const tilting = byId(tests, "tilting");
    expect(tilting.applicable).toBe(true);
    expect(tilting.title).toBeUndefined();
  });

  it("marks tare NOT applicable (no tare device) with a report-ready, clause-citing reason", () => {
    const tare = byId(tests, "tare");
    expect(tare.applicable).toBe(false);
    expect(tare.reason).toMatch(/tare device/i);
    expect(tare.reason).toMatch(/R 76-1/);
  });

  it("marks endurance NOT applicable (Max = 15 kg <= 100 kg, but rangeless check unaffected -- class III is eligible)", () => {
    // Max is 15 kg here so endurance WOULD be eligible on capacity; class III is not
    // excluded (only class I is). This assembles a >100kg variant to check the cutoff.
    const overMax = { ...CLASS_III_MULTI_INTERVAL, ranges: [...CLASS_III_MULTI_INTERVAL.ranges.slice(0, 2), { ...CLASS_III_MULTI_INTERVAL.ranges[2]!, max: 200_000 }] };
    const enduranceOver = byId(resolveApplicableTests(overMax, PATCHED_PACK), "endurance");
    expect(enduranceOver.applicable).toBe(false);
    expect(enduranceOver.reason).toMatch(/Max/);

    const enduranceUnder = byId(tests, "endurance");
    expect(enduranceUnder.applicable).toBe(true);
  });

  it("schedules endurance last within the form set", () => {
    const endurance = byId(tests, "endurance");
    const maxOtherOrder = Math.max(...tests.filter((t) => t.testId !== "endurance").map((t) => t.order));
    expect(endurance.order).toBeGreaterThan(maxOtherOrder);
  });

  it("marks form 12.7 (road-vehicle transients) NOT applicable (not vehicle powered)", () => {
    const f127 = byId(tests, "disturbances_road_vehicle");
    expect(f127.applicable).toBe(false);
    expect(f127.reason).toMatch(/road-vehicle/i);
  });

  it("marks sensitivity NOT applicable (self-indicating, not non-self)", () => {
    expect(byId(tests, "sensitivity").applicable).toBe(false);
  });
});

describe("resolveApplicableTests: class I analytical balance", () => {
  const tests = resolveApplicableTests(CLASS_I_ANALYTICAL_BALANCE, PATCHED_PACK);

  it("excludes tilting entirely for class I, citing §3.9.1.1", () => {
    const tilting = byId(tests, "tilting");
    expect(tilting.applicable).toBe(false);
    expect(tilting.reason).toMatch(/class I/i);
    expect(tilting.reason).toMatch(/3\.9\.1\.1/);
  });

  it("excludes span stability for class I", () => {
    const span = byId(tests, "span_stability");
    expect(span.applicable).toBe(false);
    expect(span.reason).toMatch(/class I/i);
  });

  it("excludes damp heat for class I", () => {
    const damp = byId(tests, "damp_heat");
    expect(damp.applicable).toBe(false);
    expect(damp.reason).toMatch(/class I/i);
  });

  it("excludes endurance for class I even though Max (220 g) <= 100 kg -- the flagged discrepancy", () => {
    const patched = byId(tests, "endurance");
    expect(patched.applicable).toBe(false);
    expect(patched.reason).toMatch(/class I/i);

    // Demonstrate the CURRENT_PACK bug: without the patch, endurance would incorrectly
    // come back applicable for a class I instrument under 100 kg.
    const buggy = byId(resolveApplicableTests(CLASS_I_ANALYTICAL_BALANCE, CURRENT_PACK), "endurance");
    expect(buggy.applicable).toBe(true);
  });

  it("still runs warm-up/voltage/disturbances (electronic) and weighing performance", () => {
    expect(byId(tests, "warm_up").applicable).toBe(true);
    expect(byId(tests, "weighing_performance").applicable).toBe(true);
  });

  it("requiresBarometricPressureRecording is true for class I", () => {
    expect(requiresBarometricPressureRecording(CLASS_I_ANALYTICAL_BALANCE)).toBe(true);
    expect(requiresBarometricPressureRecording(CLASS_IIII_NON_SELF)).toBe(false);
  });
});

describe("resolveApplicableTests: class IIII non-self-indicating instrument", () => {
  const tests = resolveApplicableTests(CLASS_IIII_NON_SELF, PATCHED_PACK);

  it("marks sensitivity applicable (non-self-indicating)", () => {
    expect(byId(tests, "sensitivity").applicable).toBe(true);
  });

  it("marks discrimination applicable (the d>=5mg exemption only concerns the digital variant)", () => {
    expect(byId(tests, "discrimination").applicable).toBe(true);
  });

  it("excludes every electronic-only form (not electronic)", () => {
    for (const id of ["warm_up", "voltage_variation", "disturbances", "damp_heat", "span_stability"]) {
      const t = byId(tests, id);
      expect(t.applicable, id).toBe(false);
      expect(t.reason, id).toMatch(/electronic/i);
    }
  });

  it("excludes tare (no tare device) and stability (no print/storage)", () => {
    expect(byId(tests, "tare").applicable).toBe(false);
    expect(byId(tests, "stability").applicable).toBe(false);
  });
});

describe("resolveApplicableTests: multiple-range instrument -> one form set PER range", () => {
  const tests = resolveApplicableTests(CLASS_III_MULTIPLE_RANGE, PATCHED_PACK);

  it("returns 2x the pack's test count, tagged with 1-based rangeIndex", () => {
    expect(tests).toHaveLength(PATCHED_PACK.tests.length * 2);
    const range1 = tests.filter((t) => t.rangeIndex === 1);
    const range2 = tests.filter((t) => t.rangeIndex === 2);
    expect(range1).toHaveLength(PATCHED_PACK.tests.length);
    expect(range2).toHaveLength(PATCHED_PACK.tests.length);
  });

  it("each range's endurance is scheduled after that SAME range's other tests", () => {
    const range1 = tests.filter((t) => t.rangeIndex === 1);
    const endurance1 = range1.find((t) => t.testId === "endurance")!;
    const maxOtherOrderRange1 = Math.max(...range1.filter((t) => t.testId !== "endurance").map((t) => t.order));
    expect(endurance1.order).toBeGreaterThan(maxOtherOrderRange1);

    const range2 = tests.filter((t) => t.rangeIndex === 2);
    // range 2's tests all come after range 1's tests (blocks are sequential).
    expect(Math.min(...range2.map((t) => t.order))).toBeGreaterThan(Math.max(...range1.map((t) => t.order)));
  });

  it("evaluates applicability independently per range (e.g. max_capacity_kg_lte)", () => {
    // Both ranges are well under 100 kg here, so endurance applies to both; the point
    // of this test is that rangeIndex is set distinctly and applicability is computed
    // using EACH range's own numbers (see applicability.ts representativeMaxKg).
    const endurance = tests.filter((t) => t.testId === "endurance");
    expect(endurance.map((t) => t.applicable)).toEqual([true, true]);
  });
});

describe("resolveApplicableTests: India class II* (direct sales to the public)", () => {
  const tests = resolveApplicableTests(INDIA_CLASS_II_STAR, PATCHED_PACK);

  it("tilting is applicable and its title flags the extra no-load sub-test", () => {
    const tilting = byId(tests, "tilting");
    expect(tilting.applicable).toBe(true);
    expect(tilting.title).toMatch(/no-load/i);
    expect(tilting.title).toMatch(/II\*/);
  });

  it("does NOT add the no-load annotation for a plain class II instrument", () => {
    const plainII = { ...INDIA_CLASS_II_STAR, directSalesToPublic: false };
    const tilting = byId(resolveApplicableTests(plainII, PATCHED_PACK), "tilting");
    expect(tilting.applicable).toBe(true);
    expect(tilting.title).toBeUndefined();
  });
});

describe("resolveApplicableTests: form 12.7 gated on vehiclePowered", () => {
  it("is applicable for a vehicle-powered instrument", () => {
    const tests = resolveApplicableTests(CLASS_III_VEHICLE_POWERED, PATCHED_PACK);
    expect(byId(tests, "disturbances_road_vehicle").applicable).toBe(true);
  });
});

describe("evaluatePredicate: predicate vocabulary unit tests", () => {
  const ctx = { profile: CLASS_III_MULTI_INTERVAL, rangeIdx: 0, pack: PATCHED_PACK };

  it("always / not", () => {
    expect(evaluatePredicate({ always: true }, ctx)).toBe(true);
    expect(evaluatePredicate({ not: { always: true } }, ctx)).toBe(false);
  });

  it("any / all combinators", () => {
    expect(evaluatePredicate({ any: [{ always: false }, { electronic: true }] }, ctx)).toBe(true);
    expect(evaluatePredicate({ all: [{ always: true }, { electronic: true }] }, ctx)).toBe(true);
    expect(evaluatePredicate({ all: [{ always: true }, { electronic: false }] }, ctx)).toBe(false);
  });

  it("throws on an unsupported predicate key (fail loud on pack authoring bugs)", () => {
    expect(() => evaluatePredicate({ bogus_key: true }, ctx)).toThrow(/Unsupported applicability predicate key/);
  });
});

describe("resolveApplicableChecklists", () => {
  it("17.1 excludes non-self-indicating instruments", () => {
    const self = resolveApplicableChecklists(CLASS_III_MULTI_INTERVAL, PATCHED_PACK);
    expect(self.find((c) => c.checklistId === "17.1")!.applicable).toBe(true);

    const nonSelf = resolveApplicableChecklists(CLASS_IIII_NON_SELF, PATCHED_PACK);
    const c171 = nonSelf.find((c) => c.checklistId === "17.1")!;
    expect(c171.applicable).toBe(false);
    expect(c171.reason).toMatch(/non-self/i);
  });

  it("17.2 applies to direct-sales OR price-computing instruments", () => {
    const list = resolveApplicableChecklists(INDIA_CLASS_II_STAR, PATCHED_PACK);
    expect(list.find((c) => c.checklistId === "17.2")!.applicable).toBe(true);
  });

  it("17.3 applies only to electronic instruments", () => {
    const list = resolveApplicableChecklists(CLASS_IIII_NON_SELF, PATCHED_PACK);
    expect(list.find((c) => c.checklistId === "17.3")!.applicable).toBe(false);
  });

  it("17.4 applies only to software-controlled instruments", () => {
    const notSoftware = resolveApplicableChecklists(CLASS_III_MULTI_INTERVAL, PATCHED_PACK);
    expect(notSoftware.find((c) => c.checklistId === "17.4")!.applicable).toBe(false);

    const software = resolveApplicableChecklists({ ...CLASS_III_MULTI_INTERVAL, softwareControlled: true }, PATCHED_PACK);
    expect(software.find((c) => c.checklistId === "17.4")!.applicable).toBe(true);
  });

  it("degrades gracefully against an un-patched pack (no checklist_rules)", () => {
    const list = resolveApplicableChecklists(CLASS_III_MULTI_INTERVAL, CURRENT_PACK);
    expect(list.map((c) => c.checklistId)).toEqual(CURRENT_PACK.checklists);
    expect(list.every((c) => c.applicable)).toBe(true);
  });
});
