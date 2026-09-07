/**
 * The edition toggle.
 *
 * CLAUDE.md design rule #2 says the standard is data, and gives a reason: R 76 is being
 * rewritten from two parts into five, so a tool that hardcodes a threshold or a clause number
 * dies at the next edition. This file is where that claim is tested rather than asserted.
 *
 * The test is not "the draft pack loads". It is the pair of statements that make the design
 * worth having:
 *
 *   1. **The maths does not move.** Every permissible error the engine resolves under the draft
 *      is identical to the one it resolves under 2007, for the same instrument and the same
 *      load. If a rule pack could change a verdict, pinning one per report would not be enough
 *      to protect an issued certificate.
 *   2. **The report's shape and its citations do move**, and only they. Form 12.3 gains a third
 *      sub-item; every cross-reference is renumbered from annex form to subclause form; forms
 *      16 and 17 leave the test report for Part 4.
 *
 * Both were checked against docs/standards/extracted/R76_Part3_test_report_format_CD.txt before
 * being written here — see docs/VERIFIED.md §19.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRulePack, type RulePack } from "../src/rulepack.js";
import { resolveMpe } from "../src/mpe.js";
import { resolveApplicableTests } from "../src/applicability.js";
import type { InstrumentProfile } from "../src/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(HERE, "../../rulepacks");

const load = (name: string) => JSON.parse(readFileSync(join(PACK_DIR, name), "utf8")) as RulePack;

const edition2007 = load("OIML_R76_2006.json");
const draft = load("OIML_R76_DRAFT_5PART.json");

/** R 76-1 §3.3's worked example, the instrument every golden test is built on. */
const multiInterval: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

describe("the draft five-part pack", () => {
  it("is structurally valid", () => {
    expect(validateRulePack(draft)).toEqual([]);
  });

  it("says plainly that it is a draft and must not back a certificate", () => {
    expect(draft.edition).toBe("draft-5-part");
    expect(String(draft["status"])).toMatch(/draft/i);
    expect(String(draft["status"])).toMatch(/not.*issue a certificate/i);
  });
});

describe("what an edition change does NOT move — the maths", () => {
  it("resolves the identical permissible error at every load of the worked example", () => {
    // The whole multi-interval walk: +/-0.5, +/-1, +/-2, +/-3, +/-10 g.
    for (const load_ of [0, 100, 500, 500.001, 1500, 2000, 2000.001, 3000, 4000, 4000.001, 4500, 5000, 5000.01, 10000, 15000]) {
      const a = resolveMpe(multiInterval, load_, edition2007);
      const b = resolveMpe(multiInterval, load_, draft);
      expect(b.mpe, `mpe differs at ${load_} g`).toBeCloseTo(a.mpe, 9);
      expect(b.factor, `band factor differs at ${load_} g`).toBe(a.factor);
      expect(b.e, `e differs at ${load_} g`).toBeCloseTo(a.e, 9);
      expect(b.rangeIndex, `partial range differs at ${load_} g`).toBe(a.rangeIndex);
    }
  });

  it("keeps the in-service doubling", () => {
    expect(resolveMpe(multiInterval, 4500, draft, "in-service").mpe).toBeCloseTo(
      resolveMpe(multiInterval, 4500, edition2007, "in-service").mpe,
      9,
    );
  });

  it("carries the same classification and band tables", () => {
    expect(draft.classification).toEqual(edition2007.classification);
    expect(draft.mpe_bands_initial).toEqual(edition2007.mpe_bands_initial);
    expect(draft.multi_interval_boundary).toEqual(edition2007.multi_interval_boundary);
    expect(draft.rounding_elimination_when).toBe(edition2007.rounding_elimination_when);
    expect(draft.mpe_in_service_factor).toBe(edition2007.mpe_in_service_factor);
  });

  it("carries the same family-solver constants", () => {
    expect(draft.family_solver?.max_capacity_ratio).toBe(edition2007.family_solver?.max_capacity_ratio);
    expect(draft.family_solver?.max_multiplier).toBe(edition2007.family_solver?.max_multiplier);
  });

  it("resolves the same set of applicable forms for the same instrument", () => {
    // Test *ids* are what the engine reasons about; form numbers are presentation. The draft
    // splits form 12 into its sub-items, so compare the tests both editions actually share.
    const under = (pack: RulePack) =>
      new Set(
        resolveApplicableTests(multiInterval, pack)
          .filter((t) => t.applicable)
          .map((t) => t.testId),
      );
    const a = under(edition2007);
    const b = under(draft);

    for (const id of ["weighing_performance", "eccentricity_weights", "repeatability", "zero_return", "creep", "tare", "warm_up", "voltage_variation", "damp_heat", "span_stability", "stability_of_equilibrium"]) {
      expect(a.has(id), `2007 should apply ${id}`).toBe(true);
      expect(b.has(id), `the draft should apply ${id}`).toBe(true);
    }
    // And neither applies the ones this instrument is exempt from.
    for (const id of ["sensitivity", "eccentricity_rolling", "tilting", "disturbances_road_vehicle"]) {
      expect(a.has(id), `2007 should not apply ${id}`).toBe(false);
      expect(b.has(id), `the draft should not apply ${id}`).toBe(false);
    }
  });
});

describe("what an edition change DOES move — the report's shape", () => {
  it("adds sub-item (c) to form 12.3, surges on signal, data and control lines", () => {
    const surges = draft.tests.find((t) => t.form === "12.3");
    expect(surges).toBeDefined();
    const subItems = (surges as { sub_items?: string[] }).sub_items ?? [];
    expect(subItems).toHaveLength(3);
    expect(subItems[2]).toMatch(/signal, data and control lines/i);
    expect(String((surges as { note?: string }).note)).toMatch(/NEW IN THIS EDITION/);

    // The 2007 pack has one combined disturbances entry and no third sub-item.
    expect(edition2007.tests.some((t) => t.form === "12.3")).toBe(false);
  });

  it("splits the disturbance forms out, where 2007 carried one combined entry", () => {
    const draftDisturbances = draft.tests.filter((t) => t.form.startsWith("12"));
    expect(draftDisturbances.length).toBe(7); // 12.1 through 12.7
    expect(edition2007.tests.filter((t) => t.form.startsWith("12")).length).toBe(2); // 12 and 12.7
  });

  it("renumbers every cross-reference from annex form to subclause form", () => {
    // 2007 cites the annexes: (A.4.4). The draft cites numbered subclauses: (R 76-2, 5.4.1).
    const weighing2007 = edition2007.tests.find((t) => t.id === "weighing_performance")!;
    const weighingDraft = draft.tests.find((t) => t.id === "weighing_performance")!;
    expect(weighing2007.clause).toMatch(/A\.4\.4/);
    expect(weighingDraft.clause).toMatch(/R 76-2 \(CD\) 5\.4\.1/);
    expect(weighingDraft.clause).not.toMatch(/A\.4\.4/);

    // And no draft test still cites an annex reference.
    for (const t of draft.tests) {
      expect(t.clause, `${t.id} still cites an annex`).not.toMatch(/\(A\.\d/);
    }
  });

  it("ends the test report at form 15 — 16 and 17 move to Part 4", () => {
    const forms = draft.tests.map((t) => t.form);
    expect(forms).not.toContain("16");
    expect(forms).not.toContain("17");
    // The 2007 pack keeps the construction examination in the test report.
    expect(edition2007.tests.map((t) => t.form)).toContain("16");
  });

  it("still declares the four checklists, now cited to Part 4", () => {
    const rules = draft["checklist_rules"] as { id: string; clause: string }[];
    expect(rules.map((r) => r.id)).toEqual(["17.1", "17.2", "17.3", "17.4"]);
    for (const r of rules) expect(r.clause).toMatch(/R 76-4/);
  });

  it("records what changed and what did not, so the pack explains itself", () => {
    const notes = draft["edition_notes"] as { differences_from_2007: string[]; unchanged: string[] };
    expect(notes.differences_from_2007.length).toBeGreaterThanOrEqual(4);
    expect(notes.unchanged.join(" ")).toMatch(/Table 6|maximum permissible/i);
  });
});
