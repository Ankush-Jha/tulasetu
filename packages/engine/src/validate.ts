/**
 * Input validation layer: engine-side sanity checks on an InstrumentProfile, on a set
 * of WeighingObservation rows, and on a software-identification / checksum field.
 *
 * Every function here returns Issue[] and never throws for a *data* problem -- a bad
 * profile or a garbled checksum must be reportable to the operator, not fatal. (A
 * malformed rule pack is a different matter -- see applicability.ts / rulepack.ts,
 * which do throw, deliberately, on authoring bugs in the pack itself.)
 *
 * Primary sources:
 *   docs/standards/extracted/OIML_R76-1_2006_requirements.txt
 *     - Table 2 / §3.4.2 (e-form and the d < e <= 10 d relationship)
 *     - Table 3 / §3.2 (classification: e range <-> n range <-> Min, by class)
 *     - Table 4 / §3.3 (multi-interval: Max_i / e_{i+1}, e_{i+1} > e_i, Min_i = Max_{i-1})
 *     - Annex G (software identification / checksum requirements for software-
 *       controlled instruments)
 *   docs/certificates/certificates-analysis.md
 *     - "THE CHECKSUM AUDIT": the real national register's checksum-field defect
 *       classes this module is designed to catch (file sizes, moduli, 4-char stubs,
 *       template filler, cross-certificate duplicates).
 */

import type { AccuracyClass, Issue, InstrumentProfile, MassUnit, PartialRange, WeighingObservation } from "./types.js";
import { parseMinCapacity, type ClassificationRow, type RulePack } from "./rulepack.js";
import { toGrams } from "./applicability.js";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function err(code: string, message: string, extra?: { path?: string; clause?: string }): Issue {
  return { severity: "error", code, message, ...extra };
}
function warn(code: string, message: string, extra?: { path?: string; clause?: string }): Issue {
  return { severity: "warning", code, message, ...extra };
}
function info(code: string, message: string, extra?: { path?: string; clause?: string }): Issue {
  return { severity: "info", code, message, ...extra };
}

/** Normalize e (or d) to its mantissa in [1, 10) and decimal exponent: 500 -> (5, 2). */
function mantissaAndExponent(value: number): { mantissa: number; exponent: number } {
  if (value <= 0 || !Number.isFinite(value)) return { mantissa: NaN, exponent: NaN };
  let v = value;
  let exp = 0;
  // Guard iteration count against pathological inputs (denormals, huge numbers).
  for (let i = 0; i < 400 && v >= 10; i++) {
    v /= 10;
    exp++;
  }
  for (let i = 0; i < 400 && v < 1; i++) {
    v *= 10;
    exp--;
  }
  return { mantissa: Math.round(v * 1e9) / 1e9, exponent: exp };
}

/** R 76-1 §3.2 / Table 2: e must be m x 10^k, m in the pack's e_form (default 1, 2, 5). */
function isValidEForm(value: number, forms: number[]): boolean {
  const { mantissa } = mantissaAndExponent(value);
  return forms.some((f) => Math.abs(f - mantissa) < 1e-6);
}

/** Find every Table 3 row matching a class (a class can have more than one e-sub-range, e.g. II). */
function classificationRowsFor(pack: Pick<RulePack, "classification">, cls: AccuracyClass): ClassificationRow[] {
  return pack.classification.filter((r) => r.class === cls);
}

/** Find the Table 3 row whose [e_min_g, e_max_g] contains eGrams, for the given class. */
function matchClassificationRow(
  pack: Pick<RulePack, "classification">,
  cls: AccuracyClass,
  eGrams: number,
): ClassificationRow | undefined {
  return classificationRowsFor(pack, cls).find(
    (r) => eGrams >= r.e_min_g && (r.e_max_g === null || eGrams <= r.e_max_g),
  );
}

function rangeLabel(rangeKind: InstrumentProfile["rangeKind"], i: number, total: number): string {
  if (rangeKind === "single") return "the instrument";
  if (rangeKind === "multi-interval") return `partial range ${i + 1} of ${total}`;
  return `weighing range ${i + 1} of ${total}`;
}

// ---------------------------------------------------------------------------
// validateProfile
// ---------------------------------------------------------------------------

/**
 * Structural / classification validation of an InstrumentProfile against a rule pack's
 * e-form rules and Table 3 / Table 4. Returns Issue[]; never throws.
 */
export function validateProfile(profile: InstrumentProfile, pack: RulePack): Issue[] {
  const issues: Issue[] = [];
  const unit: MassUnit = profile.unit;
  const eForms = pack.e_form ?? [1, 2, 5];
  const cls = profile.accuracyClass;

  if (profile.ranges.length === 0) {
    issues.push(err("E_NO_RANGES", "Instrument profile declares no weighing ranges.", { path: "ranges" }));
    return issues;
  }

  // --- per-range checks: e-form, d <= e, d < e <= 10 d, Table 3 -----------------------
  profile.ranges.forEach((range, i) => {
    const label = rangeLabel(profile.rangeKind, i, profile.ranges.length);
    const path = `ranges[${i}]`;

    if (!Number.isFinite(range.e) || range.e <= 0) {
      issues.push(err("E_RANGE_E_INVALID", `${label}: e must be a positive finite number.`, { path: `${path}.e` }));
      return;
    }
    if (!Number.isFinite(range.d) || range.d <= 0) {
      issues.push(err("E_RANGE_D_INVALID", `${label}: d must be a positive finite number.`, { path: `${path}.d` }));
      return;
    }
    if (!Number.isFinite(range.max) || !Number.isFinite(range.min)) {
      issues.push(err("E_RANGE_MAX_MIN_INVALID", `${label}: Max and Min must be finite numbers.`, { path }));
      return;
    }

    // e-form: e = m x 10^k, m in {1, 2, 5} (R 76-1 §3.2 / Table 2).
    if (!isValidEForm(range.e, eForms)) {
      issues.push(
        err(
          "E_E_NOT_STANDARD_FORM",
          `${label}: e = ${range.e} ${unit} is not of the form m x 10^k with m in {${eForms.join(", ")}} (R 76-1:2006 §3.2).`,
          { path: `${path}.e`, clause: "R 76-1:2006 §3.2 / Table 2" },
        ),
      );
    }

    // d <= e always (Table 2: e = d, or e chosen per §3.4.2).
    if (range.d > range.e) {
      issues.push(
        err("E_D_GT_E", `${label}: d (${range.d} ${unit}) must not exceed e (${range.e} ${unit}) (R 76-1:2006 Table 2).`, {
          path: `${path}.d`,
          clause: "R 76-1:2006 Table 2",
        }),
      );
    } else if (range.d < range.e) {
      // §3.4.2: d < e <= 10 d, except class I with d < 1 mg where e = 1 mg is allowed
      // to exceed the 10 d bound (see Table 5b in the standard).
      const dGrams = toGrams(range.d, unit);
      const exempt = cls === "I" && dGrams < 1 * 0.001; // d < 1 mg
      if (!exempt && range.e > 10 * range.d) {
        issues.push(
          warn(
            "E_E_D_RATIO_OUT_OF_RANGE",
            `${label}: e (${range.e} ${unit}) exceeds 10 x d (${range.d} ${unit}); R 76-1:2006 §3.4.2 requires d < e <= 10 d.`,
            { path: `${path}.e`, clause: "R 76-1:2006 §3.4.2" },
          ),
        );
      }
    }

    // Table 3: (e_i, n_i) must independently satisfy the class's row (R 76-1 §3.3.2 for
    // multi-interval partial ranges; §3.2 directly for single / multiple-range).
    const eGrams = toGrams(range.e, unit);
    const row = matchClassificationRow(pack, cls, eGrams);
    if (!row) {
      issues.push(
        err(
          "E_NO_CLASSIFICATION_ROW",
          `${label}: no Table 3 row for class ${cls} covers e = ${range.e} ${unit} (${eGrams} g).`,
          { path: `${path}.e`, clause: "R 76-1:2006 Table 3" },
        ),
      );
      return;
    }
    issues.push(
      info(
        "I_CLASSIFICATION_ROW_USED",
        `${label}: matched Table 3 row class ${row.class}, e in [${row.e_min_g}, ${row.e_max_g ?? "unbounded"}] g, ` +
          `n in [${row.n_min}, ${row.n_max ?? "unbounded"}], min_capacity ${row.min_capacity}.`,
        { path, clause: "R 76-1:2006 Table 3" },
      ),
    );

    const n = range.n ?? range.max / range.e;
    if (n < row.n_min || (row.n_max !== null && n > row.n_max)) {
      issues.push(
        err(
          "E_N_OUT_OF_RANGE",
          `${label}: n = Max/e = ${n} is outside Table 3's range [${row.n_min}, ${row.n_max ?? "unbounded"}] for class ${cls}.`,
          { path, clause: "R 76-1:2006 Table 3" },
        ),
      );
    }

    // Min-capacity multiple: for multi-interval, only Min1 (i === 0) is an independent
    // "instrument minimum" -- Min_i for i > 0 is definitionally Max_{i-1} (checked below
    // as part of the Table 4 chain, not against the min_capacity multiple).
    const checkMinCapacity = profile.rangeKind !== "multi-interval" || i === 0;
    if (checkMinCapacity) {
      try {
        const { multiple, of } = parseMinCapacity(row.min_capacity);
        const basisGrams = of === "e" ? eGrams : toGrams(range.d, unit);
        const requiredGrams = multiple * basisGrams;
        const minGrams = toGrams(range.min, unit);
        const tolerance = 1e-9 * Math.max(1, requiredGrams);
        if (minGrams + tolerance < requiredGrams) {
          issues.push(
            err(
              "E_MIN_CAPACITY_TOO_LOW",
              `${label}: Min (${range.min} ${unit}) is below the required ${row.min_capacity} = ${requiredGrams} g for class ${cls}.`,
              { path: `${path}.min`, clause: "R 76-1:2006 Table 3" },
            ),
          );
        }
      } catch (e) {
        issues.push(err("E_PACK_MIN_CAPACITY_UNPARSEABLE", (e as Error).message, { path: `${path}.min` }));
      }
    }
  });

  // --- multi-interval: Table 4 + chaining -----------------------------------------
  if (profile.rangeKind === "multi-interval") {
    validateMultiInterval(profile, pack, issues);
  }

  // --- multiple-range: ascending e --------------------------------------------------
  if (profile.rangeKind === "multiple-range") {
    for (let i = 1; i < profile.ranges.length; i++) {
      const prev = profile.ranges[i - 1] as PartialRange;
      const cur = profile.ranges[i] as PartialRange;
      if (!(toGrams(cur.e, unit) > toGrams(prev.e, unit))) {
        issues.push(
          err(
            "E_MULTIPLE_RANGE_E_NOT_ASCENDING",
            `Weighing ranges must have strictly ascending e (R 76-1:2006 §3.2: "e1 < e2 < ... < er"); ` +
              `range ${i} (e=${cur.e} ${unit}) does not exceed range ${i - 1} (e=${prev.e} ${unit}).`,
            { path: `ranges[${i}].e`, clause: "R 76-1:2006 §3.2" },
          ),
        );
      }
    }
  }

  return issues;
}

function validateMultiInterval(profile: InstrumentProfile, pack: RulePack, issues: Issue[]): void {
  const unit = profile.unit;
  const cls = profile.accuracyClass;
  const boundary = pack.multi_interval_boundary?.[cls];

  for (let i = 0; i < profile.ranges.length; i++) {
    const cur = profile.ranges[i] as PartialRange;

    if (i > 0) {
      const prev = profile.ranges[i - 1] as PartialRange;

      // e_{i+1} > e_i (R 76-1 §3.3.1).
      if (!(toGrams(cur.e, unit) > toGrams(prev.e, unit))) {
        issues.push(
          err(
            "E_MULTI_INTERVAL_E_NOT_INCREASING",
            `Partial range ${i + 1}'s e (${cur.e} ${unit}) must exceed partial range ${i}'s e (${prev.e} ${unit}) (R 76-1:2006 §3.3.1).`,
            { path: `ranges[${i}].e`, clause: "R 76-1:2006 §3.3.1" },
          ),
        );
      }

      // Max strictly ascending (ranges must be ordered, non-overlapping).
      if (!(toGrams(cur.max, unit) > toGrams(prev.max, unit))) {
        issues.push(
          err(
            "E_MULTI_INTERVAL_MAX_NOT_ASCENDING",
            `Partial ranges must have strictly ascending Max; range ${i + 1} (Max=${cur.max} ${unit}) does not exceed range ${i} (Max=${prev.max} ${unit}).`,
            { path: `ranges[${i}].max`, clause: "R 76-1:2006 §3.3.1" },
          ),
        );
      }

      // Min_i = Max_{i-1} (R 76-1 §3.3.1).
      if (toGrams(cur.min, unit) !== toGrams(prev.max, unit)) {
        issues.push(
          err(
            "E_MULTI_INTERVAL_MIN_MISMATCH",
            `Partial range ${i + 1}'s Min (${cur.min} ${unit}) must equal partial range ${i}'s Max (${prev.max} ${unit}) (R 76-1:2006 §3.3.1: Min_i = Max_{i-1}).`,
            { path: `ranges[${i}].min`, clause: "R 76-1:2006 §3.3.1" },
          ),
        );
      }

      // Table 4: Max_i / e_{i+1} >= boundary, for every partial range EXCEPT THE LAST
      // (the check compares range i to range i+1's e, so it only makes sense up to the
      // second-to-last range; that's naturally satisfied because this loop's "cur" is
      // range i+1 and "prev" is range i -- the Table 4 check belongs to `prev`).
      if (boundary !== undefined) {
        const n = prev.max / cur.e; // Max_i / e_{i+1}, both already same profile.unit
        if (n < boundary) {
          issues.push(
            err(
              "E_TABLE4_BOUNDARY_VIOLATION",
              `Max_${i} / e_${i + 1} = ${prev.max} / ${cur.e} = ${n} is below Table 4's boundary of ${boundary} for class ${cls}.`,
              { path: `ranges[${i}]`, clause: "R 76-1:2006 Table 4" },
            ),
          );
        }
      } else {
        issues.push(
          warn(
            "W_PACK_NO_TABLE4_BOUNDARY",
            `Rule pack has no multi_interval_boundary for class ${cls}; Table 4 (Max_i / e_{i+1}) could not be checked.`,
            { clause: "R 76-1:2006 Table 4" },
          ),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// validateObservations
// ---------------------------------------------------------------------------

/**
 * Sanity checks on a set of weighing observations against the instrument's declared
 * ranges. This is deliberately conservative: WeighingObservation carries no form id or
 * range index, so form-specific ordering rules (e.g. "increasing then decreasing
 * loads") are out of scope here -- flagged as a gap in the handoff report. What IS
 * checked: finiteness, the Min..Max envelope, the multi-interval/multiple-range
 * "load doesn't land in any declared (partial) range" trap (CLAUDE.md's #1 manual-Excel
 * mistake), and exact duplicate rows.
 */
export function validateObservations(profile: InstrumentProfile, obs: WeighingObservation[]): Issue[] {
  const issues: Issue[] = [];
  const unit = profile.unit;

  if (obs.length === 0) {
    issues.push(warn("W_NO_OBSERVATIONS", "No observations supplied."));
    return issues;
  }

  const overallMinGrams = Math.min(...profile.ranges.map((r) => toGrams(r.min, unit)));
  const overallMaxGrams = Math.max(...profile.ranges.map((r) => toGrams(r.max, unit)));

  const seen = new Set<string>();

  obs.forEach((row, i) => {
    const path = `observations[${i}]`;

    for (const [field, value] of [
      ["load", row.load],
      ["indication", row.indication],
      ["additionalLoad", row.additionalLoad],
    ] as const) {
      if (value !== undefined && !Number.isFinite(value)) {
        issues.push(err("E_NON_FINITE_VALUE", `${path}.${field} is not a finite number (${value}).`, { path: `${path}.${field}` }));
      }
    }

    if (row.additionalLoad !== undefined && row.additionalLoad < 0) {
      issues.push(err("E_NEGATIVE_ADDITIONAL_LOAD", `${path}.additionalLoad must not be negative.`, { path: `${path}.additionalLoad` }));
    }

    if (Number.isFinite(row.load)) {
      const loadGrams = toGrams(row.load, unit);
      if (loadGrams < overallMinGrams || loadGrams > overallMaxGrams) {
        issues.push(
          err(
            "E_LOAD_OUT_OF_RANGE",
            `${path}.load = ${row.load} ${unit} is outside the instrument's declared Min..Max (${overallMinGrams}..${overallMaxGrams} g).`,
            { path: `${path}.load` },
          ),
        );
      } else if (profile.rangeKind !== "single") {
        // The #1 manual-Excel mistake (CLAUDE.md §5): on a multi-interval or
        // multiple-range instrument, the applicable e (and thus mpe band) walks
        // mid-range. A load that falls between declared ranges/partial-ranges signals
        // a data-entry error before it ever reaches the mpe resolver.
        const inAnyRange = profile.ranges.some((r) => {
          const lo = toGrams(r.min, unit);
          const hi = toGrams(r.max, unit);
          return loadGrams >= lo && loadGrams <= hi;
        });
        if (!inAnyRange) {
          issues.push(
            warn(
              "W_LOAD_NOT_IN_ANY_RANGE",
              `${path}.load = ${row.load} ${unit} does not fall within any declared partial/weighing range, even though it is within the overall Min..Max envelope. Check which range's e applies.`,
              { path: `${path}.load`, clause: "R 76-1:2006 §3.3 / §3.2" },
            ),
          );
        }
      }
    }

    const key = `${row.load}|${row.indication}|${row.additionalLoad ?? ""}`;
    if (seen.has(key)) {
      issues.push(warn("W_DUPLICATE_OBSERVATION", `${path} duplicates an earlier row (load=${row.load}, indication=${row.indication}).`, { path }));
    }
    seen.add(key);
  });

  return issues;
}

// ---------------------------------------------------------------------------
// validateSoftwareIdentification (R 76-1 Annex G)
// ---------------------------------------------------------------------------

const HEX_RE = /^[0-9a-f]+$/i;
const FILESIZE_RE = /^[0-9][0-9,]*\s*(b|kb|mb|gb)$/i;
const PLACEHOLDER_WORDS = new Set([
  "is",
  "tbd",
  "n/a",
  "na",
  "details",
  "detail",
  "pending",
  "none",
  "xxxx",
  "todo",
  "unknown",
  "tba",
  "-",
  "--",
]);
/** A handful of well-known small moduli seen in the wild in addition to bare powers of two. */
const KNOWN_MODULI = new Set<bigint>([256n, 4096n, 65536n, 16777216n, 4294967296n]);

function isPowerOfTwoOrKnownModulus(n: bigint): boolean {
  if (n <= 0n) return false;
  if (KNOWN_MODULI.has(n)) return true;
  return (n & (n - 1n)) === 0n;
}

export interface SoftwareIdOptions {
  /** This certificate's manufacturer/model -- used so a value is not flagged as a
   *  "duplicate" against itself when re-validating the same certificate. */
  owner?: string;
  /** checksum (case-insensitive, trimmed) -> owner, from the wider register/corpus, so
   *  a value reused by a DIFFERENT owner can be caught (docs/certificates/certificates-
   *  analysis.md: certs #259 and #300, two different manufacturers, identical checksum). */
  knownChecksums?: Record<string, string>;
}

/**
 * Format-validate a software identification / checksum field per R 76-1 Annex G
 * (G.1, G.2.4). Catches the defect classes documented in
 * docs/certificates/certificates-analysis.md's checksum audit: non-hex characters,
 * implausibly short values, file-size-shaped values, modulus/power-of-two-shaped
 * values, template filler, and (via `opts.knownChecksums`) cross-certificate
 * duplicates. Never throws; returns [] for a well-formed value.
 */
export function validateSoftwareIdentification(field: string, opts: SoftwareIdOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const trimmed = field.trim();
  const clause = "R 76-1:2006 Annex G.1 / G.2.4";

  if (trimmed.length === 0) {
    return [err("E_SWID_EMPTY", "Software identification / checksum is empty.", { clause })];
  }

  const lower = trimmed.toLowerCase();

  if (PLACEHOLDER_WORDS.has(lower)) {
    issues.push(
      err(
        "E_SWID_PLACEHOLDER",
        `"${trimmed}" looks like leftover template text, not a checksum (Annex G.2.4 requires a checksum or equivalent signature over the legally relevant software).`,
        { clause },
      ),
    );
  }

  if (FILESIZE_RE.test(trimmed)) {
    issues.push(
      err(
        "E_SWID_LOOKS_LIKE_FILESIZE",
        `"${trimmed}" looks like a file size (e.g. "8100kb"), not a checksum (Annex G.2.4).`,
        { clause },
      ),
    );
  }

  const isHex = HEX_RE.test(trimmed);
  if (!isHex && !PLACEHOLDER_WORDS.has(lower) && !FILESIZE_RE.test(trimmed)) {
    issues.push(
      err(
        "E_SWID_NOT_HEX",
        `"${trimmed}" contains non-hexadecimal characters; a checksum (e.g. a CRC-16) is normally expressed in hex (Annex G.2.4).`,
        { clause },
      ),
    );
  }

  if (isHex) {
    if (trimmed.length < 4) {
      issues.push(
        err(
          "E_SWID_TOO_SHORT",
          `"${trimmed}" is implausibly short for a checksum (< 2 bytes); Annex G.1's example is "at least 2 bytes CRC-16 with hidden polynomial".`,
          { clause },
        ),
      );
    } else if (trimmed.length === 4) {
      issues.push(
        warn(
          "W_SWID_MINIMAL_LENGTH",
          `"${trimmed}" is exactly Annex G's stated minimum length (2-byte CRC-16). Verify it was not truncated from a longer value.`,
          { clause },
        ),
      );
    }

    if (/^[0-9]+$/.test(trimmed)) {
      try {
        const n = BigInt(trimmed);
        if (isPowerOfTwoOrKnownModulus(n)) {
          issues.push(
            err(
              "E_SWID_LOOKS_LIKE_MODULUS",
              `"${trimmed}" looks like a numeric modulus or power of two (e.g. 65536 = 2^16), not a checksum (Annex G.2.4).`,
              { clause },
            ),
          );
        }
      } catch {
        // Not parseable as BigInt (shouldn't happen given the regex) -- ignore.
      }
    }
  }

  if (opts.knownChecksums) {
    const existingOwner = opts.knownChecksums[lower];
    if (existingOwner !== undefined && existingOwner !== opts.owner) {
      issues.push(
        err(
          "E_SWID_DUPLICATE_ACROSS_OWNERS",
          `"${trimmed}" is already registered under a different manufacturer/model ("${existingOwner}"). Annex G requires the software identification to uniquely identify THIS type's legally relevant software.`,
          { clause },
        ),
      );
    }
  }

  return issues;
}
