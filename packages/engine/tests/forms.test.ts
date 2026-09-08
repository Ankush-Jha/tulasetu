/**
 * The form runner, against the tests each form is actually made of.
 *
 * The bug these exist to prevent is specific and was live: every form was run through K1, so a
 * creep form returned "PASSED" because its readings happened to sit inside the mpe — a verdict
 * on a question the form does not ask. Each case below therefore checks not merely that a
 * verdict comes back, but that it comes back for the *right reason*: a creep row that passes
 * the mpe check and fails the 0.5 e check must read FAILED, and vice versa.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runForm, type FormsFile } from "../src/forms.js";
import type { InstrumentProfile } from "../src/types.js";
import type { RulePack } from "../src/rulepack.js";

const ROOT = join(__dirname, "../../..");
const pack = JSON.parse(
  readFileSync(join(ROOT, "packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;
const forms = JSON.parse(
  readFileSync(join(ROOT, "packages/rulepacks/forms/R76-2_2007_forms.json"), "utf8"),
) as FormsFile;

/** R 76-1 §3.3's worked example: Max 2/5/15 kg, e 1/2/10 g, class III. */
const multiInterval: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  ranges: [
    { e: 1, d: 1, min: 20, max: 2000, n: 2000 },
    { e: 2, d: 2, min: 2000, max: 5000, n: 2500 },
    { e: 10, d: 10, min: 5000, max: 15000, n: 1500 },
  ],
};

const nonSelf: InstrumentProfile = {
  ...multiInterval,
  indicatingType: "non-self",
  electronic: false,
  rangeKind: "single",
  ranges: [{ e: 10, d: 10, min: 200, max: 30000, n: 3000 }],
};

describe("every form is run by the kernel its rule pack names", () => {
  it("routes each form to the kernel the pack declares, never to K1 by default", () => {
    const expected: Record<string, string> = {
      "1": "K1", "2": "K4", "3.1": "K1", "4.1.1": "K2", "4.2": "K3",
      "6.1": "K4", "6.2": "K4", "7": "K6", "12.1": "K5", "14": "K4",
    };
    for (const [formId, kernel] of Object.entries(expected)) {
      const rule = pack.tests.find((t) => t.form === formId);
      expect(rule?.kernel, `form ${formId}`).toBe(kernel);
    }
  });

  it("refuses a form no rule names rather than inventing a verdict", () => {
    expect(() =>
      runForm({ formId: "99", profile: multiInterval, rows: [] }, pack, forms),
    ).toThrow(/No test rule/);
  });

  it("every form the pack emits has a printed layout to render into", () => {
    const layouts = new Set(forms.forms.map((f) => f.formId));
    for (const t of pack.tests) {
      expect(layouts.has(t.form), `form ${t.form} (${t.id}) has no printed layout`).toBe(true);
    }
  });
});

describe("K1 — weighing performance (form 1)", () => {
  it("computes the error and walks the mpe band across a partial-range boundary", () => {
    const out = runForm(
      {
        formId: "1",
        profile: multiInterval,
        rows: [
          { load: 0, indication: 0, additionalLoad: 0 },
          { load: 500, indication: 500, additionalLoad: 0 },
          { load: 5000, indication: 5000, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K1");
    expect(out.verdict).toBe("PASSED");
    // The band widens with the load: 500 g sits in e1 = 1 g, 5000 g in e2 = 2 g.
    expect(Number(out.rows[1]!["mpe"])).toBeLessThan(Number(out.rows[2]!["mpe"]));
  });

  it("fails a row whose corrected error exceeds the band", () => {
    const out = runForm(
      {
        formId: "1",
        profile: multiInterval,
        rows: [
          { load: 0, indication: 0, additionalLoad: 0 },
          { load: 1000, indication: 1005, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("FAILED");
    expect(out.rows[1]!.verdict).toBe("FAILED");
  });
});

describe("K4 — creep (form 6.2) is judged on ΔP, not on error against mpe", () => {
  /**
   * The regression this file exists for. At 1000 g the mpe is ±0.5 g (0.5 e₁); a drift of
   * 0.4 g would pass a K1 check. But creep's condition a) allows only 0.5 e = 0.5 g at 30 min
   * *and* 0.2 e = 0.2 g between the 15- and 30-minute readings — so a reading that drifts
   * steadily fails on the second clause while looking fine to K1.
   */
  it("fails a drift that K1 would have passed", () => {
    const out = runForm(
      {
        formId: "6.2",
        profile: multiInterval,
        rows: [
          { timeOfReading: "0 min", load: 1000, indication: 1000, additionalLoad: 0 },
          { timeOfReading: "5 min", load: 1000, indication: 1000.2, additionalLoad: 0 },
          { timeOfReading: "15 min", load: 1000, indication: 1000.3, additionalLoad: 0 },
          { timeOfReading: "30 min", load: 1000, indication: 1000.9, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K4");
    // 0.9 g of creep exceeds 0.5 e = 0.5 g at 30 minutes.
    expect(out.summary[0]!.verdict).toBe("FAILED");
    expect(out.rows[3]!["deltaP"]).toBeCloseTo(0.9, 6);
  });

  it("passes a settled instrument and terminates at condition a)", () => {
    const out = runForm(
      {
        formId: "6.2",
        profile: multiInterval,
        rows: [
          { timeOfReading: "0 min", load: 1000, indication: 1000, additionalLoad: 0 },
          { timeOfReading: "15 min", load: 1000, indication: 1000.1, additionalLoad: 0 },
          { timeOfReading: "30 min", load: 1000, indication: 1000.2, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("PASSED");
    expect(out.summary[0]!.verdict).toBe("PASSED");
  });

  it("fills the form's own P and ΔP columns rather than leaving them blank", () => {
    const out = runForm(
      {
        formId: "6.2",
        profile: multiInterval,
        rows: [
          { timeOfReading: "0 min", load: 1000, indication: 1000, additionalLoad: 0 },
          { timeOfReading: "30 min", load: 1000, indication: 1000.1, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    // P = I + ½e − ΔL, with e = 1 g at 1000 g.
    expect(out.rows[0]!["p"]).toBeCloseTo(1000.5, 6);
    expect(out.rows[1]!["deltaP"]).toBeCloseTo(0.1, 6);
  });
});

describe("K2 — discrimination (form 4.1.1) is judged on whether the indication moved by d", () => {
  it("passes when adding 1.4 d moves the indication by at least d", () => {
    const out = runForm(
      {
        formId: "4.1.1",
        profile: multiInterval,
        rows: [{ load: 1000, indication1: 1000, extraLoad: 1.4, indication2: 1001 }],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K2");
    expect(out.verdict).toBe("PASSED");
    expect(out.rows[0]!["difference"]).toBeCloseTo(1, 6);
  });

  it("fails when the indication does not move a whole scale interval", () => {
    const out = runForm(
      {
        formId: "4.1.1",
        profile: multiInterval,
        rows: [{ load: 1000, indication1: 1000, extraLoad: 1.4, indication2: 1000 }],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("FAILED");
  });
});

describe("K3 — sensitivity (form 4.2) is judged in millimetres", () => {
  it("requires 5 mm on a non-self-indicating instrument above 1000 kg-equivalent bounds", () => {
    const out = runForm(
      {
        formId: "4.2",
        profile: nonSelf,
        rows: [{ load: 15000, extraLoad: 30, permanentDisplacement: 3 }],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K3");
    // Class III at Max 30 kg requires 1 mm; 3 mm clears it.
    expect(out.verdict).toBe("PASSED");
    expect(out.summary[0]!.value).toMatch(/mm/);
  });

  it("fails a displacement below the class threshold", () => {
    const out = runForm(
      {
        formId: "4.2",
        profile: nonSelf,
        rows: [{ load: 15000, extraLoad: 30, permanentDisplacement: 0 }],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("FAILED");
  });
});

describe("K5 — disturbances (form 12.1) are judged on significant faults", () => {
  it("treats a fault larger than e as significant unless it was detected", () => {
    const out = runForm(
      {
        formId: "12.1",
        profile: multiInterval,
        rows: [
          { load: 1000, indication: 1000, label: "without disturbance" },
          { load: 1000, amplitude: 40, durationCycles: 10, indication: 1005 },
        ],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K5");
    // A 5 g excursion against e = 1 g, undetected.
    expect(out.verdict).toBe("FAILED");
    expect(out.rows[1]!["fault"]).toBeCloseTo(5, 6);
  });

  it("excuses the same fault when the instrument detected and reacted to it", () => {
    const out = runForm(
      {
        formId: "12.1",
        profile: multiInterval,
        rows: [
          { load: 1000, indication: 1000 },
          { load: 1000, indication: 1005, significantFaultYes: true },
        ],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("PASSED");
  });

  it("passes a disturbance that moved the indication by less than e", () => {
    const out = runForm(
      {
        formId: "12.1",
        profile: multiInterval,
        rows: [
          { load: 1000, indication: 1000 },
          { load: 1000, indication: 1000.5 },
        ],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("PASSED");
  });
});

describe("K6 — stability of equilibrium (form 7) checks fixed multiples of e", () => {
  it("fails a printed value more than 1 e from the readings observed", () => {
    const out = runForm(
      {
        formId: "7",
        profile: multiInterval,
        rows: [
          {
            subform: "print", load: 1000, printedValue: 1000,
            minimumReading: 1000, maximumReading: 1003,
          },
        ],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K6");
    expect(out.verdict).toBe("FAILED");
  });

  it("judges each sub-table against the e in force at its own load", () => {
    /**
     * The three sub-tables are run at different loads: printing at about half of Max,
     * zero-setting at no load, tare balancing part-way up. On the worked example those fall in
     * three different partial ranges, so they are held to 0.25 × 1 g, 0.25 × 2 g and 1 e = 10 g
     * respectively. Resolving one e for the whole form judged the zero-setting trials against
     * the interval in force near Max — ten times too loose.
     */
    const out = runForm(
      {
        formId: "7",
        profile: multiInterval,
        rows: [
          // At 7 500 g, e₃ = 10 g, so a 5 g print deviation is inside the 1 e limit.
          { subform: "print", load: 7500, printedValue: 7505, minimumReading: 7500, maximumReading: 7500 },
          // At no load, e₁ = 1 g, so the limit is 0.25 g and an error of 0.5 g fails.
          { subform: "zero", zeroLoad: 0, load0: 10, indication: 10, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.summary.find((s) => s.label === "Printing")?.verdict).toBe("PASSED");
    expect(out.summary.find((s) => s.label === "Zero-setting")?.verdict).toBe("FAILED");
    // The threshold each sub-table was held to is stated, not merely applied.
    expect(out.summary.find((s) => s.label === "Zero-setting")?.value).toContain("0.25");
    expect(out.summary.find((s) => s.label === "Printing")?.value).toContain("10");
  });

  it("passes zero-setting within 0.25 e", () => {
    const out = runForm(
      {
        formId: "7",
        profile: multiInterval,
        rows: [{ subform: "zero", zeroLoad: 0, load0: 10, indication: 10, additionalLoad: 0.5 }],
      },
      pack, forms,
    );
    expect(out.summary.find((s) => s.label === "Zero-setting")?.verdict).toBe("PASSED");
  });
});

describe("K4 — temperature at no load (form 2) normalises drift per 5 °C", () => {
  it("fails a zero that drifts more than e over the reference interval", () => {
    const out = runForm(
      {
        formId: "2",
        profile: multiInterval,
        rows: [
          { time: "0", temperature: 20, zeroIndication: 0, additionalLoad: 0 },
          { time: "1", temperature: 25, zeroIndication: 3, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.kernel).toBe("K4");
    // 3 g of drift over 5 °C against e₁ = 1 g.
    expect(out.verdict).toBe("FAILED");
    expect(out.rows[1]!["zeroChangePerInterval"]).toBeCloseTo(3, 6);
  });

  it("passes a stable zero", () => {
    const out = runForm(
      {
        formId: "2",
        profile: multiInterval,
        rows: [
          { time: "0", temperature: 20, zeroIndication: 0, additionalLoad: 0 },
          { time: "1", temperature: 25, zeroIndication: 0.2, additionalLoad: 0 },
        ],
      },
      pack, forms,
    );
    expect(out.verdict).toBe("PASSED");
  });
});

describe("every computed column a form declares is one the runner can fill", () => {
  /**
   * The contract between the two data files: if the printed form has a computed column, the
   * kernel that owns the form must produce it. A column the runner never fills prints as a
   * blank cell on a legal document, which reads as "not measured" rather than "not implemented".
   */
  const sampleRows: Record<string, Record<string, unknown>[]> = {
    "1": [{ load: 0, indication: 0, additionalLoad: 0 }, { load: 1000, indication: 1000, additionalLoad: 0 }],
    "3.1": [{ location: 1, load: 1000, indication: 1000, additionalLoad: 0 }],
    "6.2": [
      { timeOfReading: "0 min", load: 1000, indication: 1000, additionalLoad: 0 },
      { timeOfReading: "30 min", load: 1000, indication: 1000.1, additionalLoad: 0 },
    ],
    "4.1.1": [{ load: 1000, indication1: 1000, extraLoad: 1.4, indication2: 1001 }],
    "4.1.2": [{ load: 1000, indication1: 1000, extraLoad: 0.5, indication2: 1000.5 }],
    "2": [
      { time: "0", temperature: 20, zeroIndication: 0, additionalLoad: 0 },
      { time: "1", temperature: 25, zeroIndication: 0.1, additionalLoad: 0 },
    ],
  };

  for (const [formId, rows] of Object.entries(sampleRows)) {
    it(`fills every computed column of form ${formId}`, () => {
      const spec = forms.forms.find((f) => f.formId === formId)!;
      const profile = formId === "4.1.2" ? { ...multiInterval, electronic: false } : multiInterval;
      const out = runForm({ formId, profile, rows: rows as never }, pack, forms);
      const computed = (spec.columns ?? []).filter((c) => c.kind === "computed");
      const last = out.rows[out.rows.length - 1]!;
      for (const col of computed) {
        expect(last[col.key], `form ${formId} column ${col.key} was left blank`).toBeDefined();
      }
    });
  }
});
