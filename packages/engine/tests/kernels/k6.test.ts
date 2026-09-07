/**
 * K6 — stability of equilibrium (R 76-2 form 7, R 76-1 §A.4.12).
 *
 * The thresholds under test are the standard's own printed ones — 1 e on the print check and
 * a fixed 0.25 e on zero-setting — and not the resolved maximum permissible error. That is the
 * whole reason this form needed a kernel of its own: CLAUDE.md §5 files it under K4
 * ("time-delta"), but nothing here is a time series and nothing consults an mpe band.
 */

import { describe, expect, it } from "vitest";
import {
  K6_DEFAULTS,
  k6PrintStability,
  k6StabilityOfEquilibrium,
  k6ZeroSetting,
  type K6PrintTrial,
  type K6ZeroTrial,
} from "../../src/kernels/k6.js";

/** Class III instrument, e = 5 g. The 0.25 e limit is therefore 1.25 g. */
const E = 5;

describe("k6PrintStability — R 76-2 form 7, printing or data storage", () => {
  it("passes when the printed value sits inside a window no wider than 1 e", () => {
    const trials: K6PrintTrial[] = [
      { load: 7500, printedValue: 7500, minimumReading: 7500, maximumReading: 7505 },
    ];
    const r = k6PrintStability(trials, E);
    expect(r.verdict).toBe("PASSED");
    expect(r.rows[0]!.deviation).toBeCloseTo(5, 9);
    expect(r.rows[0]!.limit).toBeCloseTo(5, 9);
  });

  it("fails when the printed value deviates by more than 1 e from a reading", () => {
    const trials: K6PrintTrial[] = [
      { load: 7500, printedValue: 7500, minimumReading: 7495, maximumReading: 7510 },
    ];
    const r = k6PrintStability(trials, E);
    expect(r.verdict).toBe("FAILED");
    expect(r.rows[0]!.deviation).toBeCloseTo(10, 9);
    expect(r.rows[0]!.reason).toMatch(/limit of 5/);
  });

  it("accepts a deviation of exactly 1 e", () => {
    // The form says "does not deviate more than 1 e", so exactly 1 e is within tolerance.
    const r = k6PrintStability(
      [{ load: 7500, printedValue: 7500, minimumReading: 7500, maximumReading: 7505 }],
      E,
    );
    expect(r.rows[0]!.verdict).toBe("PASSED");
  });

  it("fails when more than two adjacent values were indicated, even inside the 1 e spread", () => {
    // §A.4.12 defines stable equilibrium as no more than two adjacent values, one of which is
    // the printed value. An instrument can satisfy the spread while cycling through three.
    const r = k6PrintStability(
      [{
        load: 7500, printedValue: 7500,
        minimumReading: 7500, maximumReading: 7505,
        distinctValuesIndicated: 3,
      }],
      E,
    );
    expect(r.verdict).toBe("FAILED");
    expect(r.rows[0]!.tooManyValues).toBe(true);
    expect(r.rows[0]!.reason).toMatch(/adjacent values/i);
  });

  it("notes when the printed value was never among the readings", () => {
    const r = k6PrintStability(
      [{ load: 7500, printedValue: 7490, minimumReading: 7500, maximumReading: 7502 }],
      E,
    );
    expect(r.rows[0]!.printedOutsideWindow).toBe(true);
    expect(r.rows[0]!.verdict).toBe("FAILED");
  });

  it("says so when fewer than the five required trials were recorded", () => {
    const r = k6PrintStability(
      [{ load: 7500, printedValue: 7500, minimumReading: 7500, maximumReading: 7500 }],
      E,
    );
    expect(r.note).toMatch(/1 of the 5 trials/);
  });

  it("is not applicable when nothing was recorded, rather than passing by default", () => {
    expect(k6PrintStability([], E).verdict).toBe("NA");
  });
});

describe("k6ZeroSetting — R 76-2 form 7, zero-setting and tare balancing", () => {
  it("computes E0 with the form's own formula", () => {
    // E0 = I0 + 1/2 e - dL - L0 = 25 + 2.5 - 0 - 25 = 2.5
    const r = k6ZeroSetting([{ appliedLoad: 0, l0: 25, indication: 25, additionalLoad: 0 }], E);
    expect(r.rows[0]!.error).toBeCloseTo(2.5, 9);
  });

  it("checks against a fixed 0.25 e, not against the mpe", () => {
    // e = 5 g, so the limit is 1.25 g. Class III's mpe near this load would be far larger —
    // using it would let an instrument through that the form fails.
    const r = k6ZeroSetting([{ appliedLoad: 0, l0: 25, indication: 25 }], E);
    expect(r.rows[0]!.limit).toBeCloseTo(1.25, 9);
    expect(r.verdict).toBe("FAILED"); // E0 = 2.5 g exceeds 1.25 g
  });

  it("passes when |E0| is within 0.25 e", () => {
    // I0 = 23.5 -> E0 = 23.5 + 2.5 - 0 - 25 = 1.0, inside 1.25.
    const r = k6ZeroSetting([{ appliedLoad: 0, l0: 25, indication: 23.5 }], E);
    expect(r.rows[0]!.error).toBeCloseTo(1, 9);
    expect(r.verdict).toBe("PASSED");
  });

  it("accepts exactly 0.25 e", () => {
    // I0 = 23.75 -> E0 = 1.25 exactly.
    const r = k6ZeroSetting([{ appliedLoad: 0, l0: 25, indication: 23.75 }], E);
    expect(r.rows[0]!.error).toBeCloseTo(1.25, 9);
    expect(r.verdict).toBe("PASSED");
  });

  it("fails a negative error of the same magnitude", () => {
    // The limit is on the absolute value; direction does not excuse it.
    const r = k6ZeroSetting([{ appliedLoad: 0, l0: 25, indication: 21 }], E);
    expect(r.rows[0]!.error).toBeCloseTo(-1.5, 9);
    expect(r.verdict).toBe("FAILED");
  });

  it("subtracts the additional load to the changeover point", () => {
    const r = k6ZeroSetting([{ appliedLoad: 0, l0: 25, indication: 25, additionalLoad: 2 }], E);
    expect(r.rows[0]!.error).toBeCloseTo(0.5, 9);
  });

  it("names which operation was under test", () => {
    const trial: K6ZeroTrial = { appliedLoad: 4500, l0: 25, indication: 23.5 };
    expect(k6ZeroSetting([trial], E, "tare-balancing").rows[0]!.reason).toMatch(/tare-balancing/);
    expect(k6ZeroSetting([trial], E, "zero-setting").rows[0]!.reason).toMatch(/zero-setting/);
  });
});

describe("k6StabilityOfEquilibrium — the whole form", () => {
  const goodPrint: K6PrintTrial[] = Array.from({ length: 5 }, () => ({
    load: 7500, printedValue: 7500, minimumReading: 7500, maximumReading: 7502,
    distinctValuesIndicated: 2,
  }));
  const goodZero: K6ZeroTrial[] = Array.from({ length: 5 }, () => ({
    appliedLoad: 0, l0: 25, indication: 23.5,
  }));

  it("passes when both halves pass", () => {
    const r = k6StabilityOfEquilibrium({
      e: E, printTrials: goodPrint, zeroSettingTrials: goodZero,
    });
    expect(r.verdict).toBe("PASSED");
    expect(r.print.verdict).toBe("PASSED");
    expect(r.zeroSetting.verdict).toBe("PASSED");
    // Tare balancing was not performed; that is NA, and it does not fail the form.
    expect(r.tareBalancing.verdict).toBe("NA");
  });

  it("fails the form when either half fails", () => {
    expect(
      k6StabilityOfEquilibrium({
        e: E, printTrials: goodPrint,
        zeroSettingTrials: [{ appliedLoad: 0, l0: 25, indication: 25 }],
      }).verdict,
    ).toBe("FAILED");

    expect(
      k6StabilityOfEquilibrium({
        e: E, zeroSettingTrials: goodZero,
        printTrials: [{ load: 7500, printedValue: 7500, minimumReading: 7480, maximumReading: 7500 }],
      }).verdict,
    ).toBe("FAILED");
  });

  it("fails the form when a documentation examination was answered no", () => {
    // §A.4.12 asks the examiner to confirm printing is impossible before equilibrium. That is
    // an examination, not a measurement, but a "no" is still a failure of the form.
    const r = k6StabilityOfEquilibrium({
      e: E, printTrials: goodPrint, zeroSettingTrials: goodZero,
      documentationChecks: { printingInhibitedBeforeEquilibrium: false },
    });
    expect(r.verdict).toBe("FAILED");
    expect(r.failedDocumentationChecks[0]).toMatch(/printing or storing is impossible/i);
  });

  it("does not pass a form on which nothing was recorded", () => {
    expect(k6StabilityOfEquilibrium({ e: E }).verdict).toBe("NA");
  });

  it("takes its thresholds from parameters, so a rule pack can move them", () => {
    const r = k6StabilityOfEquilibrium({
      e: E,
      zeroSettingTrials: [{ appliedLoad: 0, l0: 25, indication: 25 }], // E0 = 2.5
      params: { zeroSettingLimitInE: 0.5 }, // 2.5 g — now exactly at the limit
    });
    expect(r.zeroSetting.verdict).toBe("PASSED");
  });

  it("carries the standard's own defaults", () => {
    expect(K6_DEFAULTS.printDeviationInE).toBe(1);
    expect(K6_DEFAULTS.zeroSettingLimitInE).toBe(0.25);
    expect(K6_DEFAULTS.maxAdjacentValues).toBe(2);
    expect(K6_DEFAULTS.requiredTrials).toBe(5);
  });
});
