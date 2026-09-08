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
