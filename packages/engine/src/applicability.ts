/**
 * Applicability resolver: which R 76-2 forms apply to a given instrument, and why not
 * when they don't.
 *
 * CLAUDE.md design rule #2 ("the standard is data, not code") means this module must
 * NOT hardcode which classes/features gate which forms. Instead it is a small, generic
 * evaluator over the declarative `TestRule.applies` objects already present in the rule
 * pack (see packages/engine/src/rulepack.ts). The vocabulary of predicate keys this
 * evaluator understands is documented just below (`PREDICATE_VOCABULARY`).
 *
 * Primary sources (verify every rule here against these, not against memory):
 *   docs/standards/extracted/OIML_R76-1_2006_requirements.txt
 *     - Table 3 (§3.2 Classification), Table 4 (§3.3.3), §3.3 (multi-interval),
 *       §3.8 (discrimination, incl. the "d >= 5 mg" digital exemption in 3.8.2.2),
 *       §3.9.1.1 (tilting: class II/III/IIII only), §3.9.4.3 & Annex A.6 (endurance:
 *       Max <= 100 kg AND classes II/III/IIII only -- class I is NOT eligible, see the
 *       "flagged" note below), §5.3.2 (damp heat exemptions), §5.3.3 (span stability
 *       exemption).
 *   docs/standards/extracted/OIML_R76-2_2007_report_format.txt
 *     - the Summary-of-type-evaluation form list (forms 1 - 17.4), the "- -" not
 *       applicable convention, and the 17.1/17.2/17.3/17.4 checklist headers.
 *   docs/research/heading-a-extract.md + heading-a-raw.txt
 *     - India's class II* (class II for direct sales to the public): the raw text
 *       (search "Titting at no-load") shows no-load tilting is required for class
 *       II*, III and IIII, but NOT for plain class II or class I.
 *
 * ---------------------------------------------------------------------------
 * FLAGGED DISCREPANCY vs CLAUDE.md §7 (verified against the standard, standard wins):
 *
 *   CLAUDE.md §7 says only "endurance -> only if Max <= 100 kg, and always last".
 *   The standard is stricter: R 76-1 Annex A.6 states verbatim "Applicable only to
 *   instruments of classes II, III and IIII with Max <= 100 kg" (line ~4487 of the
 *   extracted text). Class I is EXCLUDED regardless of Max. The current
 *   packages/rulepacks/OIML_R76_2006.json "endurance" test only encodes the Max <= 100
 *   condition and is therefore incomplete. See the JSON patch in the handoff report.
 * ---------------------------------------------------------------------------
 */

import type { AccuracyClass, KernelId, MassUnit, PartialRange, InstrumentProfile } from "./types.js";
import { normalizeClass, type RulePack, type TestRule } from "./rulepack.js";

// ---------------------------------------------------------------------------
// Public result shape (as specified by the engine's applicability contract)
// ---------------------------------------------------------------------------

export interface ApplicableTest {
  testId: string;
  formId: string;
  kernel: KernelId;
  title?: string;
  applicable: boolean;
  /** Why not -- rendered next to the "- -" in the report. Required when applicable === false. */
  reason?: string;
  clause?: string;
  /** For multiple-range instruments: which range this form instance covers (1-based). */
  rangeIndex?: number;
  /** Endurance must be scheduled last. */
  order: number;
}

/**
 * One applicability decision for an R 76-2 checklist (17.1 - 17.4). Checklists are
 * qualitative (a list of yes/no examination items), not one of the 5 calculation
 * kernels, so they do not fit the `ApplicableTest` shape (which requires a `kernel`).
 * They get their own light-weight result type and resolver, `resolveApplicableChecklists`.
 */
export interface ApplicableChecklist {
  checklistId: string;
  title?: string;
  applicable: boolean;
  reason?: string;
  clause?: string;
}

/**
 * Declarative shape of one checklist applicability rule. Mirrors `TestRule` from
 * rulepack.ts minus the mandatory `kernel` (checklists have none). Rule packs declare
 * these under a NEW top-level key, `checklist_rules` (see the JSON patch in the
 * handoff report) -- the existing `checklists: string[]` field is left untouched for
 * backward compatibility / display labels.
 */
export interface ChecklistRule {
  id: string;
  title?: string;
  clause?: string;
  applies?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Predicate vocabulary
// ---------------------------------------------------------------------------

/**
 * The complete set of keys this evaluator understands inside a `TestRule.applies` (or
 * `ChecklistRule.applies`) object. Multiple keys in one object are AND-ed together --
 * this matches how the current rule pack already writes multi-condition rules (e.g.
 * damp_heat: `{ electronic: true, not_class: ["I"], not_class_II_if_e_lt: "1g" }`).
 *
 * | key                      | value type          | true means...                                                          |
 * |--------------------------|---------------------|-------------------------------------------------------------------------|
 * | always                   | true                | unconditionally applicable                                              |
 * | not                      | Predicate           | negation of the nested predicate                                        |
 * | all                      | Predicate[]         | AND of the nested predicates (extension; explicit alternative to bare multi-key AND) |
 * | any                      | Predicate[]         | OR of the nested predicates (extension; needed for checklist 17.2)      |
 * | class_in                 | AccuracyClass[]     | profile.accuracyClass (normalized) is one of these                     |
 * | not_class                | AccuracyClass[]     | profile.accuracyClass (normalized) is NOT one of these                 |
 * | indicating_type          | IndicatingType      | profile.indicatingType equals this                                     |
 * | electronic               | boolean             | profile.electronic equals this                                         |
 * | has_tare                 | boolean             | profile.hasTareDevice equals this                                      |
 * | has_print_or_storage     | boolean             | profile.hasPrintOrStorage equals this                                  |
 * | tiltable                 | boolean             | profile.tiltable equals this                                           |
 * | rolling_load             | boolean             | profile.rollingLoad equals this                                        |
 * | vehicle_powered          | boolean (extension) | profile.vehiclePowered equals this (needed for form 12.7)              |
 * | direct_sales             | boolean (extension) | profile.directSalesToPublic equals this (needed for checklist 17.2)    |
 * | price_computing          | boolean (extension) | profile.priceComputing equals this (needed for checklist 17.2)         |
 * | software_controlled      | boolean (extension) | profile.softwareControlled equals this (needed for checklist 17.4)     |
 * | max_capacity_kg_lte      | number              | the instrument's (or current range's) Max, in kg, is <= this           |
 * | not_class_II_if_e_lt     | quantity string     | ALREADY negated in its name: true unless (class===II AND e < threshold). e is the representative e (see below). Value like "1g", "500mg". |
 * | digital_d_lt_5mg         | true                | RAW condition (not negated): true iff this is a digital indication AND d < 5 mg. Meant to be wrapped in `not`, as the pack already does for "discrimination". |
 *
 * "Representative e / Max" for whole-instrument exemption checks (not_class_II_if_e_lt,
 * max_capacity_kg_lte, digital_d_lt_5mg's d): for a `multiple-range` instrument, each
 * range is "treated as if it were an instrument with one range" (R 76-1 §3.2), so the
 * CURRENT range's own e/d/Max is used. For `single` and `multi-interval` instruments
 * there is exactly one weighing range, but multi-interval subdivides it into partial
 * ranges -- R 76-1's own worked example says "particularly at or near zero, load e =
 * e1", so e/d default to the FIRST partial range's e1/d1, while Max is the OVERALL
 * maximum capacity (the LAST partial range's Max).
 *
 * Any key not in this table causes `resolveApplicableTests` to throw with a message
 * naming the offending key and test id -- a rule pack authoring bug should fail loudly
 * at development time, the same way `rulepack.ts`'s own parseBandFactor/parseMinCapacity
 * throw on malformed data, rather than silently mis-resolving applicability for a
 * legally-relevant report.
 */
export type Predicate = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Unit helpers (grams are the classification table's native unit; profiles may be
// expressed in mg/g/kg/t). Kept local and tiny -- packages/engine/src/units.ts is
// owned by another agent and does not exist yet.
// ---------------------------------------------------------------------------

const GRAMS_PER_UNIT: Record<MassUnit, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 };

/** Convert a quantity expressed in `unit` to grams. */
export function toGrams(value: number, unit: MassUnit): number {
  return value * GRAMS_PER_UNIT[unit];
}

/** Convert a quantity expressed in `unit` to kilograms. */
export function toKg(value: number, unit: MassUnit): number {
  return toGrams(value, unit) / 1000;
}

/** Parse a rule-pack quantity spec like "1g", "500mg", "2kg" into grams. */
export function parseQuantityG(spec: string): number {
  const m = /^([0-9]*\.?[0-9]+)\s*(mg|g|kg|t)$/i.exec(spec.trim());
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(`Unparseable quantity spec ${JSON.stringify(spec)} in a rule pack applies clause.`);
  }
  return toGrams(Number(m[1]), m[2].toLowerCase() as MassUnit);
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

export interface PredicateContext {
  profile: InstrumentProfile;
  /** 0-based index into profile.ranges identifying which range this evaluation concerns. */
  rangeIdx: number;
  pack: Pick<RulePack, "class_aliases">;
}

function rangeAt(profile: InstrumentProfile, idx: number): PartialRange {
  const r = profile.ranges[idx];
  if (!r) {
    throw new Error(`InstrumentProfile.ranges has no entry at index ${idx} (ranges.length = ${profile.ranges.length}).`);
  }
  return r;
}

/** The range whose e/d stand in for "the instrument's e/d" in whole-instrument checks. */
function representativeRange(ctx: PredicateContext): PartialRange {
  if (ctx.profile.rangeKind === "multiple-range") return rangeAt(ctx.profile, ctx.rangeIdx);
  // single / multi-interval: e1/d1 (first partial range) per R 76-1's own convention.
  return rangeAt(ctx.profile, 0);
}

/** The Max that stands in for "the instrument's Max" in whole-instrument checks. */
function representativeMaxKg(ctx: PredicateContext): number {
  const { profile } = ctx;
  if (profile.rangeKind === "multiple-range") {
    const r = rangeAt(profile, ctx.rangeIdx);
    return toKg(r.max, profile.unit);
  }
  // single / multi-interval: one weighing range as a whole -> overall Max is the LAST
  // partial range's Max (R 76-1 §3.3.1: Max = Max of the last partial range).
  const last = rangeAt(profile, profile.ranges.length - 1);
  return toKg(last.max, profile.unit);
}

function normalizedClassOf(profile: InstrumentProfile, pack: Pick<RulePack, "class_aliases">): AccuracyClass {
  // profile.accuracyClass is already typed as a canonical AccuracyClass, but we run it
  // through normalizeClass defensively (e.g. a caller that built the profile from raw
  // certificate text with the class as a loosely-typed string).
  return normalizeClass(profile.accuracyClass, pack) ?? profile.accuracyClass;
}

function classListNormalized(list: unknown, pack: Pick<RulePack, "class_aliases">): AccuracyClass[] {
  if (!Array.isArray(list)) return [];
  return list.map((c) => normalizeClass(String(c), pack)).filter((c): c is AccuracyClass => c !== undefined);
}

/** Digital indication, for the purposes of R 76-1 §3.8.2.2's "d >= 5 mg" exemption.
 *  InstrumentProfile has no explicit analog/digital flag; `electronic` is used as the
 *  documented proxy (electronic NAWI display digitally; non-electronic ones are
 *  mechanical/analog). Non-self-indicating instruments are their own §3.8.1 case and
 *  are never "digital" for this purpose. This inference is noted in the handoff report. */
function isDigitalIndication(profile: InstrumentProfile): boolean {
  return profile.electronic === true && profile.indicatingType !== "non-self";
}

// ---------------------------------------------------------------------------
// Predicate evaluator
// ---------------------------------------------------------------------------

/** Evaluate one `applies` predicate object against a profile. `undefined` => always true. */
export function evaluatePredicate(pred: unknown, ctx: PredicateContext): boolean {
  if (pred === undefined || pred === null) return true;
  if (typeof pred !== "object") return Boolean(pred);
  for (const [key, value] of Object.entries(pred as Predicate)) {
    if (!evaluateKey(key, value, ctx)) return false;
  }
  return true;
}

function evaluateKey(key: string, value: unknown, ctx: PredicateContext): boolean {
  const { profile } = ctx;
  switch (key) {
    case "always":
      return value === true;
    case "not":
      return !evaluatePredicate(value, ctx);
    case "all":
      return Array.isArray(value) && value.every((v) => evaluatePredicate(v, ctx));
    case "any":
      return Array.isArray(value) && value.some((v) => evaluatePredicate(v, ctx));
    case "class_in":
      return classListNormalized(value, ctx.pack).includes(normalizedClassOf(profile, ctx.pack));
    case "not_class":
      return !classListNormalized(value, ctx.pack).includes(normalizedClassOf(profile, ctx.pack));
    case "indicating_type":
      return profile.indicatingType === value;
    case "electronic":
      return profile.electronic === value;
    case "has_tare":
      return Boolean(profile.hasTareDevice) === value;
    case "has_print_or_storage":
      return Boolean(profile.hasPrintOrStorage) === value;
    case "tiltable":
      return Boolean(profile.tiltable) === value;
    case "rolling_load":
      return Boolean(profile.rollingLoad) === value;
    case "vehicle_powered":
      return Boolean(profile.vehiclePowered) === value;
    case "direct_sales":
      return Boolean(profile.directSalesToPublic) === value;
    case "price_computing":
      return Boolean(profile.priceComputing) === value;
    case "software_controlled":
      return Boolean(profile.softwareControlled) === value;
    case "max_capacity_kg_lte":
      return representativeMaxKg(ctx) <= (value as number);
    case "not_class_II_if_e_lt": {
      const thresholdG = parseQuantityG(value as string);
      const isClassII = normalizedClassOf(profile, ctx.pack) === "II";
      const eG = toGrams(representativeRange(ctx).e, profile.unit);
      return !(isClassII && eG < thresholdG);
    }
    case "digital_d_lt_5mg": {
      const dG = toGrams(representativeRange(ctx).d, profile.unit);
      return isDigitalIndication(profile) && dG < 5 * GRAMS_PER_UNIT.mg;
    }
    default:
      throw new Error(
        `Unsupported applicability predicate key "${key}". Supported keys are documented in ` +
          `packages/engine/src/applicability.ts (PREDICATE_VOCABULARY doc comment). This usually ` +
          `means a rule pack was authored with a key the engine does not implement yet.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Human-readable "why not" prose (report-ready, always cites a clause)
// ---------------------------------------------------------------------------

function reasonForTest(rule: TestRule, ctx: PredicateContext): string {
  const { profile } = ctx;
  const clause = rule.clause ?? defaultClauseFor(rule.id);
  switch (rule.id) {
    case "eccentricity_rolling":
      return `Not applicable -- this instrument is not loaded with a rolling load; eccentricity is assessed via form 3.1 (weights) only (${clause ?? "R 76-1:2006 §3.6.2.4"}).`;
    case "discrimination":
      return `Not applicable -- the digital-indication discrimination test applies only to instruments with d >= 5 mg (${clause ?? "R 76-1:2006 §3.8.2.2"}); this instrument's d is below that threshold.`;
    case "sensitivity":
      return `Not applicable -- sensitivity (form 4.2) is required only for non-self-indicating instruments (${clause ?? "R 76-1:2006 §A.4.9"}); this instrument is ${profile.indicatingType}-indicating.`;
    case "stability":
      return `Not applicable -- this instrument has no printing or data-storage device (${clause ?? "R 76-1:2006 §4.4.2 / A.4.12"}).`;
    case "tilting":
      if (normalizedClassOf(profile, ctx.pack) === "I") {
        return `Not applicable -- the tilting test does not apply to class I instruments (${clause ?? "R 76-1:2006 §3.9.1.1"}, which covers only class II, III and IIII).`;
      }
      return `Not applicable -- this instrument is not liable to be tilted in normal use (${clause ?? "R 76-1:2006 §3.9.1.1"}).`;
    case "tare":
      return `Not applicable -- this instrument has no tare device (${clause ?? "R 76-1:2006 §4.13.3"}).`;
    case "warm_up":
    case "voltage_variation":
    case "disturbances":
    case "damp_heat":
    case "span_stability":
    case "disturbances_road_vehicle":
      if (profile.electronic !== true) {
        return `Not applicable -- this instrument has no electronic parts; form ${rule.form} applies only to electronic instruments (${clause ?? "R 76-1:2006 §5"}).`;
      }
      if (rule.id === "damp_heat" && normalizedClassOf(profile, ctx.pack) === "I") {
        return `Not applicable -- damp heat testing is exempt for class I instruments (${clause ?? "R 76-1:2006 §5.3.2"}).`;
      }
      if (rule.id === "damp_heat") {
        return `Not applicable -- damp heat testing is exempt for class II instruments with e < 1 g (${clause ?? "R 76-1:2006 §5.3.2"}); this instrument's e is below that threshold.`;
      }
      if (rule.id === "span_stability") {
        return `Not applicable -- span stability testing is exempt for class I instruments (${clause ?? "R 76-1:2006 §5.3.3"}).`;
      }
      if (rule.id === "disturbances_road_vehicle") {
        return `Not applicable -- this instrument is not powered from a road-vehicle supply; form 12.7 applies only to vehicle-powered instruments (${clause ?? "R 76-1:2006 §5.4.3"}).`;
      }
      return `Not applicable to this instrument profile (${clause ?? "R 76-1:2006"}).`;
    case "endurance":
      if (normalizedClassOf(profile, ctx.pack) === "I") {
        return `Not applicable -- the endurance test does not apply to class I instruments (${clause ?? "R 76-1:2006 Annex A.6"}, applicable only to classes II, III and IIII).`;
      }
      return `Not applicable -- the endurance test applies only to instruments with Max <= 100 kg (${clause ?? "R 76-1:2006 §3.9.4.3 / Annex A.6"}).`;
    default:
      return `Not applicable to this instrument profile${clause ? ` (${clause})` : ""}.`;
  }
}

/** Fallback clause references for the tests already in packages/rulepacks/OIML_R76_2006.json,
 *  used only when the pack entry itself doesn't set `clause` (it currently doesn't, for any
 *  test -- see the JSON patch in the handoff report, which adds `clause` to every entry). */
function defaultClauseFor(testId: string): string | undefined {
  const table: Record<string, string> = {
    eccentricity_rolling: "R 76-1:2006 §3.6.2.4",
    discrimination: "R 76-1:2006 §3.8.2.2",
    sensitivity: "R 76-1:2006 §A.4.9",
    stability: "R 76-1:2006 §4.4.2 / A.4.12",
    tilting: "R 76-1:2006 §3.9.1.1",
    tare: "R 76-1:2006 §4.13.3",
    warm_up: "R 76-1:2006 §5.3.5",
    voltage_variation: "R 76-1:2006 §5.4",
    disturbances: "R 76-1:2006 §5.1 / §5.4.3",
    disturbances_road_vehicle: "R 76-1:2006 §5.4.3 / R 76-2:2007 form 12.7",
    damp_heat: "R 76-1:2006 §5.3.2",
    span_stability: "R 76-1:2006 §5.3.3",
    endurance: "R 76-1:2006 §3.9.4.3 / Annex A.6",
  };
  return table[testId];
}

// ---------------------------------------------------------------------------
// Title annotation for India-specific nuances that have no other place to surface
// ---------------------------------------------------------------------------

/**
 * India's Seventh Schedule (see docs/research/heading-a-raw.txt, "Titting at no-load")
 * requires an ADDITIONAL no-load tilting sub-test for class II* (class II intended for
 * direct sales to the public) -- plain class II only gets the loaded-tilting sub-test.
 * There is no separate form number for this in R 76-2 (it is a sub-part of form 8), so
 * with the fixed `ApplicableTest` shape the only place to surface it is `title`. This
 * is display-only prose, not a legal threshold, so it is fine to compose here rather
 * than in the rule pack.
 */
function annotateTitleForIndiaTilting(baseTitle: string | undefined, profile: InstrumentProfile): string | undefined {
  const isClassIIStar = profile.accuracyClass === "II" && profile.directSalesToPublic === true;
  if (!isClassIIStar) return baseTitle;
  const prefix = baseTitle ?? "Tilting";
  return `${prefix} (class II* direct-sales-to-public: includes the no-load tilting sub-test, India Seventh Schedule)`;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * R 76-1 §3.9.4.3 / Annex A.6: class I is required for the "barometric pressure"
 * header field to be recorded on env-sensitive forms (R 76-2 explanatory notes,
 * "Bar. pres. ... in other cases it may be necessary only for class I instruments").
 * Exposed as a tiny helper since no header/report type exists yet to attach this to.
 */
export function requiresBarometricPressureRecording(profile: InstrumentProfile): boolean {
  return profile.accuracyClass === "I";
}

/**
 * Resolve the R 76-2 form list for an instrument profile.
 *
 * - `single` / `multi-interval` -> one form set (multi-interval subdivides the SAME
 *   weighing range into partial ranges; R 76-1 §3.3 treats it as one instrument).
 * - `multiple-range` -> a full form set PER weighing range (R 76-1 §3.2: "each range
 *   is treated as if it were an instrument with one range").
 * - Within each range's form set, tests marked `order: "last"` in the pack (endurance)
 *   are scheduled after every other test IN THAT RANGE's block. (For a multiple-range
 *   instrument this means endurance for range 1 precedes the normal tests of range 2;
 *   see the doc comment in the source for the alternative reading and why this one was
 *   chosen.)
 */
export function resolveApplicableTests(profile: InstrumentProfile, pack: RulePack): ApplicableTest[] {
  const rangeIndices = profile.rangeKind === "multiple-range" ? profile.ranges.map((_, i) => i) : [0];

  const out: ApplicableTest[] = [];
  let order = 0;

  for (const rIdx of rangeIndices) {
    const ctx: PredicateContext = { profile, rangeIdx: rIdx, pack };
    const normal: ApplicableTest[] = [];
    const last: ApplicableTest[] = [];

    for (const rule of pack.tests) {
      const applicable = evaluatePredicate(rule.applies, ctx);
      let title = rule.title;
      if (rule.id === "tilting") title = annotateTitleForIndiaTilting(title, profile);

      const entry: ApplicableTest = {
        testId: rule.id,
        formId: rule.form,
        kernel: rule.kernel,
        applicable,
        order: 0, // assigned below, once the normal/last split for this range is known
        ...(title !== undefined ? { title } : {}),
        ...(rule.clause !== undefined ? { clause: rule.clause } : {}),
        ...(profile.rangeKind === "multiple-range" ? { rangeIndex: rIdx + 1 } : {}),
      };
      if (!applicable) entry.reason = reasonForTest(rule, ctx);

      (rule.order === "last" ? last : normal).push(entry);
    }

    for (const entry of [...normal, ...last]) {
      entry.order = order++;
      out.push(entry);
    }
  }

  return out;
}

/**
 * Resolve checklist (17.1 - 17.4) applicability. Reads a NEW pack field,
 * `checklist_rules: ChecklistRule[]` (see the JSON patch in the handoff report). If a
 * pack has not been patched yet (no `checklist_rules`), every id from the existing
 * `checklists: string[]` field is returned as unconditionally applicable, so callers
 * against the un-patched pack degrade gracefully instead of losing the checklist rows.
 */
export function resolveApplicableChecklists(profile: InstrumentProfile, pack: RulePack): ApplicableChecklist[] {
  const rules = (pack as { checklist_rules?: unknown }).checklist_rules;
  if (Array.isArray(rules) && rules.every(isChecklistRule)) {
    const ctx: PredicateContext = { profile, rangeIdx: 0, pack };
    return rules.map((rule) => {
      const applicable = evaluatePredicate(rule.applies, ctx);
      const result: ApplicableChecklist = { checklistId: rule.id, applicable };
      if (rule.title !== undefined) result.title = rule.title;
      if (rule.clause !== undefined) result.clause = rule.clause;
      if (!applicable) result.reason = reasonForChecklist(rule, profile);
      return result;
    });
  }
  // Graceful fallback for an un-patched pack: no predicate information available.
  return (pack.checklists ?? []).map((id) => ({ checklistId: id, applicable: true }));
}

function isChecklistRule(v: unknown): v is ChecklistRule {
  return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
}

function reasonForChecklist(rule: ChecklistRule, profile: InstrumentProfile): string {
  const clause = rule.clause ?? "R 76-2:2007 §17";
  switch (rule.id) {
    case "17.1":
      return `Not applicable -- checklist 17.1 excludes non-self-indicating instruments (${clause}); this instrument is non-self-indicating.`;
    case "17.2":
      return `Not applicable -- checklist 17.2 applies only to instruments for direct sales to the public or price-computing instruments (${clause}).`;
    case "17.3":
      return `Not applicable -- checklist 17.3 applies only to electronic weighing instruments (${clause}).`;
    case "17.4":
      return `Not applicable -- checklist 17.4 applies only to software-controlled digital devices and instruments (${clause}).`;
    default:
      return `Not applicable to this instrument profile (${clause}).`;
  }
}
