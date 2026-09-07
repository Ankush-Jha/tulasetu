/**
 * Demonstration data.
 *
 * A prototype whose dashboard reads zero teaches a visitor nothing. This seeds a handful of
 * reports at different points of the approval chain so the repository, the statistics and the
 * lifecycle all have something to show within a few seconds of arriving.
 *
 * Two rules it holds to:
 *
 *  - **It goes through the real service functions.** Every report here is created, profiled and
 *    computed by the same code an officer's clicks would reach, so nothing in the demonstration
 *    set could exist by a path the application does not actually support. Writing rows straight
 *    into the tables would be faster and would prove nothing.
 *  - **It is visibly demonstration data.** Manufacturers are named "(demonstration)" and the
 *    report ids carry a DEMO marker. A visitor must never have to wonder whether they are
 *    looking at a real laboratory's records.
 */

import type { InstrumentProfile } from "@tulasetu/engine";

import type { ServiceContext } from "./service.js";
import * as svc from "./service.js";
import type { Principal } from "./rbac.js";

/** Loads that straddle every band boundary of the class III worked example. */
const BAND_WALK = [
  { load: 0, indication: 0, label: "zero" },
  { load: 500, indication: 500 },
  { load: 1000, indication: 1000 },
  { load: 2000, indication: 2000, label: "changeover e1 → e2" },
  { load: 4000, indication: 4000 },
  { load: 4500, indication: 4500 },
  { load: 5000, indication: 5000, label: "changeover e2 → e3" },
  { load: 15000, indication: 15000, label: "Max" },
];

/** R 76-1 §3.3's worked example: Max 2/5/15 kg, e = 1/2/10 g, class III. */
const MULTI_INTERVAL: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  hasTareDevice: true,
  softwareControlled: true,
  powerSupply: ["mains"],
  manufacturer: "Meridian Weighing Systems (demonstration)",
  model: "MW-15 MI",
  serialNumber: "MW15-2026-0114",
  softwareVersion: "3.1.0",
  softwareChecksum: "34559a18232bc0c6c417",
  ranges: [
    { e: 1, d: 1, max: 2000, min: 20, n: 2000 },
    { e: 2, d: 2, max: 5000, min: 2000, n: 2500 },
    { e: 10, d: 10, max: 15000, min: 5000, n: 1500 },
  ],
};

/** A class II retail counter scale — direct sales to the public, so India's class II*. */
const CLASS_II_STAR: InstrumentProfile = {
  unit: "g",
  accuracyClass: "II",
  indicatingType: "self",
  rangeKind: "single",
  electronic: true,
  directSalesToPublic: true,
  priceComputing: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  softwareControlled: true,
  manufacturer: "Kaveri Retail Instruments (demonstration)",
  model: "KR-6 PC",
  serialNumber: "KR6-2026-0087",
  softwareVersion: "1.8.2",
  // The defect certificate #100 actually carries: a file size where a checksum belongs.
  softwareChecksum: "8100kb",
  ranges: [{ e: 0.2, d: 0.2, max: 6000, min: 10, n: 30000 }],
};

/** A class IIII platform above 100 kg — endurance does not apply, and it can be tilted. */
const WEIGHBRIDGE: InstrumentProfile = {
  unit: "kg",
  accuracyClass: "IIII",
  indicatingType: "self",
  rangeKind: "single",
  electronic: true,
  tiltable: true,
  modular: true,
  vehiclePowered: true,
  manufacturer: "Deccan Platform Scales (demonstration)",
  model: "DPS-500",
  serialNumber: "DPS-2026-0031",
  ranges: [{ e: 0.5, d: 0.5, max: 500, min: 5, n: 1000 }],
};

/** A class I analytical balance — no tilting, no damp heat, no endurance. */
const ANALYTICAL: InstrumentProfile = {
  unit: "g",
  accuracyClass: "I",
  indicatingType: "self",
  rangeKind: "single",
  electronic: true,
  softwareControlled: true,
  manufacturer: "Nilgiri Precision (demonstration)",
  model: "NP-220A",
  serialNumber: "NP220-2026-0009",
  softwareVersion: "5.0.4",
  softwareChecksum: "d41d8cd98f00b204e980",
  ranges: [{ e: 0.001, d: 0.001, max: 220, min: 0.1, n: 220000 }],
};

export interface DemoResult {
  created: string[];
  note: string;
}

/**
 * Seed the demonstration set, if it is not already there.
 *
 * Idempotent: reports carry fixed ids, so a second call adds nothing rather than filling the
 * repository with duplicates.
 */
export async function seedDemonstrationData(
  ctx: ServiceContext,
  principal: Principal,
): Promise<DemoResult> {
  const created: string[] = [];

  const exists = (id: string) => Boolean(ctx.db.prepare("SELECT 1 FROM reports WHERE id = ?").get(id));

  // 1. The worked example, walked all the way to a locked, published report.
  if (!exists("TS-DEMO-0001")) {
    svc.createReport(ctx, principal, {
      reportId: "TS-DEMO-0001",
      applicationNo: "MA/2026/DEMO/0001",
      profile: "IN_Sch7A",
      feePaidInr: 25000,
    });
    svc.setInstrumentProfile(ctx, principal, "TS-DEMO-0001", MULTI_INTERVAL);
    recordAllForms(ctx, principal, "TS-DEMO-0001", BAND_WALK);
    created.push("TS-DEMO-0001");
  }

  // 2. The same instrument family, but with a reading outside the band at 4.5 kg — so the
  //    repository shows a failure as well as a pass, and the envelope chart has a breach.
  if (!exists("TS-DEMO-0002")) {
    svc.createReport(ctx, principal, {
      reportId: "TS-DEMO-0002",
      applicationNo: "MA/2026/DEMO/0002",
      profile: "OIML_R76",
      feePaidInr: 25000,
    });
    svc.setInstrumentProfile(ctx, principal, "TS-DEMO-0002", {
      ...MULTI_INTERVAL,
      model: "MW-15 MI rev B",
      serialNumber: "MW15-2026-0115",
      softwareChecksum: "0b6a",
    });
    recordAllForms(
      ctx, principal, "TS-DEMO-0002",
      // +12.5 g against a ±3 g limit at 4 500 g: outside by a factor of four.
      BAND_WALK.map((o) => (o.load === 4500 ? { ...o, indication: 4512 } : o)),
    );
    created.push("TS-DEMO-0002");
  }

  // 3. The class II* retail scale, carrying the register's own defective checksum. Left in
  //    draft: an error-severity software-identification finding stops it validating, which is
  //    the checksum audit doing its job rather than a gap.
  if (!exists("TS-DEMO-0003")) {
    svc.createReport(ctx, principal, {
      reportId: "TS-DEMO-0003",
      applicationNo: "MA/2026/DEMO/0003",
      profile: "IN_Sch7A",
      feePaidInr: 25000,
    });
    svc.setInstrumentProfile(ctx, principal, "TS-DEMO-0003", CLASS_II_STAR);
    created.push("TS-DEMO-0003");
  }

  // 4. A 500 kg platform: endurance is out on capacity, tilting is in, 12.7 applies.
  if (!exists("TS-DEMO-0004")) {
    svc.createReport(ctx, principal, {
      reportId: "TS-DEMO-0004",
      applicationNo: "MA/2026/DEMO/0004",
      profile: "IN_Sch7A",
      feePaidInr: 25000,
    });
    svc.setInstrumentProfile(ctx, principal, "TS-DEMO-0004", WEIGHBRIDGE);
    created.push("TS-DEMO-0004");
  }

  // 5. A class I balance: no tilting, no damp heat, no span stability, no endurance — the
  //    applicability resolver's exclusions are most visible here.
  if (!exists("TS-DEMO-0005")) {
    svc.createReport(ctx, principal, {
      reportId: "TS-DEMO-0005",
      applicationNo: "MA/2026/DEMO/0005",
      profile: "OIML_R76",
      feePaidInr: 10000,
    });
    svc.setInstrumentProfile(ctx, principal, "TS-DEMO-0005", ANALYTICAL);
    created.push("TS-DEMO-0005");
  }

  return {
    created,
    note:
      created.length === 0
        ? "The demonstration reports are already present."
        : `Created ${created.length} demonstration report${created.length === 1 ? "" : "s"}. ` +
          `Every one went through the same service calls an officer's clicks would.`,
  };
}

/** Record the same observation set against every applicable K1-shaped form. */
function recordAllForms(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  observations: { load: number; indication: number; label?: string }[],
): void {
  const forms = ctx.db
    .prepare("SELECT form_id, test_id FROM report_forms WHERE report_id = ? AND applicable = 1")
    .all(reportId) as { form_id: string; test_id: string }[];

  for (const f of forms) {
    svc.recordWeighingObservations(ctx, principal, reportId, {
      formId: f.form_id,
      testId: f.test_id,
      observations: observations.map((o) => ({
        load: o.load,
        indication: o.indication,
        additionalLoad: 0,
        ...(o.label ? { label: o.label } : {}),
      })),
      environment: [
        { checkpoint: "At start", temperatureC: 21.4, relativeHumidityPct: 52 },
        { checkpoint: "At max", temperatureC: 21.9, relativeHumidityPct: 53 },
        { checkpoint: "At end", temperatureC: 21.5, relativeHumidityPct: 52 },
      ],
    });
  }
}
