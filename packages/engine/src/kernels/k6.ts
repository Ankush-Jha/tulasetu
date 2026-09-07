/**
 * K6 — stability of equilibrium (R 76-2 form 7, R 76-1 §A.4.12 / §4.4.2).
 *
 * The sixth kernel, and it exists because form 7 genuinely does not reduce to the other five.
 * CLAUDE.md §5 tags it K4 ("time-delta"), but nothing on the form is a time series: it is two
 * independent checks against *fixed* multiples of e, neither of which consults the resolved
 * maximum permissible error at all.
 *
 *  1. **Printing or data storage.** Load to about 50 % of Max, disturb the equilibrium by one
 *     action, and command a print or store as soon as possible. Read the indication over the
 *     five seconds that follow. §A.4.12: *"Stable equilibrium is considered to be achieved when
 *     no more than two adjacent values are indicated, one of which being the printed value."*
 *     Form 7 states the acceptance as: the first printed or stored value must not deviate by
 *     more than **1 e** from the readings during those five seconds.
 *
 *  2. **Zero-setting or tare balancing.** Apply the zero or tare load, disturb the equilibrium,
 *     immediately release zero-setting or tare, and compute the error the usual way —
 *     `E0 = I0 + ½e − ΔL − L0`. Form 7's acceptance is **|E0| ≤ 0.25 e**, a fixed fraction, not
 *     the mpe band. Performed five times.
 *
 * The 0.25 e and 1 e figures are the standard's own, printed on its form, so they are carried
 * as parameters with those defaults rather than resolved from a band that does not apply.
 *
 * A note on scale intervals: §A.4.12 says that for instruments with differentiated scale
 * divisions this paragraph applies to `e` rather than to `d`, which is why every threshold here
 * is in `e`.
 */

import type { Verdict } from "../types.js";

/** Thresholds, from R 76-2 form 7 and §A.4.12. Overridable from a rule pack. */
export interface K6Params {
  /** Form 7: the printed value must not deviate more than this many e from the 5 s readings. */
  printDeviationInE: number;
  /** §A.4.12: stable equilibrium means no more than this many adjacent values are indicated. */
  maxAdjacentValues: number;
  /** Form 7: |E0| must not exceed this fraction of e. */
  zeroSettingLimitInE: number;
  /** §A.4.12: the test is performed this many times. */
  requiredTrials: number;
}

export const K6_DEFAULTS: K6Params = {
  printDeviationInE: 1,
  maxAdjacentValues: 2,
  zeroSettingLimitInE: 0.25,
  requiredTrials: 5,
};

// ---------------------------------------------------------------------------
// Printing / data storage
// ---------------------------------------------------------------------------

export interface K6PrintTrial {
  /** The load carried during the trial — about 50 % of Max. */
  load: number;
  /** The first value printed or stored after the disturbance and command. */
  printedValue: number;
  /** Lowest indication observed during the 5 s following the print-out. */
  minimumReading: number;
  /** Highest indication observed during the same 5 s. */
  maximumReading: number;
  /**
   * How many distinct values were indicated during those 5 s, when the observer counted them.
   * §A.4.12's "no more than two adjacent values" is a count, not a spread, and an instrument
   * can satisfy the 1 e spread while cycling through three values.
   */
  distinctValuesIndicated?: number;
}

export interface K6PrintRow {
  load: number;
  printedValue: number;
  /** Largest deviation of the printed value from any reading in the window. */
  deviation: number;
  limit: number;
  /** True when the printed value lay outside the observed window entirely. */
  printedOutsideWindow: boolean;
  distinctValuesIndicated: number | null;
  tooManyValues: boolean;
  verdict: Verdict;
  reason: string;
}

export interface K6PrintResult {
  rows: K6PrintRow[];
  verdict: Verdict;
  /** Present when fewer than `requiredTrials` were performed. */
  note?: string;
}

/**
 * Check the print/store half of form 7.
 *
 * `e` is the verification scale interval — on a multi-interval instrument, the one applicable
 * at the applied load (§3.3.3).
 */
export function k6PrintStability(
  trials: K6PrintTrial[],
  e: number,
  params: Partial<K6Params> = {},
): K6PrintResult {
  const p = { ...K6_DEFAULTS, ...params };
  const limit = p.printDeviationInE * e;

  const rows: K6PrintRow[] = trials.map((t) => {
    // The printed value is compared against both ends of the observed window: the standard's
    // concern is that the printed figure is one the instrument was actually showing.
    const deviation = Math.max(
      Math.abs(t.printedValue - t.minimumReading),
      Math.abs(t.printedValue - t.maximumReading),
    );
    const printedOutsideWindow =
      t.printedValue < Math.min(t.minimumReading, t.maximumReading) - 1e-9 ||
      t.printedValue > Math.max(t.minimumReading, t.maximumReading) + 1e-9;

    const distinct = t.distinctValuesIndicated ?? null;
    const tooManyValues = distinct !== null && distinct > p.maxAdjacentValues;

    const withinLimit = deviation <= limit + 1e-9;
    const verdict: Verdict = withinLimit && !tooManyValues ? "PASSED" : "FAILED";

    const reasons: string[] = [
      `printed ${t.printedValue}, readings ${t.minimumReading}..${t.maximumReading}; ` +
        `deviation ${round(deviation)} against a limit of ${round(limit)} (${p.printDeviationInE} e).`,
    ];
    if (tooManyValues) {
      reasons.push(
        `${distinct} distinct values were indicated; stable equilibrium allows no more than ` +
          `${p.maxAdjacentValues} adjacent values, one of which is the printed value (A.4.12).`,
      );
    }
    if (printedOutsideWindow) {
      reasons.push("the printed value lies outside the range of readings observed.");
    }

    return {
      load: t.load,
      printedValue: t.printedValue,
      deviation,
      limit,
      printedOutsideWindow,
      distinctValuesIndicated: distinct,
      tooManyValues,
      verdict,
      reason: reasons.join(" "),
    };
  });

  return {
    rows,
    verdict: rows.length === 0 ? "NA" : rows.some((r) => r.verdict === "FAILED") ? "FAILED" : "PASSED",
    ...(rows.length > 0 && rows.length < p.requiredTrials
      ? {
          note:
            `Only ${rows.length} of the ${p.requiredTrials} trials required by A.4.12 were ` +
            `recorded.`,
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Zero-setting / tare balancing
// ---------------------------------------------------------------------------

export interface K6ZeroTrial {
  /** The zero load (< 4 % of Max) or the tare load (about 30 % of Max). */
  appliedLoad: number;
  /**
   * L0 — the small load (10 e) applied after releasing zero or tare. §A.4.12's footnote: only
   * applied when an automatic zero-setting or zero-tracking device is in operation.
   */
  l0: number;
  /** I0 — the indication after zero-setting or tare balancing. */
  indication: number;
  /** ΔL — additional load to the next changeover point. */
  additionalLoad?: number;
}

export interface K6ZeroRow {
  appliedLoad: number;
  l0: number;
  indication: number;
  additionalLoad: number;
  /** E0 = I0 + ½e − ΔL − L0. */
  error: number;
  limit: number;
  verdict: Verdict;
  reason: string;
}

export interface K6ZeroResult {
  rows: K6ZeroRow[];
  verdict: Verdict;
  note?: string;
}

/**
 * Check the zero-setting or tare-balancing half of form 7.
 *
 * `mode` only affects the wording of the reason; the arithmetic and the limit are the same for
 * both, which is what the form itself shows — two identically shaped tables, one acceptance.
 */
export function k6ZeroSetting(
  trials: K6ZeroTrial[],
  e: number,
  mode: "zero-setting" | "tare-balancing" = "zero-setting",
  params: Partial<K6Params> = {},
): K6ZeroResult {
  const p = { ...K6_DEFAULTS, ...params };
  const limit = p.zeroSettingLimitInE * e;

  const rows: K6ZeroRow[] = trials.map((t) => {
    const additionalLoad = t.additionalLoad ?? 0;
    // Form 7 prints the formula in full: E0 = I0 + 1/2 e - dL - L0.
    const error = t.indication + e / 2 - additionalLoad - t.l0;
    const verdict: Verdict = Math.abs(error) <= limit + 1e-9 ? "PASSED" : "FAILED";
    return {
      appliedLoad: t.appliedLoad,
      l0: t.l0,
      indication: t.indication,
      additionalLoad,
      error,
      limit,
      verdict,
      reason:
        `After ${mode} and a disturbance, E0 = ${round(t.indication)} + ${round(e / 2)} − ` +
        `${round(additionalLoad)} − ${round(t.l0)} = ${round(error)}; the limit is ` +
        `± ${round(limit)} (${p.zeroSettingLimitInE} e, R 76-2 form 7).`,
    };
  });

  return {
    rows,
    verdict: rows.length === 0 ? "NA" : rows.some((r) => r.verdict === "FAILED") ? "FAILED" : "PASSED",
    ...(rows.length > 0 && rows.length < p.requiredTrials
      ? { note: `Only ${rows.length} of the ${p.requiredTrials} trials required by A.4.12 were recorded.` }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// The whole form
// ---------------------------------------------------------------------------

export interface K6Input {
  /** The verification scale interval applicable at the test load. */
  e: number;
  printTrials?: K6PrintTrial[];
  zeroSettingTrials?: K6ZeroTrial[];
  tareBalancingTrials?: K6ZeroTrial[];
  /**
   * §A.4.12 also asks the examiner to confirm from the documentation that the stable-equilibrium
   * function is described, that printing is impossible before equilibrium, and that no function
   * requiring equilibrium can be performed under continuous disturbance. Those are examinations,
   * not measurements, so they enter as recorded answers rather than being computed.
   */
  documentationChecks?: {
    functionDescribed?: boolean;
    parametersDescribedAndSecured?: boolean;
    worstCaseDefined?: boolean;
    printingInhibitedBeforeEquilibrium?: boolean;
    functionsInhibitedUnderDisturbance?: boolean;
  };
  params?: Partial<K6Params>;
}

export interface K6Result {
  print: K6PrintResult;
  zeroSetting: K6ZeroResult;
  tareBalancing: K6ZeroResult;
  /** Documentation answers that were recorded as "no". */
  failedDocumentationChecks: string[];
  verdict: Verdict;
}

const DOC_LABEL: Record<string, string> = {
  functionDescribed: "the stable-equilibrium principle, function and criteria are described",
  parametersDescribedAndSecured: "its adjustable parameters are described and secured",
  worstCaseDefined: "the most critical adjustment (worst case) is defined and covers all variants",
  printingInhibitedBeforeEquilibrium: "printing or storing is impossible before equilibrium is reached",
  functionsInhibitedUnderDisturbance:
    "no function requiring stable equilibrium can be performed under continuous disturbance",
};

export function k6StabilityOfEquilibrium(input: K6Input): K6Result {
  const params = input.params ?? {};
  const print = k6PrintStability(input.printTrials ?? [], input.e, params);
  const zeroSetting = k6ZeroSetting(input.zeroSettingTrials ?? [], input.e, "zero-setting", params);
  const tareBalancing = k6ZeroSetting(
    input.tareBalancingTrials ?? [], input.e, "tare-balancing", params,
  );

  const failedDocumentationChecks = Object.entries(input.documentationChecks ?? {})
    .filter(([, answered]) => answered === false)
    .map(([key]) => DOC_LABEL[key] ?? key);

  const parts = [print.verdict, zeroSetting.verdict, tareBalancing.verdict];
  const anyFailed = parts.includes("FAILED") || failedDocumentationChecks.length > 0;
  const anyTested = parts.some((v) => v !== "NA");

  return {
    print,
    zeroSetting,
    tareBalancing,
    failedDocumentationChecks,
    // A form on which nothing was recorded is not a pass. It is not applicable, and the
    // report says "– –" rather than implying the instrument was examined and found sound.
    verdict: anyFailed ? "FAILED" : anyTested ? "PASSED" : "NA",
  };
}

function round(n: number): number {
  return Number(n.toFixed(6));
}
