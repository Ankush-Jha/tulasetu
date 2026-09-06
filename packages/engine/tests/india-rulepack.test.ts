/**
 * Conformance tests for the India rule pack (Legal Metrology (General) Rules, 2011,
 * Seventh Schedule, Heading A), mirroring packages/engine/tests/rulepack-conformance.test.ts's
 * pattern of loading the real JSON off disk rather than transcribing it.
 *
 * Every assertion here traces to docs/research/heading-a-verified.md, which re-derives each
 * number from docs/research/heading-a-raw.txt directly (not copied from OIML_R76_2006.json).
 * Where the verification found India genuinely differs from OIML, the test asserts the
 * difference rather than parity — see the "genuine differences" describe block below.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRulePack, normalizeClass, type RulePack } from "../src/rulepack.js";
import { resolveMpe } from "../src/mpe.js";
import { resolveApplicableTests } from "../src/applicability.js";
import type { InstrumentProfile } from "../src/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(HERE, "../../rulepacks");

function loadPack(name: string): RulePack {
  return JSON.parse(readFileSync(join(PACK_DIR, name), "utf8")) as RulePack;
}
function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(join(PACK_DIR, path), "utf8"));
}

const india = loadPack("IN_Sch7A_2011.json");
const oiml = loadPack("OIML_R76_2006.json");

// ---------------------------------------------------------------------------
// A tiny hand-rolled JSON Schema (draft-07 subset) structural validator.
//
// Task instructions allow "a tiny hand-rolled structural check or add ajv". ajv is present in
// node_modules only as an incidental transitive dependency of some other tool (not declared in
// any package.json in this repo), and this task's file-ownership boundary does not include any
// package.json -- so a hand-rolled walk of the specific draft-07 keywords actually used in
// packages/rulepacks/rulepack.schema.json (type, enum, properties, required,
// additionalProperties, items, pattern, minItems, minLength, minProperties, minimum,
// exclusiveMinimum, anyOf, $ref, uniqueItems) is the safer choice here. No dependency added.
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  // Only local "#/definitions/xxx" refs are used in this schema.
  const m = /^#\/definitions\/(.+)$/.exec(ref);
  if (!m || m[1] === undefined) throw new Error(`Unsupported $ref: ${ref}`);
  const defs = root.definitions as Record<string, JsonSchema> | undefined;
  const found = defs?.[m[1]];
  if (!found) throw new Error(`$ref not found: ${ref}`);
  return found;
}

/** Validate `value` against `schema`, collecting human-readable error strings at `path`. */
function validate(value: unknown, schema: JsonSchema, root: JsonSchema, path: string, errors: string[]): void {
  if (typeof schema.$ref === "string") {
    validate(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const subErrors: string[][] = [];
    const ok = (schema.anyOf as JsonSchema[]).some((s) => {
      const local: string[] = [];
      validate(value, s, root, path, local);
      subErrors.push(local);
      return local.length === 0;
    });
    if (!ok) errors.push(`${path}: matched none of anyOf (${JSON.stringify(subErrors)})`);
    return;
  }

  const type = schema.type as string | undefined;
  if (type) {
    if (type === "integer") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push(`${path}: expected type integer, got ${typeof value}`);
        return;
      }
    } else {
      const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      if (actual !== type) {
        errors.push(`${path}: expected type ${type}, got ${actual}`);
        return;
      }
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: "${value}" does not match pattern ${schema.pattern}`);
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      errors.push(`${path}: ${value} <= exclusiveMinimum ${schema.exclusiveMinimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path}: array shorter than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) errors.push(`${path}: items are not unique`);
    }
    const itemSchema = schema.items as JsonSchema | undefined;
    if (itemSchema) {
      value.forEach((v, i) => validate(v, itemSchema, root, `${path}[${i}]`, errors));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof schema.minProperties === "number" && Object.keys(obj).length < schema.minProperties) {
      errors.push(`${path}: object has fewer than minProperties ${schema.minProperties}`);
    }
    for (const req of (schema.required as string[] | undefined) ?? []) {
      if (!(req in obj)) errors.push(`${path}: missing required property "${req}"`);
    }
    const props = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
    const additional = schema.additionalProperties;
    for (const [key, v] of Object.entries(obj)) {
      const propSchema = props[key];
      if (propSchema) {
        validate(v, propSchema, root, `${path}.${key}`, errors);
      } else if (additional === false) {
        errors.push(`${path}: unexpected property "${key}" (additionalProperties: false)`);
      } else if (additional && typeof additional === "object") {
        validate(v, additional as JsonSchema, root, `${path}.${key}`, errors);
      }
    }
  }
}

function validateAgainstSchema(pack: unknown, schema: JsonSchema): string[] {
  const errors: string[] = [];
  validate(pack, schema, schema, "$", errors);
  return errors;
}

const schema = loadJson("rulepack.schema.json") as JsonSchema;

// ---------------------------------------------------------------------------

describe("IN_Sch7A_2011 rule pack — structural validation", () => {
  it("passes validateRulePack with no issues", () => {
    expect(validateRulePack(india)).toEqual([]);
  });

  it("validates against the extended JSON Schema", () => {
    expect(validateAgainstSchema(india, schema)).toEqual([]);
  });

  it("OIML_R76_2006 also still validates against the extended JSON Schema", () => {
    expect(validateAgainstSchema(oiml, schema)).toEqual([]);
  });
});

describe("IN_Sch7A_2011 — Table 17 / Table 20 / Table 18, verified identical to OIML", () => {
  // docs/research/heading-a-verified.md §1, §2, §4 — re-derived independently from
  // heading-a-raw.txt, not copied from the OIML pack, and found numerically identical.

  it("reproduces Table 17 (= OIML Table 3) exactly", () => {
    expect(india.classification).toEqual(oiml.classification);
  });

  it("reproduces Table 20 (= OIML Table 6) exactly", () => {
    expect(india.mpe_bands_initial).toEqual(oiml.mpe_bands_initial);
  });

  it("carries an India clause, not an OIML one, for Table 20", () => {
    expect(india.mpe_clause).toMatch(/Seventh Schedule|Heading A/);
    expect(india.mpe_clause).not.toMatch(/R 76/);
  });

  it("doubles mpe for inspection (in-service), same factor as OIML", () => {
    expect(india.mpe_in_service_factor).toBe(2);
  });

  it("reproduces Table 18 (= OIML Table 4) multi-interval boundaries exactly", () => {
    expect(india.multi_interval_boundary).toEqual(oiml.multi_interval_boundary);
  });
});

describe("IN_Sch7A_2011 — mpe resolver produces the same numbers as OIML for the same instrument", () => {
  // The R 76-1 §3.3 worked example (Max 2/5/15 kg, e 1/2/10 g, class III), driven through the
  // India pack instead of the OIML pack. Since Table 17/18/20 are verified identical, the
  // resolved mpe must be identical too -- this is the "one engine, one maths" claim made concrete.
  const profile: InstrumentProfile = {
    unit: "g",
    accuracyClass: "III",
    indicatingType: "self",
    rangeKind: "multi-interval",
    electronic: true,
    ranges: [
      { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
      { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
      { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
    ],
  };

  it.each([
    [100, 0.5],
    [1500, 1],
    [4000, 2],
    [4500, 3],
    [10000, 10],
  ])("load %i g -> mpe %f g, same as OIML", (load, expected) => {
    const indiaResult = resolveMpe(profile, load, india);
    const oimlResult = resolveMpe(profile, load, oiml);
    expect(indiaResult.mpe).toBeCloseTo(expected, 9);
    expect(indiaResult.mpe).toBeCloseTo(oimlResult.mpe, 9);
  });

  it("doubles every limit in inspection (in-service), matching OIML", () => {
    const indiaResult = resolveMpe(profile, 4500, india, "in-service");
    const oimlResult = resolveMpe(profile, 4500, oiml, "in-service");
    expect(indiaResult.mpe).toBeCloseTo(6, 9);
    expect(indiaResult.mpe).toBeCloseTo(oimlResult.mpe, 9);
  });
});

describe("IN_Sch7A_2011 — class symbol normalization", () => {
  it("resolves India's IV to the canonical IIII", () => {
    expect(normalizeClass("IV", india)).toBe("IIII");
  });

  it("still resolves the IIII spelling used in India's own tilting/endurance clauses", () => {
    expect(normalizeClass("IIII", india)).toBe("IIII");
  });
});

describe("IN_Sch7A_2011 — class II* tilting rule (Heading A §11(i)(a), verified verbatim)", () => {
  // docs/research/heading-a-verified.md §6: "Tilting at no-load (class II*, III and IIII)" --
  // plain class II is excluded from the no-load sub-test; only class II with
  // directSalesToPublic === true (class II*) gets it. Loaded tilting applies to both.
  const base: Omit<InstrumentProfile, "directSalesToPublic"> = {
    unit: "g",
    accuracyClass: "II",
    indicatingType: "self",
    rangeKind: "single",
    electronic: true,
    tiltable: true,
    ranges: [{ e: 1, d: 1, max: 15000, min: 20, n: 15000 }],
  };

  it("class II* (directSalesToPublic: true): no-load tilting is applicable", () => {
    const profile: InstrumentProfile = { ...base, directSalesToPublic: true };
    const tests = resolveApplicableTests(profile, india);
    const noLoad = tests.find((t) => t.testId === "tilting_no_load");
    const loaded = tests.find((t) => t.testId === "tilting");
    expect(noLoad?.applicable).toBe(true);
    expect(loaded?.applicable).toBe(true);
  });

  it("plain class II (directSalesToPublic not set): no-load tilting is NOT applicable, loaded tilting still is", () => {
    const profile: InstrumentProfile = { ...base };
    const tests = resolveApplicableTests(profile, india);
    const noLoad = tests.find((t) => t.testId === "tilting_no_load");
    const loaded = tests.find((t) => t.testId === "tilting");
    expect(noLoad?.applicable).toBe(false);
    expect(loaded?.applicable).toBe(true);
  });

  it("class III gets no-load tilting regardless of direct-sales status", () => {
    const profile: InstrumentProfile = { ...base, accuracyClass: "III" };
    const tests = resolveApplicableTests(profile, india);
    const noLoad = tests.find((t) => t.testId === "tilting_no_load");
    expect(noLoad?.applicable).toBe(true);
  });
});

describe("IN_Sch7A_2011 — genuine differences from OIML (docs/research/heading-a-verified.md §8)", () => {
  it("discrimination applies unconditionally -- Heading A has no 'd >= 5 mg' exemption", () => {
    const indiaRule = india.tests.find((t) => t.id === "discrimination");
    const oimlRule = oiml.tests.find((t) => t.id === "discrimination");
    expect(indiaRule?.applies).toEqual({ always: true });
    // OIML's own rule is the negated exemption -- confirms the two packs really do differ here,
    // not just in how the same rule happens to be spelled.
    expect(oimlRule?.applies).toEqual({ not: { digital_d_lt_5mg: true } });
  });

  it("uses the full mpe (not OIML's 0.4x) as the non-self-indicating discrimination extra load", () => {
    const params = (india.kernel_params as Record<string, { non_self_extra_load_fraction?: number }>)
      .discrimination;
    const oimlParams = (oiml.kernel_params as Record<string, { non_self_extra_load_fraction?: number }>)
      .discrimination;
    expect(params?.non_self_extra_load_fraction).toBe(1.0);
    expect(oimlParams?.non_self_extra_load_fraction).toBe(0.4);
  });

  it("omits family_solver and module_error_fractions -- no textual basis in Heading A", () => {
    expect(india.family_solver).toBeUndefined();
    expect(india.module_error_fractions).toBeUndefined();
    // OIML carries both -- confirms this is an intentional omission, not a missing copy-paste.
    expect(oiml.family_solver).toBeDefined();
    expect(oiml.module_error_fractions).toBeDefined();
  });

  it("omits checklist_rules -- Heading A has no R 76-2-style §17 checklist apparatus", () => {
    expect(india.checklist_rules).toBeUndefined();
    expect(oiml.checklist_rules).toBeDefined();
  });

  it("has no disturbances_road_vehicle test (form 12.7) -- no Annexure A equivalent", () => {
    expect(india.tests.find((t) => t.id === "disturbances_road_vehicle")).toBeUndefined();
    expect(oiml.tests.find((t) => t.id === "disturbances_road_vehicle")).toBeDefined();
  });
});

describe("IN_Sch7A_2011 — every test carries an India clause, not an OIML one", () => {
  it("cites Heading A, never 'R 76', for every test rule", () => {
    for (const t of india.tests) {
      expect(t.clause, `test ${t.id} has no clause`).toBeTruthy();
      expect(t.clause, `test ${t.id} clause should cite Heading A, not OIML`).not.toMatch(/^R 76/);
    }
  });
});
