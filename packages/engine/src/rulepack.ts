/**
 * Rule packs: the standard as data.
 *
 * CLAUDE.md design rule #2 — no threshold, band boundary or clause number is ever
 * written in code. R 76 is being restructured from 2 parts into 5; India's Seventh
 * Schedule differs subtly from OIML. Both are supported by swapping a JSON pack.
 *
 * This module is the *contract*: the TypeScript shape of a pack, a normalizer for
 * class symbols, and a structural validator. It performs no I/O — callers pass a
 * parsed object in.
 */

import type { AccuracyClass, KernelId } from "./types.js";
import type { Issue } from "./types.js";

// ---------------------------------------------------------------------------
// Pack shape
// ---------------------------------------------------------------------------

/** One row of R 76-1 Table 3 (= India Table 17): class limits by e range. */
export interface ClassificationRow {
  class: AccuracyClass;
  /** Lower bound of e for this row, in grams. Inclusive. */
  e_min_g: number;
  /** Upper bound of e for this row, in grams. Inclusive. `null` = unbounded. */
  e_max_g: number | null;
  n_min: number;
  n_max: number | null;
  /** Minimum capacity expressed as a multiple of e, e.g. "20e". */
  min_capacity: string;
}

/**
 * One band of R 76-1 Table 6 (= India Table 20).
 * `max_m_in_e[class]` is the inclusive upper bound of m = load / e for that band.
 * `null` means the band is unbounded above for that class (only ±1.5e, class I).
 */
export interface MpeBand {
  /** "0.5e" | "1.0e" | "1.5e" — the factor is parsed from this. */
  limit: string;
  max_m_in_e: Partial<Record<AccuracyClass, number | null>>;
}

/** Declarative applicability predicate for one R 76-2 form. */
export interface TestRule {
  /** Rule-pack test id, e.g. "weighing_performance". */
  id: string;
  /** R 76-2 form number, e.g. "1", "3.1", "12.7". */
  form: string;
  kernel: KernelId;
  /** Human title as printed on the form. */
  title?: string;
  /** Clause reference into the standard, e.g. "A.4.4". */
  clause?: string;
  applies?: Record<string, unknown>;
  params?: Record<string, unknown>;
  /**
   * Which exclusion sentence this rule shares with others.
   *
   * R 76-2 prints the disturbance tests as nine separate forms (12.1 to 12.6, plus 12.7a/b)
   * and damp heat as three (13a/b/c), but the reason each is inapplicable is one sentence:
   * the instrument has no electronic parts. Grouping them here keeps that sentence in the
   * rule pack's hands rather than making the engine carry a list of ids to stay in step with.
   * Defaults to `id`.
   */
  reason_group?: string;
  /** "last" forces this form to the end of the test list (endurance). */
  order?: "last";
  note?: string;
  extra?: string;
}

export interface RulePack {
  ruleset_id: string;
  edition?: string;
  description?: string;
  /** Canonical symbol -> accepted aliases. India: "IIII" <- ["IV"]. */
  class_aliases?: Record<string, string[]>;
  accuracy_classes?: AccuracyClass[];
  /** Permitted mantissas for e: 1, 2, 5 x 10^k. */
  e_form?: number[];
  classification: ClassificationRow[];
  mpe_bands_initial: MpeBand[];
  /** R 76-1 §3.5.2 — in-service mpe = factor x initial. */
  mpe_in_service_factor?: number;
  /** R 76-1 Table 4 — Max_i / e_{i+1} >= this, by class. */
  multi_interval_boundary?: Partial<Record<AccuracyClass, number>>;
  /** R 76-1 §3.5.3.2 — expressed as data so a future edition can change it. */
  rounding_elimination_when?: string;
  module_error_fractions?: {
    rule?: string;
    p_max?: number;
    digital_module_may_be_zero?: boolean;
    typical?: Record<string, number>;
  };
  family_solver?: {
    eut_must_include?: string[];
    accept_without_test_if?: string[];
    /** R 76-1 §3.10.4.3 first bullet — ratio between bracketing tested capacities. */
    max_capacity_ratio?: number;
    /** R 76-1 §3.10.4.3 c) — the multiplier in Max <= k x Max_test x (n_test / n). */
    max_multiplier?: number;
  };
  tests: TestRule[];
  checklists?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Class-symbol normalization (CLAUDE.md design rule #6)
// ---------------------------------------------------------------------------

/** Built-in fallback aliases, used when a pack declares none. */
const DEFAULT_ALIASES: Record<string, string[]> = { IIII: ["IV"] };

/**
 * Normalize a written accuracy-class symbol to its canonical OIML form.
 *
 * India's Seventh Schedule uses "IV" in its tables and "IIII" in its test-procedure
 * text — in the same document. Certificates additionally write prose like
 * "Medium Accuracy (III)" or "Class III". All of that resolves here.
 *
 * Returns `undefined` when nothing recognizable is found, so callers can raise an Issue.
 */
export function normalizeClass(
  input: string,
  pack?: Pick<RulePack, "class_aliases">,
): AccuracyClass | undefined {
  const aliases = pack?.class_aliases ?? DEFAULT_ALIASES;

  // Uppercase, then keep only the roman-numeral characters that can spell a class.
  const upper = input.toUpperCase();

  // Longest-first so "IIII" wins over "III", and "III" over "II", over "I".
  const candidates = ["IIII", "III", "II", "I"];

  // Build alias -> canonical, longest alias first.
  const aliasPairs: [string, string][] = [];
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const a of list) aliasPairs.push([a.toUpperCase(), canonical]);
  }
  aliasPairs.sort((a, b) => b[0].length - a[0].length);

  // Aliases are checked first: "IV" must not be mistaken for "I" followed by junk.
  for (const [alias, canonical] of aliasPairs) {
    if (wordish(upper, alias)) return canonical as AccuracyClass;
  }
  for (const c of candidates) {
    if (wordish(upper, c)) return c as AccuracyClass;
  }
  return undefined;
}

/** True when `needle` appears in `hay` not adjacent to another roman-numeral letter. */
function wordish(hay: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = i > 0 ? hay[i - 1] : "";
    const after = i + needle.length < hay.length ? hay[i + needle.length] : "";
    const isRoman = (c: string) => c === "I" || c === "V" || c === "X";
    if (!isRoman(before ?? "") && !isRoman(after ?? "")) return true;
    from = i + 1;
  }
}

// ---------------------------------------------------------------------------
// Band helpers
// ---------------------------------------------------------------------------

/** Parse "0.5e" | "1.0e" | "1.5e" -> 0.5 | 1.0 | 1.5. */
export function parseBandFactor(limit: string): 0.5 | 1.0 | 1.5 {
  const m = /^([0-9]*\.?[0-9]+)\s*e$/i.exec(limit.trim());
  if (!m || m[1] === undefined) {
    throw new Error(`Rule pack: unparseable mpe band limit ${JSON.stringify(limit)}`);
  }
  const v = Number(m[1]);
  if (v !== 0.5 && v !== 1.0 && v !== 1.5) {
    throw new Error(`Rule pack: unexpected mpe band factor ${v} (expected 0.5, 1.0 or 1.5)`);
  }
  return v as 0.5 | 1.0 | 1.5;
}

/** Parse "20e" | "100d" -> { multiple: 20, of: "e" }. */
export function parseMinCapacity(spec: string): { multiple: number; of: "e" | "d" } {
  const m = /^([0-9]+(?:\.[0-9]+)?)\s*([ed])$/i.exec(spec.trim());
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(`Rule pack: unparseable min_capacity ${JSON.stringify(spec)}`);
  }
  return { multiple: Number(m[1]), of: m[2].toLowerCase() as "e" | "d" };
}

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

/**
 * Check a parsed pack for the invariants the engine relies on.
 * Returns Issues rather than throwing — a bad pack must be reportable, not fatal.
 */
export function validateRulePack(pack: unknown): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, path?: string) =>
    issues.push({ severity: "error", code, message, ...(path ? { path } : {}) });

  if (typeof pack !== "object" || pack === null) {
    err("E_PACK_NOT_OBJECT", "Rule pack must be an object.");
    return issues;
  }
  const p = pack as Partial<RulePack>;

  if (!p.ruleset_id) err("E_PACK_NO_ID", "Rule pack is missing ruleset_id.", "ruleset_id");

  if (!Array.isArray(p.classification) || p.classification.length === 0) {
    err("E_PACK_NO_CLASSIFICATION", "Rule pack has no classification table.", "classification");
  }

  if (!Array.isArray(p.mpe_bands_initial) || p.mpe_bands_initial.length === 0) {
    err("E_PACK_NO_MPE_BANDS", "Rule pack has no mpe_bands_initial.", "mpe_bands_initial");
  } else {
    p.mpe_bands_initial.forEach((band, i) => {
      try {
        parseBandFactor(band.limit);
      } catch (e) {
        err("E_PACK_BAD_BAND", (e as Error).message, `mpe_bands_initial[${i}].limit`);
      }
      if (typeof band.max_m_in_e !== "object" || band.max_m_in_e === null) {
        err("E_PACK_BAD_BAND", "Band has no max_m_in_e map.", `mpe_bands_initial[${i}].max_m_in_e`);
      }
    });

    // Bands must be ascending in m for every class they mention, so the resolver can
    // pick the first band whose bound the load satisfies.
    const classes = new Set<string>();
    for (const b of p.mpe_bands_initial) for (const k of Object.keys(b.max_m_in_e ?? {})) classes.add(k);
    for (const cls of classes) {
      let prev = -Infinity;
      p.mpe_bands_initial.forEach((b, i) => {
        const v = b.max_m_in_e?.[cls as AccuracyClass];
        if (v === undefined) return;
        if (v === null) {
          prev = Infinity;
          return;
        }
        if (v <= prev) {
          err(
            "E_PACK_BANDS_NOT_ASCENDING",
            `mpe bands for class ${cls} are not ascending in m (${prev} then ${v}).`,
            `mpe_bands_initial[${i}].max_m_in_e.${cls}`,
          );
        }
        prev = v;
      });
    }
  }

  if (!Array.isArray(p.tests) || p.tests.length === 0) {
    err("E_PACK_NO_TESTS", "Rule pack declares no tests.", "tests");
  } else {
    const seen = new Set<string>();
    p.tests.forEach((t, i) => {
      if (!t.id) err("E_PACK_TEST_NO_ID", "Test entry has no id.", `tests[${i}]`);
      else if (seen.has(t.id)) err("E_PACK_TEST_DUP_ID", `Duplicate test id ${t.id}.`, `tests[${i}].id`);
      else seen.add(t.id);
      if (!t.kernel) err("E_PACK_TEST_NO_KERNEL", `Test ${t.id} declares no kernel.`, `tests[${i}].kernel`);
    });
  }

  return issues;
}
