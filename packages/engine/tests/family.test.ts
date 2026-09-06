/**
 * Golden tests for the family / EUT solver (R 76-1 §3.10.4).
 *
 * The primary fixture is R 76-1's own Table 8 worked example (page 39), reproduced verbatim
 * from docs/standards/extracted/OIML_R76-1_2006_requirements.txt lines ~1756-1805. Expected
 * EUT set per the standard's own "Remarks on the selection" (page 40): {1.2, 2.1, 2.4}.
 */

import { describe, expect, it } from "vitest";
import { solveFamily, type Variant } from "../src/family.js";
import type { RulePack } from "../src/rulepack.js";

// Minimal pack: deliberately omits family_solver.max_capacity_ratio / max_multiplier so the
// "defaults used" info Issue is also exercised (see family.ts's documented pack-addition need).
const PACK: RulePack = {
  ruleset_id: "TEST_PACK",
  classification: [{ class: "II", e_min_g: 0.001, e_max_g: null, n_min: 100, n_max: null, min_capacity: "20e" }],
  mpe_bands_initial: [{ limit: "1.0e", max_m_in_e: { II: null } }],
  tests: [{ id: "dummy", form: "1", kernel: "K1" }],
};

const TABLE_8: Variant[] = [
  // Family 1 — accuracy class II, temperature range 10 °C / 30 °C
  { id: "1.1", family: "1", accuracyClass: "II", max: 200, e: 0.01, d: 0.001, n: 20_000, unit: "g", temperatureRange: { minC: 10, maxC: 30 } },
  { id: "1.2", family: "1", accuracyClass: "II", max: 400, e: 0.01, d: 0.001, n: 40_000, unit: "g", temperatureRange: { minC: 10, maxC: 30 } },
  { id: "1.3", family: "1", accuracyClass: "II", max: 2000, e: 0.05, d: 0.05, n: 40_000, unit: "g", temperatureRange: { minC: 10, maxC: 30 } },
  // Family 2 — accuracy class III, temperature range -10 °C / 40 °C
  { id: "2.1", family: "2", accuracyClass: "III", max: 1.5, e: 0.5, d: 0.5, n: 3_000, unit: "kg", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.2", family: "2", accuracyClass: "III", max: 3, e: 1, d: 1, n: 3_000, unit: "kg", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.3", family: "2", accuracyClass: "III", max: 5, e: 2, d: 2, n: 2_500, unit: "kg", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.4", family: "2", accuracyClass: "III", max: 15, e: 5, d: 5, n: 3_000, unit: "kg", temperatureRange: { minC: -10, maxC: 40 } },
  { id: "2.5", family: "2", accuracyClass: "III", max: 60, e: 20, d: 20, n: 3_000, unit: "kg", temperatureRange: { minC: -10, maxC: 40 } },
];

function eutIdsOf(result: ReturnType<typeof solveFamily>): string[] {
  return result.selections
    .filter((s) => s.eut)
    .map((s) => s.variant.id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

describe("solveFamily — R 76-1 Table 8 golden test", () => {
  const result = solveFamily(TABLE_8, PACK);

  it("selects exactly {1.2, 2.1, 2.4} as EUTs", () => {
    expect(eutIdsOf(result)).toEqual(["1.2", "2.1", "2.4"]);
  });

  it("returns one selection per input variant, none lost or duplicated", () => {
    expect(result.selections).toHaveLength(TABLE_8.length);
    const ids = result.selections.map((s) => s.variant.id).sort();
    expect(ids).toEqual([...TABLE_8.map((v) => v.id)].sort());
  });

  it("excuses 1.1 and cites §3.10.4.3", () => {
    const row = result.selections.find((s) => s.variant.id === "1.1")!;
    expect(row.eut).toBe(false);
    expect(row.clause).toMatch(/§3\.10\.4\.3/);
    expect(row.justification).toMatch(/1\.2/); // justified relative to the EUT 1.2
  });

  it("excuses 1.3 at the exact 5x boundary (Max == 5 x Max_test)", () => {
    const row = result.selections.find((s) => s.variant.id === "1.3")!;
    expect(row.eut).toBe(false);
    // 5 * 400g * (40000/40000) = 2000g = 1.3's Max exactly — boundary must pass, not fail.
    expect(row.justification).toMatch(/2000\s*g|2\s*kg/i);
  });

  it("excuses 2.2 and 2.3 (between tested capacities, or via the n/e/Max bullet)", () => {
    for (const id of ["2.2", "2.3"]) {
      const row = result.selections.find((s) => s.variant.id === id)!;
      expect(row.eut).toBe(false);
    }
  });

  it("promotes 2.4 to EUT because it is not excusable from 2.1 alone (ratio 2.5/2.1 > 10)", () => {
    const row = result.selections.find((s) => s.variant.id === "2.4")!;
    expect(row.eut).toBe(true);
    expect(row.justification).toMatch(/not excused/i);
  });

  it("excuses 2.5 relative to the (promoted) EUT 2.4", () => {
    const row = result.selections.find((s) => s.variant.id === "2.5")!;
    expect(row.eut).toBe(false);
    expect(row.justification).toMatch(/2\.4/);
  });

  it("produces a Table-9-style summary per family", () => {
    expect(result.summary).toHaveLength(2);
    const fam1 = result.summary.find((s) => s.family === "1")!;
    const fam2 = result.summary.find((s) => s.family === "2")!;
    expect(fam1.accuracyClass).toBe("II");
    expect(fam1.nMax).toBe(40_000);
    expect(fam1.eutIds).toEqual(["1.2"]);
    expect(fam2.accuracyClass).toBe("III");
    expect(fam2.nMax).toBe(3_000);
    expect(fam2.eutIds).toEqual(["2.1", "2.4"]);
  });

  it("emits the 'shall also cover' coverage clause naming both families and their EUTs", () => {
    expect(result.coverageClause).toMatch(/shall also cover/i);
    expect(result.coverageClause).toMatch(/family "1"/);
    expect(result.coverageClause).toMatch(/family "2"/);
    expect(result.coverageClause).toMatch(/1\.2/);
    expect(result.coverageClause).toMatch(/2\.1, 2\.4|2\.1,2\.4/);
  });

  it("flags that the pack lacks family_solver numeric constants and used the standard's defaults", () => {
    expect(result.issues.some((i) => i.code === "I_FAMILY_SOLVER_DEFAULTS_USED")).toBe(true);
  });
});

describe("solveFamily — single-variant family", () => {
  it("selects the sole variant as EUT without needing an exclusion pass", () => {
    const variants: Variant[] = [{ id: "A", family: "solo", accuracyClass: "III", max: 10, e: 1, d: 1, n: 10, unit: "kg" }];
    const result = solveFamily(variants, PACK);
    expect(eutIdsOf(result)).toEqual(["A"]);
    expect(result.selections[0]!.justification).toMatch(/highest n|smallest e/i);
  });
});

describe("solveFamily — a variant that is NOT excused must be promoted to EUT", () => {
  it("adds an unbridgeable outlier as its own EUT", () => {
    // B is the mandatory EUT (highest n, smallest e). C is a modest variant, comfortably
    // excused relative to B. D is a huge-capacity outlier with a much coarser e and far too
    // few n to be bridged to B by either §3.10.4.3 bullet — it must become a second EUT.
    const variants: Variant[] = [
      { id: "B", family: "F", accuracyClass: "III", max: 5, e: 1, d: 1, n: 5000, unit: "kg" },
      { id: "C", family: "F", accuracyClass: "III", max: 10, e: 2, d: 2, n: 5000, unit: "kg" },
      { id: "D", family: "F", accuracyClass: "III", max: 5000, e: 50, d: 50, n: 100, unit: "kg" },
    ];
    const result = solveFamily(variants, PACK);
    const ids = eutIdsOf(result);
    expect(ids).toContain("B");
    expect(ids).toContain("D");
    expect(ids).not.toContain("C");
    const rowD = result.selections.find((s) => s.variant.id === "D")!;
    expect(rowD.clause).toMatch(/§3\.10\.4\.3/);
    expect(rowD.justification).toMatch(/not excused/i);
  });
});

describe("solveFamily — heterogeneous family raises an informational issue", () => {
  it("warns when a family mixes accuracy classes", () => {
    const variants: Variant[] = [
      { id: "X1", family: "mixed", accuracyClass: "II", max: 10, e: 1, d: 1, n: 10, unit: "kg" },
      { id: "X2", family: "mixed", accuracyClass: "III", max: 20, e: 2, d: 2, n: 10, unit: "kg" },
    ];
    const result = solveFamily(variants, PACK);
    expect(result.issues.some((i) => i.code === "W_FAMILY_HETEROGENEOUS_CLASS")).toBe(true);
  });
});

describe("solveFamily — explicit options override the standard defaults", () => {
  it("uses a caller-supplied max_capacity_ratio / max_multiplier over the built-in default", () => {
    // E1 is the sole mandatory EUT (highest n and smallest e at once). E2's exclusion under
    // bullet 2 hinges entirely on the multiplier: bound = multiplier x Max_test x (n_test/n)
    // = multiplier x 10 x 10 = multiplier x 100. E2.max = 5000 clears a multiplier-100 bound
    // (10 000) but not a multiplier-2 bound (200) — the bracket bullet never engages here
    // (only one EUT exists), so this isolates the multiplier's effect.
    const variants: Variant[] = [
      { id: "E1", family: "F2", accuracyClass: "III", max: 10, e: 1, d: 1, n: 1000, unit: "kg" },
      { id: "E2", family: "F2", accuracyClass: "III", max: 5000, e: 50, d: 50, n: 100, unit: "kg" },
    ];
    const lenient = solveFamily(variants, PACK, { maxCapacityRatio: 100, maxMultiplier: 100 });
    const strict = solveFamily(variants, PACK, { maxCapacityRatio: 2, maxMultiplier: 2 });
    expect(eutIdsOf(lenient)).toEqual(["E1"]);
    expect(eutIdsOf(strict)).toEqual(["E1", "E2"]);
  });
});
