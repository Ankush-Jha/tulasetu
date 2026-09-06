/**
 * Golden tests for kernel K1 (error vs mpe).
 *
 * Primary source: R 76-1:2006 §A.4.4.3's own worked example
 * (docs/standards/extracted/OIML_R76-1_2006_requirements.txt, around line 4086):
 *
 *   "An instrument with a verification scale interval, e, of 5 g is loaded with
 *   1 kg and thereby indicates 1 000 g. After adding successive weights of 0.5 g,
 *   the indication changes from 1 000 g to 1 005 g at an additional load of 1.5 g."
 *     P = (1 000 + 2.5 - 1.5) g = 1 001 g
 *     E = (1 001 - 1 000) g = + 1 g
 *   "If the changeover point at zero as calculated above was E0 = +0.5 g, the
 *   corrected error is: Ec = +1 - (+0.5) = +0.5 g"
 *
 * NOTE on docs/standards/README.md: its one-line summary of this example ("1 kg
 * load, e = 5 g -> E = +1 g, Ec = +0.5 g") matches the extracted standard text
 * exactly — no discrepancy found. This is the *same* example the R 76-2 report
 * format's explanatory notes reference (the formula chain there is identical, just
 * without a worked number); R 76-1 §A.4.4.3 is where the numbers actually live.
 */
import { describe, expect, it } from "vitest";
import { k1ErrorVsMpe } from "../../src/kernels/k1.js";
import type { RulePack } from "../../src/rulepack.js";
import type { InstrumentProfile } from "../../src/types.js";

// Same literal-pack rationale as tests/mpe.test.ts: no resolveJsonModule / @types/node
// wired up yet in this repo's tsconfig, so we transcribe the pack instead of reading
// packages/rulepacks/OIML_R76_2006.json from disk. Flagged in the handoff report.
const pack: RulePack = {
  ruleset_id: "OIML_R76_2006",
  class_aliases: { IIII: ["IV"] },
  classification: [
    { class: "III", e_min_g: 0.1, e_max_g: 2, n_min: 100, n_max: 10000, min_capacity: "20e" },
  ],
  mpe_bands_initial: [
    { limit: "0.5e", max_m_in_e: { I: 50000, II: 5000, III: 500, IIII: 50 } },
    { limit: "1.0e", max_m_in_e: { I: 200000, II: 20000, III: 2000, IIII: 200 } },
    { limit: "1.5e", max_m_in_e: { I: null, II: 100000, III: 10000, IIII: 1000 } },
  ],
  mpe_in_service_factor: 2,
  rounding_elimination_when: "d > 0.2e",
  tests: [{ id: "weighing_performance", form: "1", kernel: "K1" }],
};

describe("k1ErrorVsMpe — R 76-1 §A.4.4.3 worked example", () => {
  // Single-range instrument, e = d = 5 g (a plain digital scale: e = d per Table 2),
  // large enough Max that 1 kg sits well inside the 0.5e band (m = 1000/5 = 200 <= 500).
  const profile: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    ranges: [{ e: 5, d: 5, max: 60000, min: 100 }],
  };

  it("reproduces P = 1001 g, E = +1 g, Ec = +0.5 g with an explicit E0", () => {
    const { rows, verdict } = k1ErrorVsMpe(
      {
        profile,
        observations: [{ load: 1000, indication: 1000, additionalLoad: 1.5, label: "1 kg" }],
        zeroError: 0.5,
      },
      pack,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.roundingEliminated).toBe(true); // d = 5g > 0.2 * 5g = 1g
    expect(row.priorToRounding).toBeCloseTo(1001, 9);
    expect(row.error).toBeCloseTo(1, 9);
    expect(row.correctedError).toBeCloseTo(0.5, 9);
    expect(row.mpe.mpe).toBeCloseTo(2.5, 9); // 0.5e band, e=5g -> 0.5*5
    expect(row.verdict).toBe("PASSED"); // |0.5| <= 2.5
    expect(verdict).toBe("PASSED");
  });

  it("derives E0 automatically from a load=0 row in the same batch, reproducing the same E/Ec", () => {
    // The zero row itself: I=0, dL=2 -> P = 0 + 2.5 - 2 = 0.5 -> E0 = 0.5, matching
    // the standard's own "E0 = +0.5 g" without it being passed in explicitly.
    const { rows } = k1ErrorVsMpe(
      {
        profile,
        observations: [
          { load: 0, indication: 0, additionalLoad: 2, label: "zero" },
          { load: 1000, indication: 1000, additionalLoad: 1.5, label: "1 kg" },
        ],
      },
      pack,
    );
    expect(rows).toHaveLength(2);
    const zeroRow = rows[0]!;
    const loadRow = rows[1]!;
    expect(zeroRow.error).toBeCloseTo(0.5, 9);
    expect(zeroRow.correctedError).toBeCloseTo(0, 9); // Ec of the E0 row itself is 0 by definition
    expect(loadRow.error).toBeCloseTo(1, 9);
    expect(loadRow.correctedError).toBeCloseTo(0.5, 9);
  });
});

describe("k1ErrorVsMpe — rounding elimination gate (R 76-1 §3.5.3.2: only when d > 0.2e)", () => {
  it("skips the 1/2e / dL correction when d <= 0.2e: E = I - L, additionalLoad ignored", () => {
    const profile: InstrumentProfile = {
      unit: "g",
      accuracyClass: "III",
      indicatingType: "self",
      rangeKind: "single",
      electronic: true,
      ranges: [{ e: 5, d: 0.5, max: 60000, min: 100 }], // d = 0.5g <= 0.2*5g = 1g
    };
    const { rows } = k1ErrorVsMpe(
      {
        profile,
        // additionalLoad is supplied but must be ignored: rounding is not eliminated.
        observations: [{ load: 999.5, indication: 1000, additionalLoad: 99 }],
        zeroError: 0,
      },
      pack,
    );
    const row = rows[0]!;
    expect(row.roundingEliminated).toBe(false);
    expect(row.priorToRounding).toBe(1000); // == indication, no 1/2e or dL applied
    expect(row.error).toBeCloseTo(0.5, 9); // I - L = 1000 - 999.5
    expect(row.correctedError).toBeCloseTo(0.5, 9);
  });

  it("treats d == 0.2e exactly as NOT eliminated (the rule is strictly '>')", () => {
    const profile: InstrumentProfile = {
      unit: "g",
      accuracyClass: "III",
      indicatingType: "self",
      rangeKind: "single",
      electronic: true,
      ranges: [{ e: 5, d: 1, max: 60000, min: 100 }], // d = 1g == 0.2 * 5g exactly
    };
    const { rows } = k1ErrorVsMpe(
      { profile, observations: [{ load: 1000, indication: 1000, additionalLoad: 1.5 }], zeroError: 0 },
      pack,
    );
    expect(rows[0]!.roundingEliminated).toBe(false);
    expect(rows[0]!.error).toBeCloseTo(0, 9); // I - L = 0, dL ignored
  });
});

describe("k1ErrorVsMpe — multi-interval: mpe jumps mid-range (CLAUDE.md §5)", () => {
  // R 76-1 §3.3's own instrument: Max = 2/5/15 kg, e = 1/2/10 g, class III.
  const profile: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "multi-interval",
    electronic: true,
    ranges: [
      { e: 1, d: 1, max: 2000, min: 20 },
      { e: 2, d: 2, max: 5000, min: 2000 },
      { e: 10, d: 10, max: 15000, min: 5000 },
    ],
  };

  it("a row just below the 2000 g range boundary uses e1 and mpe=1g; just above uses e2 and mpe=2g", () => {
    const { rows } = k1ErrorVsMpe(
      {
        profile,
        observations: [
          { load: 1999, indication: 1999, label: "range 1" }, // range 1, e1 = 1g
          { load: 2001, indication: 2001, label: "range 2" }, // range 2, e2 = 2g
        ],
        zeroError: 0,
      },
      pack,
    );
    const [rowA, rowB] = rows as [typeof rows[0], typeof rows[0]];

    expect(rowA.mpe.rangeIndex).toBe(1);
    expect(rowA.mpe.e).toBe(1);
    expect(rowA.mpe.mpe).toBeCloseTo(1, 9); // m=1999 -> 1.0e band -> 1*1
    expect(rowA.priorToRounding).toBeCloseTo(1999.5, 9); // I + e1/2 - 0
    expect(rowA.error).toBeCloseTo(0.5, 9);
    expect(rowA.verdict).toBe("PASSED");

    expect(rowB.mpe.rangeIndex).toBe(2);
    expect(rowB.mpe.e).toBe(2);
    expect(rowB.mpe.mpe).toBeCloseTo(2, 9); // m=1000.5 -> 1.0e band -> 1*2
    expect(rowB.priorToRounding).toBeCloseTo(2002, 9); // I + e2/2 - 0
    expect(rowB.error).toBeCloseTo(1, 9);
    expect(rowB.verdict).toBe("PASSED");

    // The mpe limit itself doubled (1g -> 2g) purely from crossing the partial-range
    // boundary, even though both rows land in the same *named* mpe band (1.0e).
    expect(rowB.mpe.mpe).toBe(rowA.mpe.mpe * 2);
  });
});

describe("k1ErrorVsMpe — a failing row fails the form", () => {
  const profile: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    ranges: [{ e: 5, d: 5, max: 60000, min: 100 }],
  };

  it("marks the row FAILED when |Ec| > mpe, and the form verdict FAILED overall", () => {
    const { rows, verdict } = k1ErrorVsMpe(
      {
        profile,
        observations: [
          { load: 1000, indication: 1000, additionalLoad: 1.5, label: "good" }, // Ec = +0.5, mpe = 2.5 -> PASS
          { load: 1000, indication: 1003, additionalLoad: 0, label: "bad" }, // I=1003 -> way over mpe
        ],
        zeroError: 0.5,
      },
      pack,
    );
    expect(rows[0]!.verdict).toBe("PASSED");
    const bad = rows[1]!;
    // P = 1003 + 2.5 - 0 = 1005.5; E = 5.5; Ec = 5.5 - 0.5 = 5; mpe = 2.5 -> FAIL
    expect(bad.error).toBeCloseTo(5.5, 9);
    expect(bad.correctedError).toBeCloseTo(5, 9);
    expect(bad.mpe.mpe).toBeCloseTo(2.5, 9);
    expect(bad.verdict).toBe("FAILED");
    expect(verdict).toBe("FAILED");
  });
});
