/**
 * Conformance tests for the shipped rule packs.
 *
 * The kernel and resolver tests each transcribe a pack inline, which keeps them focused but
 * leaves a gap: nothing checks that the pack the product actually loads says what those tests
 * assume. A transcription can drift from the file, and the drift would be invisible — every
 * test green, the shipped product wrong.
 *
 * So this file reads the real JSON off disk and asserts, against docs/VERIFIED.md, that the
 * numbers in it are the standard's numbers.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRulePack, parseBandFactor, normalizeClass, type RulePack } from "../src/rulepack.js";
import { resolveMpe } from "../src/mpe.js";
import { resolveApplicableTests } from "../src/applicability.js";
import type { InstrumentProfile } from "../src/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(HERE, "../../rulepacks");

function loadPack(name: string): RulePack {
  return JSON.parse(readFileSync(join(PACK_DIR, name), "utf8")) as RulePack;
}

const oiml = loadPack("OIML_R76_2006.json");
const inSch7A = loadPack("IN_Sch7A_2011.json");
const draft5 = loadPack("OIML_R76_DRAFT_5PART.json");

describe("OIML_R76_2006 rule pack", () => {
  it("passes structural validation", () => {
    expect(validateRulePack(oiml)).toEqual([]);
  });

  it("reproduces R 76-1 Table 6 exactly", () => {
    // docs/VERIFIED.md §1 — transcribed verbatim from page 30 of the standard.
    const expected: Record<string, Record<string, number | null>> = {
      "0.5e": { I: 50000, II: 5000, III: 500, IIII: 50 },
      "1.0e": { I: 200000, II: 20000, III: 2000, IIII: 200 },
      "1.5e": { I: null, II: 100000, III: 10000, IIII: 1000 },
    };
    for (const band of oiml.mpe_bands_initial) {
      expect(band.max_m_in_e).toEqual(expected[band.limit]);
    }
    expect(oiml.mpe_bands_initial.map((b) => parseBandFactor(b.limit))).toEqual([0.5, 1.0, 1.5]);
  });

  it("leaves class I's 1.5e band unbounded above, as the standard does", () => {
    // The standard prints "200 000 < m" for class I with no ceiling, while classes II/III/IIII
    // have one. Encoding that as a missing key rather than an explicit null would make an
    // unbounded band indistinguishable from a forgotten one.
    const top = oiml.mpe_bands_initial.at(-1)!;
    expect(Object.hasOwn(top.max_m_in_e, "I")).toBe(true);
    expect(top.max_m_in_e.I).toBeNull();
  });

  it("records in-service mpe as twice initial (R 76-1 §3.5.2)", () => {
    expect(oiml.mpe_in_service_factor).toBe(2);
  });

  it("reproduces R 76-1 Table 4's multi-interval boundaries", () => {
    expect(oiml.multi_interval_boundary).toEqual({ I: 50000, II: 5000, III: 500, IIII: 50 });
  });

  it("carries the family-solver constants from §3.10.4.3 rather than leaving them to code", () => {
    expect(oiml.family_solver?.max_capacity_ratio).toBe(10);
    expect(oiml.family_solver?.max_multiplier).toBe(5);
  });

  it("states the rounding-elimination condition as data", () => {
    expect(oiml.rounding_elimination_when).toBe("d > 0.2e");
  });

  it("gives every test a clause reference, so the report can cite its basis", () => {
    for (const t of oiml.tests) {
      expect(t.clause, `test ${t.id} has no clause`).toBeTruthy();
      expect(t.title, `test ${t.id} has no title`).toBeTruthy();
    }
  });

  it("declares an applicability predicate for every checklist", () => {
    expect(oiml.checklist_rules).toBeDefined();
    const ids = (oiml["checklist_rules"] as { id: string }[]).map((c) => c.id);
    expect(ids).toEqual(["17.1", "17.2", "17.3", "17.4"]);
  });
});

describe("discrimination N/A reasons are instrument-specific, not one shared sentence (MA-01)", () => {
  // MA-01: the shared "discrimination" reason_group used to return one "d >= 5 mg" sentence
  // for all three of forms 4.1.1/4.1.2/4.1.3, printed on the report even where it was false —
  // e.g. on a digital self-indicating instrument, forms 4.1.2 (analog) and 4.1.3 (non-self)
  // are N/A because the instrument isn't analog / isn't non-self-indicating, not because of d.
  // Verified against docs/standards/extracted/OIML_R76-1_2006_requirements.txt §3.8
  // (§3.8.1 non-self, §3.8.2.1 analog, §3.8.2.2 digital — three different tests).
  const digitalSelfIndicating: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    ranges: [{ e: 1, d: 1, max: 15000, min: 20, n: 15000 }],
  };
  const analogSelfIndicating: InstrumentProfile = {
    ...digitalSelfIndicating,
    electronic: false,
    ranges: [{ e: 10, d: 10, max: 15000, min: 200, n: 1500 }],
  };
  const nonSelfIndicating: InstrumentProfile = {
    unit: "g",
    accuracyClass: "IIII",
    indicatingType: "non-self",
    rangeKind: "single",
    electronic: false,
    ranges: [{ e: 5, d: 5, max: 500, min: 50, n: 90 }],
  };

  it("digital self-indicating (TS-DEMO-0001-like, d=1g): 4.1.1 applies; 4.1.2/4.1.3 N/A for the real reason", () => {
    const tests = resolveApplicableTests(digitalSelfIndicating, oiml);
    const byId = (id: string) => tests.find((t) => t.testId === id)!;
    expect(byId("discrimination_digital").applicable).toBe(true);

    const analog = byId("discrimination_analog");
    expect(analog.applicable).toBe(false);
    expect(analog.reason).toMatch(/digital indication/i);
    expect(analog.reason ?? "").not.toMatch(/d\s*>=?\s*5\s*mg/i);

    const nonSelf = byId("discrimination_non_self");
    expect(nonSelf.applicable).toBe(false);
    expect(nonSelf.reason).toMatch(/non-self-indicating/i);
    expect(nonSelf.reason ?? "").not.toMatch(/d\s*>=?\s*5\s*mg/i);
  });

  it("analog self-indicating: 4.1.2 applies; 4.1.1/4.1.3 N/A for the real reason", () => {
    const tests = resolveApplicableTests(analogSelfIndicating, oiml);
    const byId = (id: string) => tests.find((t) => t.testId === id)!;
    expect(byId("discrimination_analog").applicable).toBe(true);

    const digital = byId("discrimination_digital");
    expect(digital.applicable).toBe(false);
    expect(digital.reason).toMatch(/digital self-indication/i);
    expect(digital.reason ?? "").not.toMatch(/d\s*>=?\s*5\s*mg/i);

    const nonSelf = byId("discrimination_non_self");
    expect(nonSelf.applicable).toBe(false);
    expect(nonSelf.reason).toMatch(/non-self-indicating/i);
  });

  it("non-self-indicating instrument: 4.1.3 applies; 4.1.1/4.1.2 N/A for the real reason", () => {
    const tests = resolveApplicableTests(nonSelfIndicating, oiml);
    const byId = (id: string) => tests.find((t) => t.testId === id)!;
    expect(byId("discrimination_non_self").applicable).toBe(true);

    const digital = byId("discrimination_digital");
    expect(digital.applicable).toBe(false);
    expect(digital.reason).toMatch(/digital/i);
    expect(digital.reason ?? "").not.toMatch(/d\s*>=?\s*5\s*mg/i);

    const analog = byId("discrimination_analog");
    expect(analog.applicable).toBe(false);
    expect(analog.reason).toMatch(/non-self-indicating/i);
  });

  it("still gives the digital d < 5 mg exemption its own (correct) reason", () => {
    const digitalCoarse: InstrumentProfile = { ...digitalSelfIndicating, ranges: [{ e: 0.001, d: 0.001, max: 1, min: 0.001, n: 1000 }] };
    const t = resolveApplicableTests(digitalCoarse, oiml).find((x) => x.testId === "discrimination_digital")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/d < 5 mg/i);
  });

  it("India Seventh Schedule (no d >= 5 mg exemption): discrimination is unconditionally applicable", () => {
    const t = resolveApplicableTests(nonSelfIndicating, inSch7A).find((x) => x.testId === "discrimination")!;
    expect(t.applicable).toBe(true);
  });

  it("the draft 5-part pack's single merged discrimination test keeps the d < 5 mg reason", () => {
    const digitalCoarse: InstrumentProfile = { ...digitalSelfIndicating, ranges: [{ e: 0.001, d: 0.001, max: 1, min: 0.001, n: 1000 }] };
    const t = resolveApplicableTests(digitalCoarse, draft5).find((x) => x.testId === "discrimination")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/d < 5 mg/i);
  });
});

describe("reason text keys on the shared reason_group, not a suffixed per-form id (regression)", () => {
  // A second instance of the MA-01 pattern, found while auditing every reason_group: the
  // per-variant branches inside reasonForTest's "warm_up"/.../"disturbances_road_vehicle"
  // case used to check `rule.id === "damp_heat"` etc., but the real pack's ids are suffixed
  // (damp_heat_a/_b/_c, disturbances_road_vehicle_a/_b) — so those checks never matched and
  // silently fell through to the generic "Not applicable to this instrument profile" text,
  // losing the actual legal reason. Not factually wrong like MA-01, but not useful either.
  const classI: InstrumentProfile = {
    unit: "g",
    accuracyClass: "I",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    ranges: [{ e: 0.001, d: 0.001, max: 220, min: 0.1, n: 220000 }],
  };
  const classIINarrowE: InstrumentProfile = {
    unit: "g",
    accuracyClass: "II",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    ranges: [{ e: 0.5, d: 0.5, max: 3000, min: 10, n: 6000 }],
  };
  const notVehiclePowered: InstrumentProfile = {
    unit: "kg",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    vehiclePowered: false,
    ranges: [{ e: 10, d: 10, max: 40000, min: 200, n: 4000 }],
  };

  it("damp heat (13a): class I exemption gets its own reason, not the generic fallback", () => {
    const t = resolveApplicableTests(classI, oiml).find((x) => x.testId === "damp_heat_a")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/class I/i);
    expect(t.reason ?? "").not.toMatch(/^Not applicable to this instrument profile/);
  });

  it("damp heat (13b): class II e < 1 g exemption gets its own reason", () => {
    const t = resolveApplicableTests(classIINarrowE, oiml).find((x) => x.testId === "damp_heat_b")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/e < 1 g/i);
  });

  it("span stability (14): class I exemption gets its own reason", () => {
    const t = resolveApplicableTests(classI, oiml).find((x) => x.testId === "span_stability")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/class I/i);
  });

  it("form 12.7a: not-vehicle-powered gets its own reason, not the generic fallback", () => {
    const t = resolveApplicableTests(notVehiclePowered, oiml).find((x) => x.testId === "disturbances_road_vehicle_a")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/road-vehicle/i);
    expect(t.reason ?? "").not.toMatch(/^Not applicable to this instrument profile/);
  });
});

describe("India Seventh Schedule: unloaded tilting (tilting_no_load) reason is specific", () => {
  const plainClassII: InstrumentProfile = {
    unit: "g",
    accuracyClass: "II",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    tiltable: true,
    directSalesToPublic: false,
    ranges: [{ e: 1, d: 1, max: 15000, min: 50, n: 15000 }],
  };

  it("plain class II (not direct sales) is N/A with the class II* distinction named, not the generic fallback", () => {
    const t = resolveApplicableTests(plainClassII, inSch7A).find((x) => x.testId === "tilting_no_load")!;
    expect(t.applicable).toBe(false);
    expect(t.reason).toMatch(/class II\*/i);
    expect(t.reason ?? "").not.toMatch(/^Not applicable to this instrument profile/);
  });

  it("class II* (direct sales to the public) requires it", () => {
    const classIIStar: InstrumentProfile = { ...plainClassII, directSalesToPublic: true };
    const t = resolveApplicableTests(classIIStar, inSch7A).find((x) => x.testId === "tilting_no_load")!;
    expect(t.applicable).toBe(true);
  });
});

describe("the multi-interval mpe walk, driven by the shipped pack", () => {
  // R 76-1 §3.3's worked example. The kernel tests assert this against a transcribed pack;
  // this asserts it against the file the product ships, which is the one that matters.
  const profile: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "multi-interval",
    electronic: true,
    ranges: [
      { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
      { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
      { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
    ],
  };

  it.each([
    [100, 0.5],
    [500, 0.5],
    [1500, 1],
    [2000, 1],
    [3000, 2],
    [4000, 2],
    [4500, 3],
    [5000, 3],
    [10000, 10],
    [15000, 10],
  ])("load %i g -> mpe %f g", (load, expected) => {
    expect(resolveMpe(profile, load, oiml).mpe).toBeCloseTo(expected, 9);
  });

  it("doubles every limit in service (§3.5.2)", () => {
    expect(resolveMpe(profile, 4500, oiml, "in-service").mpe).toBeCloseTo(6, 9);
  });
});

describe("endurance applicability", () => {
  // R 76-1 Annex A.6, verbatim: "Applicable only to instruments of classes II, III and IIII
  // with Max <= 100 kg." The pack encoded only the Max condition until v1.1.0, which made
  // endurance come out applicable for a class I analytical balance. Regression test.
  const base: Omit<InstrumentProfile, "accuracyClass" | "ranges"> = {
    unit: "g",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
  };

  it("does not apply to a class I balance, however small", () => {
    const classI: InstrumentProfile = {
      ...base,
      accuracyClass: "I",
      ranges: [{ e: 0.001, d: 0.001, max: 220, min: 0.1, n: 220000 }],
    };
    const endurance = resolveApplicableTests(classI, oiml).find((t) => t.testId === "endurance_a");
    expect(endurance?.applicable).toBe(false);
    expect(endurance?.reason ?? "").toMatch(/class/i);
  });

  it("applies to a class III instrument at or under 100 kg", () => {
    const classIII: InstrumentProfile = {
      ...base,
      accuracyClass: "III",
      ranges: [{ e: 10, d: 10, max: 30000, min: 200, n: 3000 }],
    };
    const endurance = resolveApplicableTests(classIII, oiml).find((t) => t.testId === "endurance_a");
    expect(endurance?.applicable).toBe(true);
  });

  it("does not apply above 100 kg", () => {
    const weighbridge: InstrumentProfile = {
      ...base,
      accuracyClass: "III",
      ranges: [{ e: 10000, d: 10000, max: 40_000_000, min: 400000, n: 4000 }],
    };
    const endurance = resolveApplicableTests(weighbridge, oiml).find((t) => t.testId === "endurance_a");
    expect(endurance?.applicable).toBe(false);
  });

  it("is always scheduled last", () => {
    const classIII: InstrumentProfile = {
      ...base,
      accuracyClass: "III",
      ranges: [{ e: 10, d: 10, max: 30000, min: 200, n: 3000 }],
    };
    const tests = resolveApplicableTests(classIII, oiml);
    // Both endurance forms carry order: "last" — Annex A.6 runs the whole endurance test at
    // the end, and its initial (15a) and final (15c) readings are two forms of one procedure.
    // They keep their relative order (initial before final) but occupy the final positions:
    // nothing else may be scheduled after the instrument has been run to destruction.
    const ordered = [...tests].sort((a, b) => a.order - b.order);
    expect(ordered.slice(-2).map((t) => t.testId)).toEqual(["endurance_a", "endurance_c"]);
  });
});

describe("class-symbol normalization against the shipped aliases", () => {
  it("resolves India's IV to the canonical IIII", () => {
    expect(normalizeClass("IV", oiml)).toBe("IIII");
    expect(normalizeClass("Class IV", oiml)).toBe("IIII");
  });

  it("still resolves the OIML spelling", () => {
    expect(normalizeClass("IIII", oiml)).toBe("IIII");
  });

  it("reads the prose forms that appear on real certificates", () => {
    // docs/certificates/certificates-analysis.md: the register writes the same class as
    // "Medium Accuracy (III)", "High Accuracy Class" and "Class III" across certificates.
    expect(normalizeClass("Medium Accuracy (III)", oiml)).toBe("III");
    expect(normalizeClass("Class III", oiml)).toBe("III");
    expect(normalizeClass("Class II", oiml)).toBe("II");
  });

  it("does not mistake IV for I", () => {
    expect(normalizeClass("IV", oiml)).not.toBe("I");
  });
});
