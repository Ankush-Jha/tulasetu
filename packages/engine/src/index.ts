/**
 * @tulasetu/engine — the deterministic calculation core.
 *
 * Pure functions only: no I/O, no database, no UI, no clock, no randomness. Input is
 * observations plus a rule pack; output is errors, resolved mpe values and verdicts. That
 * constraint is what makes the engine exhaustively unit-testable against the standards' own
 * worked examples, which is in turn the whole argument that the results are court-defensible
 * (CLAUDE.md design rules #1 and #3).
 *
 * No machine-learning model participates in anything reachable from this file.
 */

// --- Domain types and the rule-pack contract -------------------------------
export * from "./types.js";
export * from "./rulepack.js";

// --- Resolvers --------------------------------------------------------------
export * from "./mpe.js";
export * from "./applicability.js";
export * from "./validate.js";

// --- Solvers ----------------------------------------------------------------
export * from "./family.js";
export * from "./annexF.js";

// --- Kernels ----------------------------------------------------------------
// K2 and K4 each declare a local `MpeLookup` (identical shape) so that they stay independently
// testable without importing the resolver. Re-exporting both through one barrel would collide,
// so the canonical name is exported once here and the kernels' own copies are not re-exported.
export type { MpeLookup } from "./kernels/k2.js";

export { k1ErrorVsMpe, type K1Input, type K1Output } from "./kernels/k1.js";
export {
  k2Digital,
  k2Analog,
  k2NonSelfIndicating,
  type K2DigitalTrial,
  type K2DigitalParams,
  type K2DigitalResult,
  type K2AnalogTrial,
  type K2AnalogParams,
  type K2AnalogResult,
  type K2NonSelfTrial,
  type K2NonSelfParams,
  type K2NonSelfResult,
} from "./kernels/k2.js";
export * from "./kernels/k3.js";
export {
  k4Creep,
  k4ZeroReturn,
  k4TemperatureNoLoad,
  k4SpanStability,
  type K4CreepReading,
  type K4CreepInput,
  type K4CreepResult,
  type K4ZeroReturnInput,
  type K4ZeroReturnResult,
  type K4TemperatureNoLoadInput,
  type K4TemperatureNoLoadParams,
  type K4TemperatureNoLoadResult,
  type K4SpanStabilityMeasurement,
  type K4SpanStabilityInput,
  type K4SpanStabilityResult,
} from "./kernels/k4.js";
export * from "./kernels/k5.js";

// K6 exists because R 76-2 form 7 does not reduce to the other five: it is two checks against
// fixed multiples of e that never consult the resolved mpe. See docs/VERIFIED.md §14.
export * from "./kernels/k6.js";
