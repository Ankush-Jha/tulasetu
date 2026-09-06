/**
 * Golden tests for K4 (time-dependence), derived from:
 *  - creep:              R 76-1 §3.9.4.1 / §A.4.11.1 / R 76-2 form 6.2
 *  - zero return:        R 76-1 §3.9.4.2 / §A.4.11.2 / R 76-2 form 6.1
 *  - temperature no-load: R 76-1 §3.9.2.3 / R 76-2 form 2
 *  - span stability:     R 76-1 §5.3.3 / Annex B.4 / R 76-2 form 14
 */
import { describe, expect, it } from "vitest";
import {
  k4Creep,
  k4SpanStability,
  k4TemperatureNoLoad,
  k4ZeroReturn,
} from "../../src/kernels/k4.js";
import type { MpeResolution } from "../../src/types.js";

function stubMpe(value: number): (load: number) => MpeResolution {
  return (load: number) => ({
    mpe: value,
    factor: 1.0,
    e: 1,
    rangeIndex: 1,
    m: load,
    stage: "initial",
    reason: "stub for K4 tests",
  });
}

describe("k4Creep — R 76-1 §3.9.4.1 / §A.4.11.1", () => {
  it("terminates at 30 minutes when condition (a) is met (both sub-checks)", () => {
    const result = k4Creep({
      load: 1000,
      e: 1,
      mpe: stubMpe(5),
      readings: [
        { atMinutes: 0, priorToRounding: 1000 },
        { atMinutes: 15, priorToRounding: 1000.3 },
        { atMinutes: 30, priorToRounding: 1000.4 },
      ],
    });
    expect(result.deltaAt30).toBeCloseTo(0.4); // <= 0.5e
    expect(result.deltaBetween15And30).toBeCloseTo(0.1); // <= 0.2e
    expect(result.conditionAMet).toBe(true);
    expect(result.terminatedAt30).toBe(true);
    expect(result.verdict).toBe("PASSED");
  });

  it("fails condition (a) via the 30-minute sub-check even if 15-30 sub-check holds", () => {
    const result = k4Creep({
      load: 1000,
      e: 1,
      mpe: stubMpe(5),
      readings: [
        { atMinutes: 0, priorToRounding: 1000 },
        { atMinutes: 15, priorToRounding: 1000.5 },
        { atMinutes: 30, priorToRounding: 1000.6 }, // deltaAt30 = 0.6 > 0.5e
        { atMinutes: 240, priorToRounding: 1002 }, // deltaOverFourHours = 2 <= mpe(5)
      ],
    });
    expect(result.conditionAMet).toBe(false);
    expect(result.conditionBMet).toBe(true);
    expect(result.verdict).toBe("PASSED"); // falls back to condition (b) and passes
  });

  it("fails condition (a) via the 15-30 sub-check even though the 30-minute delta is small", () => {
    const result = k4Creep({
      load: 1000,
      e: 1,
      mpe: stubMpe(5),
      readings: [
        { atMinutes: 0, priorToRounding: 1000 },
        { atMinutes: 15, priorToRounding: 1000.1 },
        { atMinutes: 30, priorToRounding: 1000.4 }, // deltaAt30=0.4<=0.5, but 15->30 = 0.3 > 0.2e
        { atMinutes: 240, priorToRounding: 1001 },
      ],
    });
    expect(result.conditionAMet).toBe(false);
    expect(result.conditionBMet).toBe(true);
  });

  it("fails outright when condition (a) fails and the 4-hour reading exceeds |mpe|", () => {
    const result = k4Creep({
      load: 1000,
      e: 1,
      mpe: stubMpe(5),
      readings: [
        { atMinutes: 0, priorToRounding: 1000 },
        { atMinutes: 15, priorToRounding: 1000.5 },
        { atMinutes: 30, priorToRounding: 1000.6 },
        { atMinutes: 240, priorToRounding: 1006 }, // delta = 6 > mpe(5)
      ],
    });
    expect(result.conditionAMet).toBe(false);
    expect(result.conditionBMet).toBe(false);
    expect(result.verdict).toBe("FAILED");
  });

  it("fails when condition (a) fails and no 4-hour reading was taken", () => {
    const result = k4Creep({
      load: 1000,
      e: 1,
      mpe: stubMpe(5),
      readings: [
        { atMinutes: 0, priorToRounding: 1000 },
        { atMinutes: 15, priorToRounding: 1000.5 },
        { atMinutes: 30, priorToRounding: 1000.6 },
      ],
    });
    expect(result.verdict).toBe("FAILED");
    expect(result.notes.join(" ")).toMatch(/240-minute/);
  });

  it("fails outright when required readings are missing", () => {
    const result = k4Creep({
      load: 1000,
      e: 1,
      mpe: stubMpe(5),
      readings: [{ atMinutes: 0, priorToRounding: 1000 }],
    });
    expect(result.verdict).toBe("FAILED");
  });
});

describe("k4ZeroReturn — R 76-1 §3.9.4.2 / §A.4.11.2", () => {
  it("single-range: passes at deviation <= 0.5e", () => {
    const result = k4ZeroReturn({ rangeKind: "single", eAtLoad: 2, p0: 100, p30: 100.9 });
    expect(result.allowedDeviation).toBe(1); // 0.5 * 2
    expect(result.deviation).toBeCloseTo(0.9);
    expect(result.verdict).toBe("PASSED");
  });

  it("single-range: fails above 0.5e", () => {
    const result = k4ZeroReturn({ rangeKind: "single", eAtLoad: 2, p0: 100, p30: 101.2 });
    expect(result.verdict).toBe("FAILED");
  });

  it("multi-interval: uses e1 (smallest e), not the e at the load", () => {
    // eAtLoad=5 would allow up to 2.5 deviation; e1=1 only allows up to 0.5.
    const result = k4ZeroReturn({ rangeKind: "multi-interval", eAtLoad: 5, e1: 1, p0: 100, p30: 101.0 });
    expect(result.allowedDeviation).toBe(0.5); // 0.5 * e1, NOT 0.5 * eAtLoad
    expect(result.verdict).toBe("FAILED"); // deviation 1.0 > 0.5
  });

  it("multi-interval: throws if e1 is not supplied", () => {
    expect(() => k4ZeroReturn({ rangeKind: "multi-interval", eAtLoad: 5, p0: 100, p30: 100.1 })).toThrow();
  });

  it("multiple-range: uses 0.5 * e_i of the unloaded range for the primary check", () => {
    const result = k4ZeroReturn({ rangeKind: "multiple-range", eAtLoad: 2, e1: 1, p0: 100, p30: 100.8 });
    expect(result.allowedDeviation).toBe(1); // 0.5 * e_i
    expect(result.conditionAMet).toBe(true);
    expect(result.verdict).toBe("PASSED"); // no p35 supplied -> only condition (a) applies
  });

  it("multiple-range: applies the secondary 5-minute check against a FULL e1 (not 0.5 e1)", () => {
    const result = k4ZeroReturn({
      rangeKind: "multiple-range",
      eAtLoad: 2,
      e1: 1,
      p0: 100,
      p30: 100.8, // condition (a) passes: 0.8 <= 1
      p35: 101.9, // |101.9 - 100.8| = 1.1 > e1 (1) -> condition (b) fails
    });
    expect(result.conditionAMet).toBe(true);
    expect(result.secondaryAllowed).toBe(1); // e1, not 0.5*e1
    expect(result.conditionBMet).toBe(false);
    expect(result.verdict).toBe("FAILED"); // compound: (a) AND (b)
  });

  it("multiple-range: passes when both (a) and (b) hold", () => {
    const result = k4ZeroReturn({
      rangeKind: "multiple-range",
      eAtLoad: 2,
      e1: 1,
      p0: 100,
      p30: 100.8,
      p35: 101.2, // secondaryDeviation = |101.2 - 100.8| = 0.4 <= e1(1)
    });
    expect(result.secondaryDeviation).toBeCloseTo(0.4);
    expect(result.conditionBMet).toBe(true);
    expect(result.verdict).toBe("PASSED");
  });
});

describe("k4TemperatureNoLoad — R 76-1 §3.9.2.3 / R 76-2 form 2", () => {
  it("class II/III/IIII: passes at exactly e per 5 degC", () => {
    const result = k4TemperatureNoLoad({
      pStart: 0,
      pEnd: 0.8,
      temperatureStartC: 20,
      temperatureEndC: 24, // deltaTempC = 4
      accuracyClass: "II",
      e: 1,
    });
    // rate = (0.8/4)*5 = 1.0 <= e(1)
    expect(result.intervalCUsed).toBe(5);
    expect(result.ratePerReferenceInterval).toBeCloseTo(1.0);
    expect(result.verdict).toBe("PASSED");
  });

  it("class II/III/IIII: fails above e per 5 degC", () => {
    const result = k4TemperatureNoLoad({
      pStart: 0,
      pEnd: 2,
      temperatureStartC: 20,
      temperatureEndC: 25,
      accuracyClass: "III",
      e: 1,
    });
    // rate = (2/5)*5 = 2 > 1
    expect(result.verdict).toBe("FAILED");
  });

  it("class I: uses the 1 degC reference interval, not 5", () => {
    const result = k4TemperatureNoLoad({
      pStart: 0,
      pEnd: 0.3,
      temperatureStartC: 20,
      temperatureEndC: 22, // deltaTempC = 2
      accuracyClass: "I",
      e: 0.5,
    });
    // rate = (0.3/2)*1 = 0.15 <= 0.5
    expect(result.intervalCUsed).toBe(1);
    expect(result.verdict).toBe("PASSED");
  });

  it("treats zero temperature change as compliant (no drift to normalize)", () => {
    const result = k4TemperatureNoLoad({
      pStart: 0,
      pEnd: 5,
      temperatureStartC: 20,
      temperatureEndC: 20,
      accuracyClass: "II",
      e: 1,
    });
    expect(result.deltaTempC).toBe(0);
    expect(result.ratePerReferenceInterval).toBe(0);
    expect(result.verdict).toBe("PASSED");
  });

  it("accepts a rule-pack-injected interval map (mirrors OIML_R76_2006.json drift_per_C)", () => {
    const result = k4TemperatureNoLoad(
      { pStart: 0, pEnd: 1, temperatureStartC: 0, temperatureEndC: 10, accuracyClass: "II", e: 1 },
      { intervalC: { I: 1, default: 5 } },
    );
    expect(result.intervalCUsed).toBe(5);
  });
});

describe("k4SpanStability — R 76-1 §5.3.3 / Annex B.4", () => {
  it("passes when both the per-measurement and variation checks hold", () => {
    const result = k4SpanStability({
      measurements: [{ error: 0.5 }, { error: -0.5 }],
      e: 2,
      mpeInitial: 3,
    });
    expect(result.allowedVariation).toBe(1.5); // max(0.5*2, 0.5*3)
    expect(result.variation).toBeCloseTo(1.0);
    expect(result.variationConditionMet).toBe(true);
    expect(result.perMeasurementVerdicts).toEqual(["PASSED", "PASSED"]);
    expect(result.verdict).toBe("PASSED");
  });

  it("fails when the variation across measurements exceeds max(0.5e, 0.5|mpe|)", () => {
    const result = k4SpanStability({
      measurements: [{ error: 1 }, { error: -1 }],
      e: 2,
      mpeInitial: 3,
    });
    expect(result.allowedVariation).toBe(1.5);
    expect(result.variation).toBeCloseTo(2.0);
    expect(result.variationConditionMet).toBe(false);
    expect(result.verdict).toBe("FAILED");
  });

  it("fails when an individual measurement's error exceeds |mpe|, even if variation is fine", () => {
    const result = k4SpanStability({
      measurements: [{ error: 4 }, { error: 3.9 }],
      e: 2,
      mpeInitial: 3,
    });
    expect(result.variationConditionMet).toBe(true); // variation = 0.1, tiny
    expect(result.perMeasurementVerdicts).toEqual(["FAILED", "FAILED"]);
    expect(result.verdict).toBe("FAILED");
  });

  it("handles a single measurement (variation undefined, only per-measurement check applies)", () => {
    const result = k4SpanStability({ measurements: [{ error: 1 }], e: 2, mpeInitial: 3 });
    expect(result.variation).toBe(0);
    expect(result.variationConditionMet).toBe(true);
    expect(result.perMeasurementVerdicts).toEqual(["PASSED"]);
    expect(result.verdict).toBe("PASSED");
  });

  it("uses |mpeInitial| even if a negative value is supplied", () => {
    const result = k4SpanStability({ measurements: [{ error: 2.9 }, { error: -2.9 }], e: 1, mpeInitial: -3 });
    expect(result.allowedVariation).toBe(1.5); // max(0.5, 1.5)
    expect(result.perMeasurementVerdicts).toEqual(["PASSED", "PASSED"]);
  });
});
