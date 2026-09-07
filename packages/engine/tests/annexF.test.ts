/**
 * Tests for the Annex F module-compatibility checker.
 *
 * The primary fixture, `EXAMPLE_1`, is R 76-1's own worked example F.6.1 "Road vehicle
 * weigher with one measuring range" (docs/standards/extracted/OIML_R76-1_2006_requirements.txt,
 * lines ~6004-6113) — every number below (Max, e, N, R, DL, IZSR, NUD, Q, Emax, Emin, Y, nLC,
 * nind, pLC, pind, pcon, temperature ranges) is copied verbatim from the standard's own
 * example, including its own computed Q = 1.867 and its own pass/fail table on page 134.
 * This lets the "all pass" golden test be checked against the standard's own arithmetic
 * rather than invented numbers.
 *
 * Everywhere a number is NOT sourced from the standard (i.e. modified to exercise a failing
 * branch, or a placeholder for a named real load cell's unpublished datasheet spec), it is
 * marked ILLUSTRATIVE in a comment, per the instruction not to present invented numbers as
 * fact. Real load-cell brand names (KELI, Zemic, Flintec, ...) are taken from
 * docs/certificates/certificates-fields.json, which records that they appear on real Indian
 * certificates — but their numeric ratings here are illustrative fixtures, not their actual
 * published OIML R 60 datasheet values.
 */

import { describe, expect, it } from "vitest";
import {
  checkModuleCompatibility,
  type IndicatorModuleData,
  type LoadCellModuleData,
  type ModuleCheckResult,
  type ModuleCompatibilityInput,
  type WeighingInstrumentModuleData,
} from "../src/annexF.js";
import type { RulePack } from "../src/rulepack.js";

const PACK: RulePack = {
  ruleset_id: "TEST_PACK",
  classification: [{ class: "III", e_min_g: 0.1, e_max_g: 2, n_min: 100, n_max: 10000, min_capacity: "20e" }],
  mpe_bands_initial: [{ limit: "1.0e", max_m_in_e: { III: null } }],
  module_error_fractions: { rule: "sum(p_i^2) <= 1", p_max: 0.8, digital_module_may_be_zero: true },
  tests: [{ id: "dummy", form: "1", kernel: "K1" }],
};

// ---------------------------------------------------------------------------
// F.6.1 worked example — every number sourced from the standard (see file header)
// ---------------------------------------------------------------------------

const EXAMPLE_1_INSTRUMENT: WeighingInstrumentModuleData = {
  accuracyClass: "III",
  unit: "kg",
  ranges: [{ max: 60_000, e: 20 }], // Max = 60 t, e = 20 kg
  reductionRatio: 1, // "without leverwork R = 1"
  numberOfLoadCells: 4,
  deadLoad: 12_000, // DL = 12 t
  initialZeroSettingRange: 10_000, // IZSR = 10 t
  nonUniformLoadCorrection: 30_000, // NUD = 30 t
  additiveTare: 0,
  temperatureRange: { minC: -10, maxC: 40 },
};

const EXAMPLE_1_LOADCELL: LoadCellModuleData = {
  accuracyClass: "C",
  unit: "kg",
  maxCapacity: 30_000, // Emax = 30 t
  minDeadLoad: 2_000, // Emin = 2 t
  maxScaleIntervals: 3_000, // nLC = 3000
  y: 6_000, // Y = Emax / vmin = 6000  =>  vmin = 5 kg
  temperatureRange: { minC: -10, maxC: 40 },
  fractionOfMpe: 0.7, // pLC = 0.7
};

const EXAMPLE_1_INDICATOR: IndicatorModuleData = {
  accuracyClass: "III",
  maxScaleIntervals: 3_000, // nind = 3000
  temperatureRange: { minC: -10, maxC: 40 },
  fractionOfMpe: 0.5, // pind = 0.5
};

const EXAMPLE_1: ModuleCompatibilityInput = {
  instrument: EXAMPLE_1_INSTRUMENT,
  loadCell: EXAMPLE_1_LOADCELL,
  indicator: EXAMPLE_1_INDICATOR,
  connecting: { fractionOfMpe: 0.5 }, // pcon = 0.5
};

describe("checkModuleCompatibility — R 76-1 Annex F.6.1 worked example (all sourced numbers)", () => {
  const result = checkModuleCompatibility(EXAMPLE_1, PACK);

  it("passes overall, matching the standard's own pass/fail table on page 134", () => {
    expect(result.verdict).toBe("PASSED");
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("computes Q = 1.867 exactly as the standard's own worked arithmetic does", () => {
    const margin = result.checks.find((c) => c.check === "annexF.capacity_margin")!;
    expect(margin.detail).toMatch(/Q = \(Max\+DL\+IZSR\+NUD\+T\+\)\/Max = 1\.8667/);
    expect(margin.detail).toMatch(/28000 kg/); // Q x Max x R/N = 28 000 kg, per the standard
  });

  it("computes vmin = 5 kg from Y = 6000 and finds it within e1 x R / sqrt(N) = 10 kg", () => {
    const vmin = result.checks.find((c) => c.check === "annexF.min_verification_interval")!;
    expect(vmin.passed).toBe(true);
    expect(vmin.detail).toMatch(/5 kg/);
    expect(vmin.detail).toMatch(/10 kg/);
  });

  it("accepts load-cell class C and indicator class III against WI class III (Tables 13 & 14)", () => {
    expect(result.checks.find((c) => c.check === "annexF.class_compatibility.loadCell")!.passed).toBe(true);
    expect(result.checks.find((c) => c.check === "annexF.class_compatibility.indicator")!.passed).toBe(true);
  });

  it("passes the boundary equalities (nind == ni, nLC == ni, Tmin/Tmax exactly matching)", () => {
    // ni = 60000/20 = 3000 = nind = nLC exactly — boundary must pass, not fail.
    for (const id of ["annexF.scale_intervals.indicator", "annexF.scale_intervals.loadCell"]) {
      const c = result.checks.find((x) => x.check === id)!;
      expect(c.passed).toBe(true);
    }
  });

  it("computes the sum of squares 0.99 exactly as the standard's own table does", () => {
    const errApp = result.checks.find((c) => c.check === "annexF.error_apportionment")!;
    expect(errApp.passed).toBe(true);
    expect(errApp.actual).toBeCloseTo(0.99, 4);
  });
});

// ---------------------------------------------------------------------------
// Failing variants (deliberately modified from the sourced example — clearly labelled)
// ---------------------------------------------------------------------------

describe("checkModuleCompatibility — failing capacity margin (ILLUSTRATIVE: Emax reduced)", () => {
  it("fails when the load cell's Emax is too small for Q x Max x R/N", () => {
    // ILLUSTRATIVE: Emax dropped from the standard's real 30 t to a deliberately
    // insufficient 20 t (required is 28 t) purely to exercise the failing branch. This is
    // not a real load cell's published rating.
    const input: ModuleCompatibilityInput = {
      ...EXAMPLE_1,
      loadCell: { ...EXAMPLE_1_LOADCELL, maxCapacity: 20_000 },
    };
    const result = checkModuleCompatibility(input, PACK);
    expect(result.verdict).toBe("FAILED");
    const margin = result.checks.find((c) => c.check === "annexF.capacity_margin")!;
    expect(margin.passed).toBe(false);
  });
});

describe("checkModuleCompatibility — temperature CONTAINMENT vs. naive overlap", () => {
  it("fails when the indicator's range overlaps the WI's range but does not fully contain it", () => {
    // Indicator rated 0 C to 40 C: this OVERLAPS the WI's declared -10 C to 40 C range, so a
    // naive "ranges overlap" check (CLAUDE.md's summary wording) would wrongly pass this.
    // Annex F.4 item (2) requires containment (Tmin_IND <= Tmin_WI), which correctly fails
    // here because the indicator is not rated down to -10 C.
    const input: ModuleCompatibilityInput = {
      ...EXAMPLE_1,
      indicator: { ...EXAMPLE_1_INDICATOR, temperatureRange: { minC: 0, maxC: 40 } },
    };
    const result = checkModuleCompatibility(input, PACK);
    const tempCheck = result.checks.find((c) => c.check === "annexF.temperature.indicator")!;
    expect(tempCheck.passed).toBe(false);
    expect(result.verdict).toBe("FAILED");
  });

  it("still passes when both LC and IND fully contain the WI's declared range", () => {
    const result = checkModuleCompatibility(EXAMPLE_1, PACK);
    expect(result.checks.find((c) => c.check === "annexF.temperature.loadCell")!.passed).toBe(true);
    expect(result.checks.find((c) => c.check === "annexF.temperature.indicator")!.passed).toBe(true);
  });
});

describe("checkModuleCompatibility — sum(pi^2) <= 1 boundary cases", () => {
  it("passes at the exact boundary sum(pi^2) == 1", () => {
    // pLC=0.8 (upper bound), pind=0.6, pcon=0: 0.64 + 0.36 + 0 = 1.0 exactly.
    const input: ModuleCompatibilityInput = {
      ...EXAMPLE_1,
      loadCell: { ...EXAMPLE_1_LOADCELL, fractionOfMpe: 0.8 },
      indicator: { ...EXAMPLE_1_INDICATOR, fractionOfMpe: 0.6 },
      connecting: { fractionOfMpe: 0 }, // purely digital connecting element, §3.10.2.1 "may be equal to 0"
    };
    const result = checkModuleCompatibility(input, PACK);
    const errApp = result.checks.find((c) => c.check === "annexF.error_apportionment")!;
    expect(errApp.actual).toBeCloseTo(1.0, 6);
    expect(errApp.passed).toBe(true);
  });

  it("fails just past the boundary, sum(pi^2) > 1", () => {
    // pLC=0.8, pind=0.7, pcon=0: 0.64 + 0.49 + 0 = 1.13 > 1.
    const input: ModuleCompatibilityInput = {
      ...EXAMPLE_1,
      loadCell: { ...EXAMPLE_1_LOADCELL, fractionOfMpe: 0.8 },
      indicator: { ...EXAMPLE_1_INDICATOR, fractionOfMpe: 0.7 },
      connecting: { fractionOfMpe: 0 },
    };
    const result = checkModuleCompatibility(input, PACK);
    const errApp = result.checks.find((c) => c.check === "annexF.error_apportionment")!;
    expect(errApp.passed).toBe(false);
    expect(result.verdict).toBe("FAILED");
  });

  it("fails when a non-digital, non-weighing-module pi drops below the 0.3 floor (§3.10.2.1)", () => {
    // pcon = 0.1 is below the 0.3 floor even though the sum of squares is well under 1.
    const input: ModuleCompatibilityInput = {
      ...EXAMPLE_1,
      connecting: { fractionOfMpe: 0.1 },
    };
    const result = checkModuleCompatibility(input, PACK);
    const errApp = result.checks.find((c) => c.check === "annexF.error_apportionment")!;
    expect(errApp.passed).toBe(false);
    expect(errApp.detail).toMatch(/pCon=0\.1/);
  });
});

describe("checkModuleCompatibility — NH-marked load cell is rejected under the modular approach", () => {
  it("fails when the load cell carries an NH (not humidity tested) mark", () => {
    const input: ModuleCompatibilityInput = {
      ...EXAMPLE_1,
      loadCell: { ...EXAMPLE_1_LOADCELL, humidityMark: "NH" },
    };
    const result = checkModuleCompatibility(input, PACK);
    expect(result.verdict).toBe("FAILED");
    expect(result.checks.some((c) => c.check === "annexF.humidity_mark" && !c.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Named real load cells (docs/certificates/certificates-fields.json records these brands on
// real Indian certificates). Their numeric ratings below are ILLUSTRATIVE fixtures — not the
// brands' actual published OIML R 60 datasheet values, which are not in this repo.
// ---------------------------------------------------------------------------

describe("checkModuleCompatibility — named real load-cell brands, illustrative ratings", () => {
  // ILLUSTRATIVE: a shop-scale-scale instrument compatible with a small analog load cell.
  const smallInstrument: WeighingInstrumentModuleData = {
    accuracyClass: "III",
    unit: "kg",
    ranges: [{ max: 30, e: 0.01 }], // n = 3000
    reductionRatio: 1,
    numberOfLoadCells: 1,
    deadLoad: 2,
    initialZeroSettingRange: 0.5,
    nonUniformLoadCorrection: 0, // single-point load cell -> 0% of Max per F.1 footnote
    additiveTare: 0,
    temperatureRange: { minC: -10, maxC: 40 },
  };
  const smallIndicator: IndicatorModuleData = {
    accuracyClass: "III",
    maxScaleIntervals: 6_000,
    temperatureRange: { minC: -10, maxC: 40 },
  };

  it("KELI single-point load cell (illustrative rating) passes a compatible small instrument", () => {
    // ILLUSTRATIVE rating, not KELI's published datasheet.
    const keli: LoadCellModuleData = {
      accuracyClass: "C",
      unit: "kg",
      maxCapacity: 35,
      minDeadLoad: 0,
      maxScaleIntervals: 6_000,
      y: 15_000, // vmin = 35/15000 ~= 0.00233 kg
      temperatureRange: { minC: -10, maxC: 40 },
    };
    const result = checkModuleCompatibility(
      { instrument: smallInstrument, loadCell: keli, indicator: smallIndicator },
      PACK,
    );
    expect(result.verdict).toBe("PASSED");
  });

  it("Zemic load cell (illustrative rating) fails when its temperature range is narrower than the instrument's", () => {
    // ILLUSTRATIVE rating, not Zemic's published datasheet. Range narrowed to 0 C..40 C to
    // force a failure against the instrument's declared -10 C..40 C.
    const zemic: LoadCellModuleData = {
      accuracyClass: "C",
      unit: "kg",
      maxCapacity: 35,
      maxScaleIntervals: 6_000,
      y: 15_000,
      temperatureRange: { minC: 0, maxC: 40 },
    };
    const result = checkModuleCompatibility(
      { instrument: smallInstrument, loadCell: zemic, indicator: smallIndicator },
      PACK,
    );
    expect(result.verdict).toBe("FAILED");
    expect(result.checks.find((c) => c.check === "annexF.temperature.loadCell")!.passed).toBe(false);
  });
});

describe("checkModuleCompatibility — rule-pack error-fraction defaults are honoured", () => {
  it("falls back to F.2.2/F.3.2 defaults (pLC=0.7, pind=0.5) when the pack gives no `typical` and the module gives no explicit fraction", () => {
    const packWithoutTypical: RulePack = {
      ...PACK,
      module_error_fractions: { rule: "sum(p_i^2) <= 1", p_max: 0.8, digital_module_may_be_zero: true },
    };
    const input: ModuleCompatibilityInput = {
      instrument: EXAMPLE_1_INSTRUMENT,
      loadCell: { ...EXAMPLE_1_LOADCELL, fractionOfMpe: undefined },
      indicator: { ...EXAMPLE_1_INDICATOR, fractionOfMpe: undefined },
      connecting: {},
    };
    const result = checkModuleCompatibility(input, packWithoutTypical);
    const errApp = result.checks.find((c) => c.check === "annexF.error_apportionment")!;
    // 0.7^2 + 0.5^2 + 0.5^2 = 0.49 + 0.25 + 0.25 = 0.99, same as the sourced example.
    expect(errApp.actual).toBeCloseTo(0.99, 4);
  });
});

/**
 * F.4 items (8), (9) and (10) — the electrical checks.
 *
 * These were the three CLAUDE.md §6 omitted and that were, until now, left unimplemented.
 * They are indicator-side electrical specifications rather than metrological ones, but the
 * form treats them as compatibility conditions like any other, and an instrument that fails
 * them does not work.
 *
 * All three are *skipped rather than failed* when the certificates do not state the figures.
 * An indicator whose OIML certificate is silent on its minimum input voltage has not failed
 * the check — the check could not be performed, and a report saying so is more honest than one
 * inventing a pass.
 */
describe("Annex F.4 items (8)-(10) — electrical compatibility", () => {
  /** A single-cell class III platform, with the electrical figures the form asks for. */
  function build(overrides: {
    loadCell?: Record<string, unknown>;
    indicator?: Record<string, unknown>;
    instrument?: Record<string, unknown>;
    cable?: { length: number; crossSection: number };
  } = {}) {
    return {
      instrument: {
        accuracyClass: "III" as const,
        unit: "g" as const,
        ranges: [{ max: 30000, e: 10 }],
        reductionRatio: 1,
        numberOfLoadCells: 1,
        deadLoad: 2000,
        initialZeroSettingRange: 600,
        nonUniformLoadCorrection: 0,
        temperatureRange: { minC: -10, maxC: 40 },
        ...overrides.instrument,
      },
      loadCell: {
        accuracyClass: "C" as const,
        unit: "g" as const,
        maxCapacity: 35000,
        minDeadLoad: 0,
        maxScaleIntervals: 3000,
        y: 15000,
        temperatureRange: { minC: -10, maxC: 40 },
        fractionOfMpe: 0.7,
        humidityMark: "CH" as const,
        // ILLUSTRATIVE electrical figures — a 2 mV/V cell at 350 ohm is an ordinary
        // specification, but these are not read off any particular datasheet.
        ratedOutput: 2,
        inputResistance: 350,
        ...overrides.loadCell,
      },
      indicator: {
        accuracyClass: "III" as const,
        maxScaleIntervals: 6000,
        temperatureRange: { minC: -10, maxC: 40 },
        fractionOfMpe: 0.5,
        excitationVoltage: 5,
        minInputVoltage: 0.1,
        minInputVoltagePerInterval: 0.5,
        minLoadImpedance: 87,
        maxLoadImpedance: 1200,
        maxCableLengthPerArea: 100,
        ...overrides.indicator,
      },
      ...(overrides.cable ? { cable: overrides.cable } : {}),
    } as never;
  }

  const find = (checks: ModuleCheckResult[], id: string) => checks.find((c) => c.check === id);

  it("computes the general minimum input voltage from the form's own formula", () => {
    // U = C x Uexc x R x DL / (Emax x N) = 2 x 5 x 1 x 2000 / (35000 x 1) = 0.5714 mV
    const { checks } = checkModuleCompatibility(build(), PACK);
    const c = find(checks, "annexF.input_voltage.general")!;
    expect(c.passed).toBe(true);
    expect(String(c.actual)).toMatch(/^0\.571/);
  });

  it("fails when the dead load does not raise the signal above the indicator's floor", () => {
    // An indicator needing 2 mV sees only 0.571 mV on this receptor.
    const { checks } = checkModuleCompatibility(
      build({ indicator: { minInputVoltage: 2 } }), PACK,
    );
    expect(find(checks, "annexF.input_voltage.general")!.passed).toBe(false);
  });

  it("checks the per-interval signal separately, in microvolts", () => {
    // u = 2 x 5 x 1 x 10 / (35000 x 1) = 0.002857 mV = 2.857 uV/e
    const { checks } = checkModuleCompatibility(build(), PACK);
    const c = find(checks, "annexF.input_voltage.per_interval")!;
    expect(String(c.actual)).toMatch(/uV\/e$/);
    expect(c.passed).toBe(true);
  });

  it("fails a combination that cannot resolve one scale interval", () => {
    // An indicator needing 10 uV/e against a signal of 2.86 uV/e cannot weigh, however
    // healthy the overall signal is.
    const { checks } = checkModuleCompatibility(
      build({ indicator: { minInputVoltagePerInterval: 10 } }), PACK,
    );
    expect(find(checks, "annexF.input_voltage.per_interval")!.passed).toBe(false);
  });

  it("divides load-cell resistance by the number of cells, because they are in parallel", () => {
    // Four 350 ohm cells present 87.5 ohm, which is inside 87-1200.
    const { checks } = checkModuleCompatibility(
      build({ instrument: { numberOfLoadCells: 4 } }), PACK,
    );
    const c = find(checks, "annexF.impedance")!;
    expect(c.passed).toBe(true);
    expect(String(c.actual)).toBe("87.5 ohm");
  });

  it("fails when too many cells in parallel drop below the indicator's floor", () => {
    // Eight cells present 43.75 ohm, below the 87 ohm minimum.
    const { checks } = checkModuleCompatibility(
      build({ instrument: { numberOfLoadCells: 8 } }), PACK,
    );
    expect(find(checks, "annexF.impedance")!.passed).toBe(false);
  });

  it("checks the cable as a length-to-cross-section ratio", () => {
    // 30 m of 0.5 mm2 wire is 60 m/mm2, inside a 100 m/mm2 allowance.
    const ok = checkModuleCompatibility(build({ cable: { length: 30, crossSection: 0.5 } }), PACK);
    expect(find(ok.checks, "annexF.cable_length")!.passed).toBe(true);

    // The same 30 m on thinner wire is 120 m/mm2, and fails.
    const bad = checkModuleCompatibility(build({ cable: { length: 30, crossSection: 0.25 } }), PACK);
    expect(find(bad.checks, "annexF.cable_length")!.passed).toBe(false);
  });

  it("rejects a cable with no cross-section rather than dividing by zero", () => {
    const { checks } = checkModuleCompatibility(
      build({ cable: { length: 10, crossSection: 0 } }), PACK,
    );
    expect(find(checks, "annexF.cable_length")!.passed).toBe(false);
  });

  it("skips each check, rather than failing it, when the figures were not supplied", () => {
    const { checks, verdict } = checkModuleCompatibility(
      build({
        loadCell: { ratedOutput: undefined, inputResistance: undefined },
        indicator: {
          excitationVoltage: undefined, minInputVoltage: undefined,
          minInputVoltagePerInterval: undefined,
          minLoadImpedance: undefined, maxLoadImpedance: undefined,
          maxCableLengthPerArea: undefined,
        },
      }),
      PACK,
    );
    for (const id of ["annexF.input_voltage", "annexF.impedance", "annexF.cable_length"]) {
      const c = find(checks, id)!;
      expect(c.passed, `${id} should be skipped, not failed`).toBe(true);
      expect(String(c.actual)).toBe("not stated");
      expect(c.detail).toMatch(/not evaluated/i);
    }
    // And a combination that is otherwise sound still passes overall.
    expect(verdict).toBe("PASSED");
  });

  it("cites Annex F.4 on every one of the three", () => {
    const { checks } = checkModuleCompatibility(
      build({ cable: { length: 10, crossSection: 0.5 } }), PACK,
    );
    for (const c of checks.filter((x) => /input_voltage|impedance|cable_length/.test(x.check))) {
      expect(c.clause).toMatch(/Annex F\.4 item \((8|9|10)\)/);
    }
  });
});
