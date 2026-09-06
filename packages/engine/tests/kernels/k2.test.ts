/**
 * Golden tests for K2 (discrimination), derived from:
 *  - R 76-1 §A.4.8.2, Figure 10 worked example (digital indication)
 *  - R 76-1 §3.8.2.1 (analog indication)
 *  - R 76-1 §3.8.1 (non-self-indicating instruments)
 *  - R 76-2 form 4.1.1 / 4.1.2 / 4.1.3 (report layout + check conditions)
 */
import { describe, expect, it } from "vitest";
import { k2Analog, k2Digital, k2NonSelfIndicating } from "../../src/kernels/k2.js";
import type { MpeResolution } from "../../src/types.js";

function stubMpe(value: number): (load: number) => MpeResolution {
  return (load: number) => ({
    mpe: value,
    factor: 1.0,
    e: 1,
    rangeIndex: 1,
    m: load,
    stage: "initial",
    reason: "stub for K2 tests",
  });
}

describe("k2Digital — R 76-1 §A.4.8.2 Figure 10 worked example", () => {
  it("passes the book example: d=10g, I1=190, extra load=14g (1.4d), I2=210", () => {
    const { rows, verdict } = k2Digital([
      {
        load: 5000,
        indicationBefore: 190,
        actualScaleInterval: 10,
        extraLoadApplied: 14,
        indicationAfter: 210,
      },
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.delta).toBe(20); // 210 - 190
    expect(row.requiredDelta).toBe(10); // d
    expect(row.extraLoadExpected).toBe(14); // 1.4 * 10
    expect(row.extraLoadOffProcedure).toBe(false);
    expect(row.verdict).toBe("PASSED");
    expect(verdict).toBe("PASSED");
  });

  it("fails when I2 - I1 < d (form 4.1.1: 'Check if I2 - I1 >= d')", () => {
    const { rows, verdict } = k2Digital([
      {
        load: 5000,
        indicationBefore: 190,
        actualScaleInterval: 10,
        extraLoadApplied: 14,
        indicationAfter: 195, // delta = 5 < d = 10
      },
    ]);
    expect(rows[0]!.verdict).toBe("FAILED");
    expect(verdict).toBe("FAILED");
  });

  it("passes at the exact boundary I2 - I1 == d", () => {
    const { rows } = k2Digital([
      { load: 1, indicationBefore: 100, actualScaleInterval: 10, extraLoadApplied: 14, indicationAfter: 110 },
    ]);
    expect(rows[0]!.verdict).toBe("PASSED");
  });

  it("flags an off-procedure extra load without affecting the verdict", () => {
    const { rows } = k2Digital([
      {
        load: 1,
        indicationBefore: 190,
        actualScaleInterval: 10,
        extraLoadApplied: 25, // nominal is 1.4*10=14, way off
        indicationAfter: 210,
      },
    ]);
    expect(rows[0]!.extraLoadOffProcedure).toBe(true);
    expect(rows[0]!.verdict).toBe("PASSED"); // verdict depends only on I2-I1 vs d
  });

  it("applies a rule-pack-injected extraLoadFactor instead of the 1.4 default", () => {
    const { rows } = k2Digital(
      [{ load: 1, indicationBefore: 100, actualScaleInterval: 10, extraLoadApplied: 20, indicationAfter: 110 }],
      { extraLoadFactor: 2.0 },
    );
    expect(rows[0]!.extraLoadExpected).toBe(20);
    expect(rows[0]!.extraLoadOffProcedure).toBe(false);
  });

  it("FAILED anywhere makes the form verdict FAILED", () => {
    const { verdict } = k2Digital([
      { load: 1, indicationBefore: 190, actualScaleInterval: 10, extraLoadApplied: 14, indicationAfter: 210 },
      { load: 2, indicationBefore: 190, actualScaleInterval: 10, extraLoadApplied: 14, indicationAfter: 195 },
    ]);
    expect(verdict).toBe("FAILED");
  });
});

describe("k2Analog — R 76-1 §3.8.2.1 / R 76-2 form 4.1.2", () => {
  it("passes when I2 - I1 >= 0.7 * |mpe|", () => {
    const { rows, verdict } = k2Analog(
      [{ load: 5000, indicationBefore: 100, extraLoadApplied: 5, indicationAfter: 103.6 }],
      stubMpe(5),
    );
    expect(rows[0]!.mpeAtLoad).toBe(5);
    expect(rows[0]!.requiredDelta).toBeCloseTo(3.5); // 0.7 * 5
    expect(rows[0]!.delta).toBeCloseTo(3.6);
    expect(rows[0]!.verdict).toBe("PASSED");
    expect(verdict).toBe("PASSED");
  });

  it("fails when I2 - I1 < 0.7 * |mpe|", () => {
    const { rows } = k2Analog(
      [{ load: 5000, indicationBefore: 100, extraLoadApplied: 5, indicationAfter: 103.4 }],
      stubMpe(5),
    );
    expect(rows[0]!.verdict).toBe("FAILED");
  });

  it("uses |mpe| even when the resolved mpe is negative", () => {
    const { rows } = k2Analog(
      [{ load: 1, indicationBefore: 0, extraLoadApplied: 5, indicationAfter: 3.6 }],
      stubMpe(-5),
    );
    expect(rows[0]!.mpeAtLoad).toBe(5);
    expect(rows[0]!.verdict).toBe("PASSED");
  });

  it("supports a custom displacement fraction", () => {
    const { rows } = k2Analog(
      [{ load: 1, indicationBefore: 0, extraLoadApplied: 5, indicationAfter: 4 }],
      stubMpe(5),
      { displacementFraction: 0.8 },
    );
    expect(rows[0]!.requiredDelta).toBe(4);
    expect(rows[0]!.verdict).toBe("PASSED");
  });
});

describe("k2NonSelfIndicating — R 76-1 §3.8.1 / R 76-2 form 4.1.3", () => {
  it("passes when a visible displacement is observed", () => {
    const { rows, verdict } = k2NonSelfIndicating(
      [{ load: 5000, extraLoadApplied: 2, visibleDisplacement: true }],
      stubMpe(5),
    );
    expect(rows[0]!.extraLoadExpected).toBe(2); // 0.4 * 5
    expect(rows[0]!.verdict).toBe("PASSED");
    expect(verdict).toBe("PASSED");
  });

  it("fails when no visible displacement is observed", () => {
    const { rows, verdict } = k2NonSelfIndicating(
      [{ load: 5000, extraLoadApplied: 2, visibleDisplacement: false }],
      stubMpe(5),
    );
    expect(rows[0]!.verdict).toBe("FAILED");
    expect(verdict).toBe("FAILED");
  });

  it("supports a custom extra-load fraction", () => {
    const { rows } = k2NonSelfIndicating(
      [{ load: 1, extraLoadApplied: 1, visibleDisplacement: true }],
      stubMpe(10),
      { extraLoadFraction: 0.1 },
    );
    expect(rows[0]!.extraLoadExpected).toBe(1); // 0.1 * 10
  });
});
