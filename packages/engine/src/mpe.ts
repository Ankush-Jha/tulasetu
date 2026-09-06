/**
 * The mpe resolver — R 76-1:2006 Table 6, multi-interval-aware.
 *
 * CLAUDE.md §5: "on a multi-interval instrument, e changes with load — the band
 * boundary can jump mid-range. This is the #1 thing manual Excel gets wrong."
 *
 * The algorithm is deliberately two steps, in this order:
 *   1. Find which *partial range* i the load falls in (R 76-1 §3.3.1). This fixes e_i.
 *   2. Compute m = load / e_i and walk the pack's mpe bands (Table 6) for m, in e_i units.
 *
 * Doing it in the other order (walking a single global mpe table by load) is exactly
 * the bug this module exists to prevent: R 76-1's own worked example (§3.3, Max =
 * 2/5/15 kg, e = 1/2/10 g, class III) shows the band multiplier itself changing
 * (0.5e -> 1e -> 1e -> 1.5e -> 1e) as load crosses both partial-range boundaries and
 * in-range mpe-band boundaries — sometimes in the same direction, sometimes not.
 *
 * No I/O, no randomness, pure function of its arguments.
 */

import type { AccuracyClass, InstrumentProfile, MpeResolution, PartialRange, VerificationStage } from "./types.js";
import { parseBandFactor, type RulePack } from "./rulepack.js";

// ---------------------------------------------------------------------------
// Floating-point safety
// ---------------------------------------------------------------------------
//
// Boundary values in this module come in two flavours:
//   - "load vs Max_i", compared in the profile's unit (e.g. grams, kg, tonnes).
//   - "m vs max_m_in_e[class]", compared as a dimensionless ratio load / e_i.
//
// A load built from arithmetic like 0.1 + 0.2 carries float noise on the order of
// 1e-16 *relative* to its own magnitude. We guard both comparisons with an epsilon
// that is many orders of magnitude larger than that noise floor but many orders
// smaller than any legally meaningful difference (the standard's bands are whole
// multiples of e; nobody writes a test load that differs from a boundary by 1e-9 e
// on purpose). Range boundaries are compared with an epsilon scaled to e_i (so it
// stays meaningful whether the profile unit is mg or tonnes); the m-boundary is
// dimensionless already, so a flat epsilon is fine given m is at most ~2e5 in any
// real instrument (class I) and float noise on the division is bounded similarly.
const RANGE_EPSILON_FACTOR = 1e-9; // multiplied by e_i, in the profile's unit
const M_EPSILON = 1e-6; // absolute, on the dimensionless ratio m = load / e_i

/**
 * Find the 0-based index of the partial range (multi-interval) / weighing range
 * (multiple-range) that `load` falls in.
 *
 * R 76-1 §3.3.1: partial range i covers (Min_i, Max_i], with Min_i = Max_{i-1} and
 * Min_1 = Min. Because ranges are contiguous and ascending, "the first range whose
 * Max the load does not exceed" is exactly this: we never need to check the lower
 * bound explicitly — it falls out of having already failed the previous range's
 * upper bound. Range 1 therefore effectively starts at 0 (covers near-zero / E0
 * observations below Min, which real weighing-performance tests do use).
 *
 * For `multiple-range` instruments, R 76-1 §3.2 says "each range is treated as if
 * it were an instrument with one range" — i.e. the same walk applies to whichever
 * set of ranges the caller passes in `profile.ranges` for the range under test.
 * Selecting *which* weighing range is active for a given multiple-range instrument
 * is outside this function's job; it assumes `profile.ranges` already describes the
 * range(s) applicable to this measurement (a single entry, for a true multiple-range
 * instrument evaluated one range at a time; several contiguous entries, for
 * multi-interval).
 */
function findRangeIndex(load: number, ranges: readonly PartialRange[]): number {
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range === undefined) continue;
    const eps = range.e * RANGE_EPSILON_FACTOR;
    if (load <= range.max + eps) return i;
  }
  return -1; // load exceeds the instrument's overall Max
}

/** Parsed band-lookup result, before packaging into the public MpeResolution shape. */
interface BandMatch {
  factor: 0.5 | 1.0 | 1.5;
  bound: number | null;
}

function findBand(pack: RulePack, cls: AccuracyClass, m: number): BandMatch {
  for (const band of pack.mpe_bands_initial) {
    const bound = band.max_m_in_e[cls];
    if (bound === undefined) continue; // this band doesn't define a limit for this class
    if (bound === null || m <= bound + M_EPSILON) {
      return { factor: parseBandFactor(band.limit), bound };
    }
  }
  throw new Error(
    `mpe resolver: no mpe band in rule pack ${pack.ruleset_id} covers m=${m} for class ${cls} ` +
      `(check mpe_bands_initial is complete and ascending).`,
  );
}

/**
 * Resolve the maximum permissible error for `load` under `profile`, per `pack`.
 *
 * R 76-1 §3.5.1 (Table 6) for the band walk; §3.3 for the multi-interval range
 * selection that must happen first; §3.5.2 for the in-service x2 factor.
 */
export function resolveMpe(
  profile: InstrumentProfile,
  load: number,
  pack: RulePack,
  stage: VerificationStage = "initial",
): MpeResolution {
  if (!Number.isFinite(load)) {
    throw new Error(`mpe resolver: load must be a finite number, got ${load}.`);
  }
  if (profile.ranges.length === 0) {
    throw new Error("mpe resolver: instrument profile declares no ranges.");
  }

  const idx = findRangeIndex(load, profile.ranges);
  if (idx < 0) {
    const lastRange = profile.ranges[profile.ranges.length - 1];
    throw new Error(
      `mpe resolver: load ${load} ${profile.unit} exceeds the instrument's Max ` +
        `(${lastRange?.max} ${profile.unit}).`,
    );
  }
  const range = profile.ranges[idx];
  if (range === undefined) {
    // Unreachable given the idx >= 0 check above; narrows the type for TS.
    throw new Error("mpe resolver: internal error selecting partial range.");
  }

  const e = range.e;
  const m = load / e;
  const { factor, bound } = findBand(pack, profile.accuracyClass, m);

  const stageFactor = stage === "in-service" ? (pack.mpe_in_service_factor ?? 2) : 1;
  const mpe = factor * e * stageFactor;

  const rangeLabel =
    profile.ranges.length > 1
      ? `partial range ${idx + 1}/${profile.ranges.length} (Max${idx + 1} = ${range.max} ${profile.unit}, e${idx + 1} = ${e} ${profile.unit})`
      : `the (single) weighing range (Max = ${range.max} ${profile.unit}, e = ${e} ${profile.unit})`;
  const boundText = bound === null ? "unbounded" : `m <= ${bound}`;
  const stageText =
    stage === "in-service" ? ` then doubled for in-service use (x${stageFactor}, R 76-1 §3.5.2)` : "";

  const reason =
    `Load ${load} ${profile.unit} falls in ${rangeLabel}. ` +
    `m = load / e = ${load} / ${e} = ${m}. ` +
    `Class ${profile.accuracyClass}, band +/-${factor}e applies (${boundText}). ` +
    `mpe = +/-${factor} x ${e} ${profile.unit}${stageText} = +/-${mpe} ${profile.unit}.`;

  return {
    mpe,
    factor,
    e,
    rangeIndex: idx + 1,
    m,
    stage,
    reason,
    clause: (pack["mpe_clause"] as string | undefined) ?? "R 76-1:2006 §3.3 & §3.5.1 (Table 6)",
  };
}
