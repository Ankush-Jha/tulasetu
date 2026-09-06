/**
 * Family / EUT solver.
 *
 * R 76-1:2006 §3.10.4 "Testing of a family of instruments or modules" — when a
 * manufacturer submits a family of variants (differing Max, e, d, n, ...) for one type
 * examination, this module decides which variants must actually be tested (the
 * "Equipment Under Test", EUT) and which are covered by test of another variant without
 * being tested themselves, and emits the certificate's own "shall also cover ..." clause
 * (CLAUDE.md §6 — this is a product differentiator, not just an internal computation).
 *
 * Primary source: docs/standards/extracted/OIML_R76-1_2006_requirements.txt, §3.10.4.1 to
 * §3.10.4.6 (lines ~1690-1821), including the worked example (Table 8 / Table 9, page 39-40)
 * used below as the golden test in tests/family.test.ts.
 *
 * Rules encoded:
 *  §3.10.4.2 — at least the variant with the highest n and the variant with the smallest e
 *              shall be EUTs; one EUT suffices if a single variant has both characteristics.
 *  §3.10.4.3 — a non-EUT variant needs no test if, relative to some already-selected EUT
 *              ("test" subscript below):
 *                (bullet 1) its Max falls between two *tested* capacities whose ratio does
 *                           not exceed `max_capacity_ratio` (standard: 10); or
 *                (bullet 2) n <= n_test AND e >= e_test AND
 *                           Max <= max_multiplier x Max_test x (n_test / n)  (standard: 5).
 *              All three bullet-2 conditions and the bullet-1 ratio bound are read as
 *              inclusive (<=, >=) — the standard's own worked example accepts a ratio of
 *              exactly 10 (variants 2.2/2.3 bracketed by 2.1/2.4) and a Max of exactly
 *              5 x Max_test (variant 1.3 vs 1.2), so equality must pass, not just fall short.
 *  §3.10.4.4 — an EUT tested completely for one class covers partial (not-yet-covered)
 *              tests for a lower-class EUT of the same family. This is a *test-scope*
 *              reduction, not a selection criterion, and is surfaced only as a note.
 *  §3.10.4.6 — the certificate must record, per family, the summary of metrologically
 *              relevant characteristics (highest n, lowest e, all classes, all temperature
 *              ranges, ...) — modelled here as `FamilySummary` (the "Table 9" form).
 *
 * INTERPRETIVE CHOICE (documented, not hidden — see PROMPT.md's hint about variant 1.1):
 * the standard's prose for 1.1 ("needs not be tested, because it has the same e and d as
 * variant 1.2; only Max is reduced") reads as an informal special case rather than a literal
 * bullet-1 or bullet-2 citation. Checked against the numbers, 1.1 in fact satisfies bullet 2
 * verbatim (n=20000 <= n_test=40000, e=0.01 >= e_test=0.01, Max=200 <= 5x400x(40000/20000)
 * =4000): so this solver classifies 1.1 under bullet 2, which is a faithful, mechanical
 * generalisation of the standard's own reasoning ("same e" is simply the equality case of
 * "e >= e_test"), not an invented rule. This is flagged so a reviewer can re-derive it.
 *
 * ALGORITHM (deterministic, not exhaustive search): §3.10.4.2 fixes the mandatory initial
 * EUT(s). Remaining variants are then walked in ascending Max order, each checked against
 * the *current* EUT set; a variant that is not excused is promoted to EUT before moving to
 * the next (larger) variant. This single ascending pass reproduces Table 8 exactly (2.4 is
 * promoted because 2.5 cannot be excused via 2.1 alone; once promoted, 2.5 is excused via
 * 2.4). It is a greedy minimal-bridge heuristic, not a proof of global minimality across all
 * possible EUT sets — for the shapes in R 76-1's own example it produces the standard's
 * answer, but a pathological family could in principle admit a smaller alternative set.
 *
 * Engine is PURE: no I/O, no randomness. `id` ordering ties are broken with a natural
 * (numeric-aware) string compare so results are stable regardless of input order.
 */

import type { AccuracyClass, Issue, MassUnit } from "./types.js";
import type { RulePack } from "./rulepack.js";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/** One variant of a family submitted for type examination (R 76-1 §3.10.4). */
export interface Variant {
  /** Stable identifier, e.g. "1.2" (matches the standard's own Table 8 numbering). */
  id: string;
  /** Family label. Variants that omit it are treated as one implicit family. */
  family?: string;
  accuracyClass: AccuracyClass;
  /** Maximum capacity, Max, in `unit`. */
  max: number;
  /** Verification scale interval, e, in `unit`. */
  e: number;
  /** Actual scale interval, d, in `unit`. */
  d: number;
  /** Number of verification scale intervals. Derived as max/e when absent. */
  n?: number;
  /** Defaults to "g" — see toGrams() below. */
  unit?: MassUnit;
  temperatureRange?: { minC: number; maxC: number };
  /**
   * §3.10.4.5 "other features to be considered" — different housings, load receptors,
   * instrument functions, indications, etc. This solver does not attempt to model whether
   * a feature forces an additional EUT (that judgement call belongs to the testing
   * authority); it only carries the flags through into `notes` so they are not silently lost.
   */
  distinguishingFeatures?: string[];
}

export interface FamilySolverOptions {
  /**
   * §3.10.4.3 bullet 1 — ratio ceiling between two tested (bracketing) capacities.
   * Not present in OIML_R76_2006.json today as `family_solver.max_capacity_ratio` — this
   * falls back to the pack value if present, else this option, else the standard's own
   * number (10), read from §3.10.4.3 line "The ratio between the tested capacities shall
   * not exceed 10".
   */
  maxCapacityRatio?: number;
  /**
   * §3.10.4.3 bullet 2c multiplier — not present in OIML_R76_2006.json today as
   * `family_solver.max_multiplier`. Falls back the same way; standard's own number is 5
   * ("Max <= 5 x Max_test x (n_test / n)").
   */
  maxMultiplier?: number;
}

const STANDARD_MAX_CAPACITY_RATIO = 10; // R 76-1 §3.10.4.3, bullet 1
const STANDARD_MAX_MULTIPLIER = 5; // R 76-1 §3.10.4.3, bullet 2 c)

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface EutSelection {
  eut: boolean;
  variant: Variant;
  /** Human-readable reasoning, fit to print next to the variant on the certificate annex. */
  justification: string;
  /** Clause reference driving this row's classification. */
  clause: string;
}

/** R 76-1 Table 9 — "Summary of the metrological characteristics presented in the OIML Certificate". */
export interface FamilySummary {
  family: string;
  accuracyClass: AccuracyClass;
  maxRange: { min: number; max: number; minLabel: string; maxLabel: string };
  eRange: { min: number; max: number; minLabel: string; maxLabel: string };
  dRange: { min: number; max: number; minLabel: string; maxLabel: string };
  /** n <= this value covers every variant in the family (R 76-1 Table 9 shows "n <= ..."). */
  nMax: number;
  temperatureRange?: { minC: number; maxC: number };
  eutIds: string[];
}

export interface FamilySolverResult {
  selections: EutSelection[];
  /** The certificate's own "shall also cover ..." prose, one paragraph per family. */
  coverageClause: string;
  summary: FamilySummary[];
  /** Non-fatal findings: heterogeneous class/temperature within a family, defaults used, etc. */
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function effectiveN(v: Variant): number {
  return v.n ?? v.max / v.e;
}

/** Natural (numeric-aware) compare so "1.2" < "1.10", used only to break ties deterministically. */
function idCompare(a: Variant, b: Variant): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

const UNIT_TO_GRAMS: Record<MassUnit, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 };

function toGrams(value: number, unit: MassUnit | undefined): number {
  return value * UNIT_TO_GRAMS[unit ?? "g"];
}

/** Format a gram quantity back into a human-friendly "X kg" / "X g" label for the clause text. */
function formatGrams(g: number): string {
  if (g >= 1_000_000 && g % 1_000_000 === 0) return `${g / 1_000_000} t`;
  if (g >= 1000) return `${round(g / 1000, 6)} kg`;
  return `${round(g, 6)} g`;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function fmtN(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

// ---------------------------------------------------------------------------
// §3.10.4.3 exclusion test
// ---------------------------------------------------------------------------

interface ExcusalResult {
  excused: boolean;
  /** Present iff excused. */
  justification?: string;
  clause?: string;
  /** Present iff not excused — used to build the "promoted to EUT" message. */
  failureNote?: string;
}

/**
 * Whether `v` can be accepted without testing, relative to the variants already in `euts`
 * (all in grams). Implements §3.10.4.3's two bullets, both read inclusively (see module doc).
 */
function checkExcusal(
  vMaxG: number,
  vEG: number,
  vN: number,
  vId: string,
  euts: { id: string; maxG: number; eG: number; n: number }[],
  maxCapacityRatio: number,
  maxMultiplier: number,
): ExcusalResult {
  // Bullet 1: Max falls between two tested capacities, ratio(tested) <= max_capacity_ratio.
  // Use the tightest bracket available (closest EUT at/below and at/above `v`).
  const below = euts.filter((t) => t.maxG <= vMaxG).sort((a, b) => b.maxG - a.maxG)[0];
  const above = euts.filter((t) => t.maxG >= vMaxG).sort((a, b) => a.maxG - b.maxG)[0];
  if (below && above && below.id !== above.id) {
    const ratio = above.maxG / below.maxG;
    if (ratio <= maxCapacityRatio) {
      return {
        excused: true,
        clause: "R 76-1 §3.10.4.3 (capacity-bracket bullet)",
        justification:
          `Max (${formatGrams(vMaxG)}) falls between tested capacities ${below.id} ` +
          `(${formatGrams(below.maxG)}) and ${above.id} (${formatGrams(above.maxG)}); ` +
          `their ratio ${round(ratio, 3)} does not exceed ${maxCapacityRatio}.`,
      };
    }
  }

  // Bullet 2: n <= n_test AND e >= e_test AND Max <= max_multiplier x Max_test x (n_test / n).
  for (const t of euts) {
    const a = vN <= t.n;
    const b = vEG >= t.eG;
    const bound = maxMultiplier * t.maxG * (t.n / vN);
    const c = vMaxG <= bound;
    if (a && b && c) {
      return {
        excused: true,
        clause: "R 76-1 §3.10.4.3 (n / e / Max bullet)",
        justification:
          `Relative to EUT ${t.id}: n ${fmtN(vN)} <= n_test ${fmtN(t.n)}, ` +
          `e ${formatGrams(vEG)} >= e_test ${formatGrams(t.eG)}, and ` +
          `Max ${formatGrams(vMaxG)} <= ${maxMultiplier} x Max_test (${formatGrams(t.maxG)}) x ` +
          `(n_test/n = ${round(t.n / vN, 4)}) = ${formatGrams(bound)}.`,
      };
    }
  }

  return {
    excused: false,
    failureNote: `id=${vId} satisfies neither the capacity-bracket bullet nor the n/e/Max bullet against {${euts
      .map((t) => t.id)
      .join(", ")}}.`,
  };
}

// ---------------------------------------------------------------------------
// Per-family solve
// ---------------------------------------------------------------------------

interface NormVariant {
  v: Variant;
  maxG: number;
  eG: number;
  dG: number;
  n: number;
}

function solveGroup(
  variants: Variant[],
  maxCapacityRatio: number,
  maxMultiplier: number,
): { selections: EutSelection[]; eutIds: string[] } {
  const norm: NormVariant[] = variants
    .map((v) => ({
      v,
      maxG: toGrams(v.max, v.unit),
      eG: toGrams(v.e, v.unit),
      dG: toGrams(v.d, v.unit),
      n: effectiveN(v),
    }))
    .sort((a, b) => idCompare(a.v, b.v));

  const maxN = Math.max(...norm.map((x) => x.n));
  const minEG = Math.min(...norm.map((x) => x.eG));

  // §3.10.4.2 — at least the highest-n variant and the smallest-e variant must be EUTs;
  // one EUT suffices if some variant has both characteristics simultaneously.
  const both = norm.filter((x) => x.n === maxN && x.eG === minEG);
  const justifications = new Map<string, { text: string; clause: string }>();
  let initial: NormVariant[];
  if (both.length > 0) {
    initial = [both[0]!];
    justifications.set(initial[0]!.v.id, {
      clause: "R 76-1 §3.10.4.2",
      text:
        `Selected as EUT: has both the family's highest n (${fmtN(maxN)}) and its smallest ` +
        `e (${formatGrams(minEG)}); one EUT suffices when a single variant has both characteristics.`,
    });
  } else {
    const highestN = norm.find((x) => x.n === maxN)!;
    const smallestE = norm.find((x) => x.eG === minEG)!;
    initial = highestN.v.id === smallestE.v.id ? [highestN] : [highestN, smallestE];
    for (const x of initial) {
      const reasons: string[] = [];
      if (x.n === maxN) reasons.push(`highest n in the family (${fmtN(maxN)})`);
      if (x.eG === minEG) reasons.push(`smallest e in the family (${formatGrams(minEG)})`);
      justifications.set(x.v.id, {
        clause: "R 76-1 §3.10.4.2",
        text: `Selected as EUT: ${reasons.join(" and ")}.`,
      });
    }
  }

  const eutIds = new Set(initial.map((x) => x.v.id));
  const eutRefs = () => norm.filter((x) => eutIds.has(x.v.id));

  // Walk remaining variants ascending by Max; promote any that isn't excused by the *current*
  // EUT set before moving on to the (larger) next one. See module doc for why this ordering
  // reproduces the standard's own Table 8 answer in one forward pass.
  const remaining = norm
    .filter((x) => !eutIds.has(x.v.id))
    .sort((a, b) => a.maxG - b.maxG || idCompare(a.v, b.v));

  for (const x of remaining) {
    const euts = eutRefs().map((t) => ({ id: t.v.id, maxG: t.maxG, eG: t.eG, n: t.n }));
    const result = checkExcusal(x.maxG, x.eG, x.n, x.v.id, euts, maxCapacityRatio, maxMultiplier);
    if (result.excused) {
      justifications.set(x.v.id, { clause: result.clause!, text: result.justification! });
    } else {
      eutIds.add(x.v.id);
      justifications.set(x.v.id, {
        clause: "R 76-1 §3.10.4.3",
        text: `Required as EUT: not excused under R 76-1 §3.10.4.3 — ${result.failureNote} Promoted to EUT rather than left untested.`,
      });
    }
  }

  const selections: EutSelection[] = norm
    .map((x) => {
      const j = justifications.get(x.v.id)!;
      return { eut: eutIds.has(x.v.id), variant: x.v, justification: j.text, clause: j.clause };
    })
    .sort((a, b) => idCompare(a.variant, b.variant));

  return { selections, eutIds: [...eutIds].sort() };
}

// ---------------------------------------------------------------------------
// Table-9-style summary and the "shall also cover" clause
// ---------------------------------------------------------------------------

function buildSummary(family: string, variants: Variant[], eutIds: string[], issues: Issue[]): FamilySummary {
  const classes = new Set(variants.map((v) => v.accuracyClass));
  if (classes.size > 1) {
    issues.push({
      severity: "warning",
      code: "W_FAMILY_HETEROGENEOUS_CLASS",
      message: `Family "${family}" mixes accuracy classes {${[...classes].join(", ")}}; R 76-1 §3.10.4.4 assumes one class per family (a lower-class EUT reuses a higher-class EUT's completed tests, it does not span classes within one family summary).`,
      clause: "R 76-1 §3.10.4.4",
    });
  }
  const accuracyClass = variants[0]!.accuracyClass;

  const maxesG = variants.map((v) => toGrams(v.max, v.unit));
  const esG = variants.map((v) => toGrams(v.e, v.unit));
  const dsG = variants.map((v) => toGrams(v.d, v.unit));
  const nMax = Math.max(...variants.map((v) => effectiveN(v)));

  const temps = variants.map((v) => v.temperatureRange).filter((t): t is { minC: number; maxC: number } => !!t);
  let temperatureRange: { minC: number; maxC: number } | undefined;
  if (temps.length > 0) {
    const minC = Math.min(...temps.map((t) => t.minC));
    const maxC = Math.max(...temps.map((t) => t.maxC));
    temperatureRange = { minC, maxC };
    if (temps.length !== variants.length || temps.some((t) => t.minC !== minC || t.maxC !== maxC)) {
      issues.push({
        severity: "warning",
        code: "W_FAMILY_HETEROGENEOUS_TEMP",
        message: `Family "${family}" has variants with differing or missing temperature ranges; summary reports the widest envelope (${minC}°C / ${maxC}°C) per R 76-1 §3.10.4.6.`,
        clause: "R 76-1 §3.10.4.6",
      });
    }
  }

  const minMaxG = Math.min(...maxesG);
  const maxMaxG = Math.max(...maxesG);
  const minEG = Math.min(...esG);
  const maxEG = Math.max(...esG);
  const minDG = Math.min(...dsG);
  const maxDG = Math.max(...dsG);

  return {
    family,
    accuracyClass,
    maxRange: { min: minMaxG, max: maxMaxG, minLabel: formatGrams(minMaxG), maxLabel: formatGrams(maxMaxG) },
    eRange: { min: minEG, max: maxEG, minLabel: formatGrams(minEG), maxLabel: formatGrams(maxEG) },
    dRange: { min: minDG, max: maxDG, minLabel: formatGrams(minDG), maxLabel: formatGrams(maxDG) },
    nMax,
    temperatureRange,
    eutIds,
  };
}

function buildCoverageClause(summaries: FamilySummary[]): string {
  if (summaries.length === 0) return "";
  const paragraphs = summaries.map((s) => {
    const temp = s.temperatureRange
      ? `, temperature range ${s.temperatureRange.minC} °C to ${s.temperatureRange.maxC} °C`
      : "";
    return (
      `for family "${s.family}" (accuracy class ${s.accuracyClass}; EUT(s) tested: ${s.eutIds.join(", ")}) ` +
      `this approval shall also cover Max up to ${s.maxRange.maxLabel} (from ${s.maxRange.minLabel}), ` +
      `n in range up to ${fmtN(s.nMax)} for e ≥ ${s.eRange.minLabel} (e up to ${s.eRange.maxLabel}), ` +
      `d from ${s.dRange.minLabel} to ${s.dRange.maxLabel}${temp}`
    );
  });
  return (
    `This type approval shall also cover, in addition to the tested EUT(s): ${paragraphs.join("; and ")}. ` +
    `Coverage is subject to R 76-1 §3.10.4.3 (variants outside these declared limits, or not excusable ` +
    `by its bullets against a tested EUT, require separate type evaluation) and §3.10.4.6 (all other ` +
    `metrologically relevant features listed there must independently be common to a tested EUT). Reported ` +
    `ranges reflect the submitted variants only; R 76-1 Table 9's note that Max may be reduced further for an ` +
    `identical instrument meeting Table 3 is not automated here and should be checked separately.`
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function solveFamily(
  variants: Variant[],
  pack: RulePack,
  options: FamilySolverOptions = {},
): FamilySolverResult {
  const issues: Issue[] = [];

  const packRatio = (pack.family_solver as { max_capacity_ratio?: number } | undefined)?.max_capacity_ratio;
  const packMultiplier = (pack.family_solver as { max_multiplier?: number } | undefined)?.max_multiplier;
  const maxCapacityRatio = packRatio ?? options.maxCapacityRatio ?? STANDARD_MAX_CAPACITY_RATIO;
  const maxMultiplier = packMultiplier ?? options.maxMultiplier ?? STANDARD_MAX_MULTIPLIER;
  if (packRatio === undefined || packMultiplier === undefined) {
    issues.push({
      severity: "info",
      code: "I_FAMILY_SOLVER_DEFAULTS_USED",
      message:
        `Rule pack "${pack.ruleset_id}" does not declare family_solver.max_capacity_ratio and/or ` +
        `family_solver.max_multiplier; using R 76-1 §3.10.4.3's own numbers as defaults ` +
        `(ratio <= ${STANDARD_MAX_CAPACITY_RATIO}, multiplier = ${STANDARD_MAX_MULTIPLIER}). ` +
        `Recommend adding both fields to the pack so this stops being a code-level default.`,
      clause: "R 76-1 §3.10.4.3",
    });
  }

  const groups = new Map<string, Variant[]>();
  for (const v of variants) {
    const key = v.family ?? "__default__";
    const list = groups.get(key);
    if (list) list.push(v);
    else groups.set(key, [v]);
  }

  const familyNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const selections: EutSelection[] = [];
  const summaries: FamilySummary[] = [];
  for (const name of familyNames) {
    const groupVariants = groups.get(name)!;
    const { selections: groupSelections, eutIds } = solveGroup(groupVariants, maxCapacityRatio, maxMultiplier);
    selections.push(...groupSelections);
    summaries.push(buildSummary(name, groupVariants, eutIds, issues));

    for (const v of groupVariants) {
      if (v.distinguishingFeatures && v.distinguishingFeatures.length > 0) {
        issues.push({
          severity: "info",
          code: "I_FAMILY_DISTINGUISHING_FEATURES",
          message:
            `Variant ${v.id} declares distinguishing feature(s) {${v.distinguishingFeatures.join(", ")}} ` +
            `(R 76-1 §3.10.4.5). Whether these require additional partial testing on this or another EUT is ` +
            `a testing-authority judgement call this solver does not automate.`,
          path: v.id,
          clause: "R 76-1 §3.10.4.5",
        });
      }
    }
  }

  const coverageClause = buildCoverageClause(summaries);

  return { selections, coverageClause, summary: summaries, issues };
}
