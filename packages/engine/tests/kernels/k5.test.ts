/**
 * Golden tests for K5 (significant fault), derived from:
 *  - R 76-1 §T.5.5.5 (fault), §T.5.5.6 (significant fault, incl. its four exclusions)
 *  - R 76-1 §5.1.1 (compliance: no significant faults, OR detected and acted upon)
 *    and its Note: "A fault equal to or smaller than e is allowed irrespective of the
 *    value of the error of indication."
 *  - R 76-1 §5.2 (acting upon significant faults)
 *  - R 76-2 forms 12.1-12.7 ("Significant fault (> e) or detection and reaction")
 */
import { describe, expect, it } from "vitest";
import { k5Form, k5SignificantFault } from "../../src/kernels/k5.js";

describe("k5SignificantFault — R 76-1 §T.5.5.6", () => {
  it("is not a fault at all when magnitude <= e", () => {
    const result = k5SignificantFault({ faultMagnitude: 0.5, e: 1 });
    expect(result.isFault).toBe(false);
    expect(result.significant).toBe(false);
    expect(result.verdict).toBe("PASSED");
  });

  it("a fault of exactly e is not significant (§5.1.1 Note: 'equal to or smaller than e')", () => {
    const result = k5SignificantFault({ faultMagnitude: 1, e: 1 });
    expect(result.isFault).toBe(false); // strict ">" per T.5.5.6
    expect(result.verdict).toBe("PASSED");
  });

  it("a fault greater than e, undetected, is significant and FAILS", () => {
    const result = k5SignificantFault({ faultMagnitude: 1.5, e: 1 });
    expect(result.isFault).toBe(true);
    expect(result.significant).toBe(true);
    expect(result.excusedByDetection).toBe(false);
    expect(result.verdict).toBe("FAILED");
  });

  it("a significant fault that is detected and reacted to is excused (§5.1.1 b / §5.2)", () => {
    const result = k5SignificantFault({ faultMagnitude: 1.5, e: 1, detectedAndReacted: true });
    expect(result.significant).toBe(true);
    expect(result.excusedByDetection).toBe(true);
    expect(result.verdict).toBe("PASSED");
  });

  it("detection flag is irrelevant when the fault is not significant", () => {
    const result = k5SignificantFault({ faultMagnitude: 0.5, e: 1, detectedAndReacted: false });
    expect(result.verdict).toBe("PASSED");
  });

  it.each([
    ["simultaneous_independent_causes"],
    ["impossible_to_measure"],
    ["obviously_wrong"],
    ["transitory"],
  ] as const)("excludes '%s' from being significant even though it exceeds e", (reason) => {
    const result = k5SignificantFault({ faultMagnitude: 100, e: 1, exclusionReason: reason });
    expect(result.isFault).toBe(true);
    expect(result.excluded).toBe(true);
    expect(result.significant).toBe(false);
    expect(result.verdict).toBe("PASSED");
  });

  it("for a multi-interval instrument, e is the partial range's own e (caller passes it in)", () => {
    const smallRangeFault = k5SignificantFault({ faultMagnitude: 2, e: 1 }); // e1 -> significant
    const bigRangeFault = k5SignificantFault({ faultMagnitude: 2, e: 5 }); // e3 -> not significant
    expect(smallRangeFault.significant).toBe(true);
    expect(bigRangeFault.significant).toBe(false);
  });
});

describe("k5Form — R 76-2 forms 12.1-12.7 roll-up", () => {
  it("passes when no trial is significant", () => {
    const { rows, verdict } = k5Form([
      { faultMagnitude: 0, e: 1 },
      { faultMagnitude: 0.9, e: 1 },
    ]);
    expect(rows).toHaveLength(2);
    expect(verdict).toBe("PASSED");
  });

  it("passes when every significant fault was detected and reacted to", () => {
    const { verdict } = k5Form([
      { faultMagnitude: 2, e: 1, detectedAndReacted: true },
      { faultMagnitude: 3, e: 1, detectedAndReacted: true },
    ]);
    expect(verdict).toBe("PASSED");
  });

  it("fails the whole form if a single trial has an undetected significant fault", () => {
    const { verdict } = k5Form([
      { faultMagnitude: 0.5, e: 1 },
      { faultMagnitude: 2, e: 1, detectedAndReacted: true },
      { faultMagnitude: 3, e: 1 }, // no detection -> significant and unexcused
    ]);
    expect(verdict).toBe("FAILED");
  });
});
