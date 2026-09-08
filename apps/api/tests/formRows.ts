/**
 * Observation rows for any R 76-2 form, in the shape the form is printed in.
 *
 * The route tests used to post the same three load/indication rows into every applicable form.
 * That passed only because the server ran K1 on everything; once each form is run by its own
 * kernel, weighing rows say nothing about a creep test or a disturbance test, and the server
 * rightly refuses them. So the fixtures have to know what each form is made of — which is the
 * point, because a test that posts the wrong shape and still goes green is a test that would
 * not have caught the bug it exists for.
 *
 * The row sets themselves live in `src/domain/demo.ts`, because the demonstration seeder needs
 * exactly the same thing and two copies of this knowledge would be two things to keep in step.
 * This file only supplies the kernel lookup, read from the rule pack so the fixtures cannot
 * drift from what the runner will actually dispatch on.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { observationsFor, type FormPayload, type InstrumentShape } from "../src/domain/demo.js";

/** R 76-1 §3.3's worked example — the instrument the route and render tests are built on. */
const WORKED_EXAMPLE: InstrumentShape = {
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20 },
    { e: 2, d: 2, max: 5000, min: 2000 },
    { e: 10, d: 10, max: 15000, min: 5000 },
  ],
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACK = JSON.parse(
  readFileSync(join(ROOT, "packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as { tests: { form: string; kernel: string }[] };

/** Which kernel decides a form — read from the pack, so the fixtures cannot drift from it. */
export function kernelOf(formId: string): string {
  return PACK.tests.find((t) => t.form === formId)?.kernel ?? "K1";
}

/**
 * Rows that make `formId` pass, for the R 76-1 §3.3 worked-example instrument.
 *
 * Failure cases are written inline where they are being tested, so a reader sees the reading
 * that breaks the rule next to the assertion about it.
 */
export function payloadFor(formId: string, kernel = kernelOf(formId)): FormPayload {
  return observationsFor(formId, kernel, WORKED_EXAMPLE);
}
