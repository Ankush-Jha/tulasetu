/**
 * Passing observation rows for any R 76-2 form, shaped the way the form is printed.
 *
 * The route tests used to post the same three load/indication rows into every applicable form.
 * That passed only because the server ran K1 on everything; once each form is run by its own
 * kernel, weighing rows say nothing about a creep test or a disturbance test, and the server
 * rightly refuses them. So the fixtures have to know what each form is made of — which is the
 * point, because a test that posts the wrong shape and still goes green is a test that would
 * not have caught the bug it exists for.
 *
 * Every row set here is deliberately *passing* for the R 76-1 §3.3 worked-example instrument
 * (Max 2/5/15 kg, e 1/2/10 g, class III), so a test can walk a whole report to a lockable
 * state. Failure cases are written inline where they are being tested.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACK = JSON.parse(
  readFileSync(join(ROOT, "packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as { tests: { form: string; kernel: string }[] };

/** Which kernel decides a form — read from the pack, so the fixtures cannot drift from it. */
export function kernelOf(formId: string): string {
  return PACK.tests.find((t) => t.form === formId)?.kernel ?? "K1";
}

export interface FormPayload {
  rows: Record<string, unknown>[];
  extras?: Record<string, unknown>;
}

/** Weighing rows: zero plus two loads, both indicating exactly. */
const weighing = [
  { load: 0, indication: 0, additionalLoad: 0, label: "zero" },
  { load: 1000, indication: 1000, additionalLoad: 0 },
  { load: 4500, indication: 4500, additionalLoad: 0 },
];

export function payloadFor(formId: string, kernel = kernelOf(formId)): FormPayload {
  switch (formId) {
    // --- K4 --------------------------------------------------------------
    case "2": // Temperature effect on no-load indication
      return {
        rows: [
          { time: "0", temperature: 20, zeroIndication: 0, additionalLoad: 0 },
          { time: "1", temperature: 25, zeroIndication: 0.1, additionalLoad: 0 },
        ],
      };
    case "6.1": // Zero return
      return {
        rows: [
          { timeOfReading: "0 min", indicationOfZero: 0, additionalLoad: 0 },
          { timeOfReading: "30 min", indicationOfZero: 0, additionalLoad: 0 },
        ],
        extras: { testLoad: 1000 },
      };
    case "6.2": // Creep — settled, so condition a) is met and the test terminates
      return {
        rows: [
          { timeOfReading: "0 min", load: 1000, indication: 1000, additionalLoad: 0 },
          { timeOfReading: "15 min", load: 1000, indication: 1000, additionalLoad: 0 },
          { timeOfReading: "30 min", load: 1000, indication: 1000, additionalLoad: 0 },
        ],
      };
    case "14": // Span stability — two measurements with the same error, so no variation
      return {
        rows: [
          { no: 1, indicationOfZero: 0, additionalLoad0: 0, indicationOfLoad: 15000, additionalLoad: 0 },
          { no: 2, indicationOfZero: 0, additionalLoad0: 0, indicationOfLoad: 15000, additionalLoad: 0 },
        ],
        extras: { testLoad: 15000 },
      };

    // --- K2 --------------------------------------------------------------
    case "4.1.1": // Discrimination, digital: 1.4 d added, indication rises by d
      return { rows: [{ load: 1000, indication1: 1000, extraLoad: 1.4, indication2: 1001 }] };
    case "4.1.2": // Discrimination, analog: displacement of at least 0.7 |mpe|
      return { rows: [{ load: 1000, indication1: 1000, extraLoad: 0.5, indication2: 1000.5 }] };
    case "4.1.3": // Discrimination, non-self: a visible displacement, marked "+"
      return { rows: [{ load: 1000, indication: 1000, extraLoad: 0.2, visibleDisplacement: true }] };

    // --- K3 --------------------------------------------------------------
    case "4.2": // Sensitivity — class III below 1000 kg requires 1 mm
      return { rows: [{ load: 1000, extraLoad: 0.5, permanentDisplacement: 5 }] };

    // --- K6 --------------------------------------------------------------
    case "7": // Stability of equilibrium — printed value inside the observed window
      return {
        rows: [
          {
            subform: "print", load: 1000, printedValue: 1000,
            minimumReading: 1000, maximumReading: 1000, distinctValuesIndicated: 1,
          },
          { subform: "zero", appliedLoad: 0, l0: 10, indication: 10, additionalLoad: 0 },
          { subform: "tare", appliedLoad: 0, l0: 10, indication: 10, additionalLoad: 0 },
        ],
      };

    default:
      break;
  }

  // --- K5: every disturbance form ---------------------------------------
  // A baseline reading followed by a disturbed one that moved less than e — no fault.
  if (kernel === "K5") {
    return {
      rows: [
        { load: 1000, indication: 1000, label: "without disturbance" },
        { load: 1000, indication: 1000, significantFaultNo: true },
      ],
    };
  }

  // --- K1: everything else ----------------------------------------------
  // Forms 8 and 10 record a load *condition* rather than a load, so they carry the test load
  // in the header the way the printed form does.
  if (formId === "10") {
    return {
      rows: [
        { time: "0", loadCondition: "Unloaded", indication: 0, additionalLoad: 0 },
        { time: "0", loadCondition: "Loaded", indication: 1000, additionalLoad: 0 },
        { time: "30 min", loadCondition: "Unloaded", indication: 0, additionalLoad: 0 },
        { time: "30 min", loadCondition: "Loaded", indication: 1000, additionalLoad: 0 },
      ],
      extras: { testLoad: 1000 },
    };
  }
  if (formId === "8") {
    return {
      rows: [
        { loadCondition: "Unloaded", position: "reference", indication: 0, additionalLoad: 0 },
        { loadCondition: "Loaded", position: "tilted", indication: 1000, additionalLoad: 0 },
      ],
      extras: { testLoad: 1000 },
    };
  }
  if (formId === "3.1" || formId === "3.2") {
    return { rows: weighing.map((r, i) => ({ ...r, location: i + 1 })) };
  }
  if (formId === "5") {
    return { rows: weighing.map((r, i) => ({ ...r, weighingNo: i + 1 })) };
  }
  if (formId === "11") {
    return { rows: weighing.map((r) => ({ ...r, voltage: 230 })) };
  }
  return { rows: weighing.map((r) => ({ ...r })) };
}
