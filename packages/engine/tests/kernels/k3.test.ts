/**
 * Golden tests for K3 (sensitivity of a non-self-indicating instrument), derived from
 * R 76-1 §6.1 "Minimum sensitivity" and R 76-2 form 4.2.
 *
 * Threshold, verbatim (§6.1):
 *   1 mm for an instrument of class I or II;
 *   2 mm for an instrument of class III or IIII with Max <= 30 kg;
 *   5 mm for an instrument of class III or IIII with Max > 30 kg.
 */
import { describe, expect, it } from "vitest";
import { k3Sensitivity } from "../../src/kernels/k3.js";

describe("k3Sensitivity — R 76-1 §6.1 / R 76-2 form 4.2", () => {
  it("requires 1 mm for class I", () => {
    const { requiredMm, rows } = k3Sensitivity("I", 500, [{ load: 0, permanentDisplacementMm: 1 }]);
    expect(requiredMm).toBe(1);
    expect(rows[0]!.verdict).toBe("PASSED");
  });

  it("requires 1 mm for class II regardless of Max", () => {
    const { requiredMm } = k3Sensitivity("II", 100000, [{ load: 0, permanentDisplacementMm: 1 }]);
    expect(requiredMm).toBe(1);
  });

  it("requires 2 mm for class III with Max <= 30 kg", () => {
    const { requiredMm, rows } = k3Sensitivity("III", 30, [{ load: 0, permanentDisplacementMm: 2 }]);
    expect(requiredMm).toBe(2);
    expect(rows[0]!.verdict).toBe("PASSED");
  });

  it("requires 2 mm for class IIII with Max well below 30 kg", () => {
    const { requiredMm } = k3Sensitivity("IIII", 5, [{ load: 0, permanentDisplacementMm: 2 }]);
    expect(requiredMm).toBe(2);
  });

  it("requires 5 mm for class III with Max > 30 kg", () => {
    const { requiredMm, rows } = k3Sensitivity("III", 30.001, [{ load: 0, permanentDisplacementMm: 5 }]);
    expect(requiredMm).toBe(5);
    expect(rows[0]!.verdict).toBe("PASSED");
  });

  it("requires 5 mm for class IIII with Max > 30 kg", () => {
    const { requiredMm } = k3Sensitivity("IIII", 1000, [{ load: 0, permanentDisplacementMm: 5 }]);
    expect(requiredMm).toBe(5);
  });

  it("fails when the displacement is below the required threshold", () => {
    const { rows, verdict } = k3Sensitivity("I", 500, [{ load: 0, permanentDisplacementMm: 0.9 }]);
    expect(rows[0]!.verdict).toBe("FAILED");
    expect(verdict).toBe("FAILED");
  });

  it("passes at the exact boundary displacement", () => {
    const { rows } = k3Sensitivity("III", 30, [{ load: 0, permanentDisplacementMm: 2 }]);
    expect(rows[0]!.verdict).toBe("PASSED");
  });

  it("evaluates the minimum of two loads (e.g. zero and Max) independently", () => {
    const { rows, verdict } = k3Sensitivity("I", 500, [
      { load: 0, permanentDisplacementMm: 1.2, label: "zero" },
      { load: 500, permanentDisplacementMm: 0.8, label: "Max" },
    ]);
    expect(rows[0]!.verdict).toBe("PASSED");
    expect(rows[1]!.verdict).toBe("FAILED");
    expect(verdict).toBe("FAILED"); // any failing row fails the form
  });

  it("supports rule-pack-injected thresholds and boundary", () => {
    const { requiredMm } = k3Sensitivity(
      "III",
      50,
      [{ load: 0, permanentDisplacementMm: 3 }],
      {
        minDisplacementMm: {
          classIOrII: 1,
          classIIIOrIIII_atOrBelowBoundary: 2,
          classIIIOrIIII_aboveBoundary: 3,
        },
        maxBoundaryKg: 40,
      },
    );
    expect(requiredMm).toBe(3); // Max=50 > boundary=40 -> aboveBoundary threshold
  });
});
