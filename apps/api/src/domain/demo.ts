/**
 * Demonstration data.
 *
 * A prototype whose dashboard reads zero teaches a visitor nothing, and one whose reports all
 * sit in DRAFT teaches them only half — the approval chain is the point of the product, and a
 * repository where nothing has ever been reviewed, failed, returned or signed cannot show it.
 * So this seeds eight reports spread across the lifecycle, including the ones that went wrong.
 *
 * Three rules it holds to:
 *
 *  - **It goes through the real service functions.** Every report here is created, profiled,
 *    computed, transitioned and signed by the same code an officer's clicks would reach, and by
 *    a principal holding the role that is actually allowed to take each step: the MA records,
 *    the AD recommends, the Director locks. Nothing in the demonstration set could exist by a
 *    path the application does not support. Writing rows straight into the tables would be
 *    faster and would prove nothing.
 *  - **Every form is recorded in its own shape.** Creep gets times of reading, discrimination
 *    gets two indications either side of an extra load, the disturbance forms get an amplitude
 *    and a fault mark. The seeder used to post weighing rows into whichever forms would accept
 *    them and skip the rest; now the whole report is filled, because the runner can compute it.
 *  - **It is visibly demonstration data.** Manufacturers are named "(demonstration)" and the
 *    report ids carry a DEMO marker. A visitor must never have to wonder whether they are
 *    looking at a real laboratory's records.
 */

import type { InstrumentProfile } from "@tulasetu/engine";

import type { ServiceContext } from "./service.js";
import * as svc from "./service.js";
import type { Principal } from "./rbac.js";
import type { RoleId } from "./lifecycle.js";

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** R 76-1 §3.3's worked example: Max 2/5/15 kg, e = 1/2/10 g, class III. */
const MULTI_INTERVAL: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "multi-interval",
  electronic: true,
  hasTareDevice: true,
  // A shop scale that prints a ticket, so form 7 (stability of equilibrium, K6) applies —
  // printing must be impossible before equilibrium is reached.
  hasPrintOrStorage: true,
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
  // Certificate #100 on the live national register actually carries this: a file size where a
  // checksum belongs. Left in deliberately — the Annex G audit is meant to catch it.
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

/** A class I analytical balance — no tilting, no damp heat, no span stability, no endurance. */
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

/**
 * A mechanical beam scale. Non-self-indicating and not electronic, so it is the one instrument
 * in the set that attracts the sensitivity test (form 4.2, judged in millimetres) and the
 * non-self-indicating discrimination form 4.1.3 — and none of the electronic forms at all.
 */
const BEAM_SCALE: InstrumentProfile = {
  unit: "kg",
  accuracyClass: "IIII",
  indicatingType: "non-self",
  rangeKind: "single",
  electronic: false,
  manufacturer: "Godavari Scale Works (demonstration)",
  model: "GSW-200 BEAM",
  serialNumber: "GSW-2026-0442",
  ranges: [{ e: 0.2, d: 0.2, max: 200, min: 2, n: 1000 }],
};

/** A price-computing counter scale for a second class III report. */
const COUNTER_SCALE: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "single",
  electronic: true,
  directSalesToPublic: true,
  priceComputing: true,
  hasTareDevice: true,
  hasPrintOrStorage: true,
  softwareControlled: true,
  manufacturer: "Sutlej Instruments (demonstration)",
  model: "SI-30 CS",
  serialNumber: "SI30-2026-0203",
  softwareVersion: "2.2.7",
  softwareChecksum: "a91f4c02de77b13c8850",
  ranges: [{ e: 5, d: 5, max: 30000, min: 100, n: 6000 }],
};

// ---------------------------------------------------------------------------
// Observation rows, shaped the way each form is printed
// ---------------------------------------------------------------------------

export interface FormPayload {
  rows: Record<string, unknown>[];
  extras?: Record<string, unknown>;
}

/** What the row sets need to know about the instrument they are being recorded against. */
export interface InstrumentShape {
  /** The instrument's ranges, in its own unit. Needed because e and d change with the load. */
  ranges: { e: number; d: number; max: number; min: number }[];
  /**
   * A fixed offset added to the error of every reading, in multiples of e, so a report can be
   * seeded as failing without a second copy of every row set. The widest band in Table 6 is
   * ±1.5 e, so a bias of 3 e fails at every load rather than only where the band is tight.
   */
  biasInE?: number;
}

/** Round to a whole number of scale intervals — a laboratory applies weights, not decimals. */
function toIntervals(value: number, e: number): number {
  return Math.round(value / e) * e;
}

/** The partial range a load falls in. On a single-range instrument there is only one. */
function rangeAt(shape: InstrumentShape, load: number) {
  return shape.ranges.find((r) => load <= r.max) ?? shape.ranges[shape.ranges.length - 1]!;
}

/**
 * Errors a real instrument would show: small, varied, and comfortably inside the band.
 *
 * Expressed in multiples of e and cycled by row, because a demonstration set where every
 * reading is exactly zero error looks synthetic, and one where every reading sits exactly on
 * the ±0.5 e limit — which is what a bare `indication = load` produces once the ½ e
 * rounding-elimination term is applied — looks like a instrument about to fail.
 */
const ERROR_PATTERN_IN_E = [0, 0.2, -0.1, 0.3, -0.2, 0.1];

/**
 * One weighing row, worked backwards from the error it should show.
 *
 * R 76-2 records what the officer reads off the bench: an indication and the additional load
 * ΔL needed to reach the next changeover point. The error follows from those
 * (E = I + ½ e − ΔL − L), so to seed a row with a chosen error the ΔL is what has to move —
 * which is also what actually varies at the bench, since the indication is quantised to d.
 */
function weighingRow(shape: InstrumentShape, load: number, rowIndex: number) {
  const { e, d } = rangeAt(shape, load);
  const errorInE = ERROR_PATTERN_IN_E[rowIndex % ERROR_PATTERN_IN_E.length] ?? 0;

  // A small error is seeded through ΔL, because that is what varies at the bench: the
  // indication is quantised to d, and how much extra load it takes to push it to the next
  // changeover point is the fine measurement. ΔL runs from 0 to d and never leaves it.
  const additionalLoad = Math.round((e / 2 - errorInE * e) * 1e6) / 1e6;

  // A *failing* instrument is one that reads wrong, so the bias moves the indication rather
  // than ΔL. Pushing ΔL negative instead would seed an observation no bench could produce —
  // there is no such thing as a negative additional load — and the validator rightly refuses it.
  const bias = (shape.biasInE ?? 0) * e;
  const indication = load === 0 ? 0 : load + Math.round(bias / d) * d;

  return { load, indication, additionalLoad };
}

export function observationsFor(
  formId: string,
  kernel: string,
  instrument: InstrumentShape,
): FormPayload {
  const max = Math.max(...instrument.ranges.map((r) => r.max));
  const e = Math.min(...instrument.ranges.map((r) => r.e));
  const bias = (instrument.biasInE ?? 0) * e;

  /**
   * A load walk from zero to near Max.
   *
   * On a multi-interval instrument the changeover points are the loads worth weighing at: the
   * permissible error widens there with nothing changing on the display, which is the case a
   * spreadsheet gets wrong and the one a report should show.
   */
  const changeovers = instrument.ranges.slice(0, -1).map((r) => r.max);
  const loads = [
    ...new Set(
      [0, ...changeovers, ...[0.05, 0.25, 0.5, 0.9].map((f) => toIntervals(f * max, e))]
        .filter((l) => l <= max)
        .sort((a, b) => a - b),
    ),
  ];
  const walk = loads.map((load, i) => ({
    ...weighingRow(instrument, load, i),
    ...(i === 0
      ? { label: "zero" }
      : changeovers.includes(load)
        ? { label: `changeover e${changeovers.indexOf(load) + 1} → e${changeovers.indexOf(load) + 2}` }
        : i === loads.length - 1
          ? { label: "near Max" }
          : {}),
  }));

  /** The load most single-point tests are run at: half of Max. */
  const testLoad = toIntervals(0.5 * max, e);
  /** The load the span-stability and endurance tests use: near Max. */
  const nearMax = toIntervals(0.9 * max, e);

  switch (formId) {
    // --- K4: the time and temperature family ------------------------------
    case "2":
      return {
        rows: [
          { reportPage: 1, date: "2026-08-14", time: "09:00", temperature: 20, zeroIndication: 0, additionalLoad: 0 },
          { reportPage: 1, date: "2026-08-14", time: "11:00", temperature: 25, zeroIndication: 0.1 * e, additionalLoad: 0 },
          { reportPage: 1, date: "2026-08-14", time: "13:00", temperature: 30, zeroIndication: 0.2 * e, additionalLoad: 0 },
        ],
      };
    case "6.1":
      return {
        rows: [
          { timeOfReading: "0 min", load0: 0, indicationOfZero: 0, additionalLoad: 0 },
          { timeOfReading: "30 min", load0: 0, indicationOfZero: 0, additionalLoad: 0 },
        ],
        extras: { testLoad },
      };
    case "6.2":
      // Creep is judged on ΔP against 0.5 e, never on the mpe — so a bias that fails form 1
      // need not fail this one, and it is applied at the 30-minute reading where creep is read.
      return {
        rows: [
          { timeOfReading: "0 min", load: testLoad, indication: testLoad, additionalLoad: 0 },
          { timeOfReading: "5 min", load: testLoad, indication: testLoad, additionalLoad: 0 },
          { timeOfReading: "15 min", load: testLoad, indication: testLoad, additionalLoad: 0 },
          { timeOfReading: "30 min", load: testLoad, indication: testLoad + bias, additionalLoad: 0 },
        ],
      };
    case "14":
      return {
        rows: [1, 2, 3, 4].map((n) => ({
          no: n,
          indicationOfZero: 0, additionalLoad0: 0,
          indicationOfLoad: nearMax + (n === 4 ? bias : 0), additionalLoad: 0,
        })),
        extras: { testLoad: nearMax },
      };

    // --- K2: discrimination, one form per mode of indication --------------
    case "4.1.1": {
      // §3.8.2.2 is set on d, and on a multi-interval instrument d changes with the load — so
      // both the extra load and the movement it must produce come from the range the load
      // falls in, not from d₁.
      return {
        rows: [testLoad, nearMax].map((load) => {
          const { d } = rangeAt(instrument, load);
          return {
            load, indication1: load, removedLoad: 0, add1_10d: 10 * d,
            extraLoad: 1.4 * d, indication2: load + d,
          };
        }),
      };
    }
    case "4.1.2": {
      const { e: eAt } = rangeAt(instrument, testLoad);
      return {
        rows: [{ load: testLoad, indication1: testLoad, extraLoad: eAt, indication2: testLoad + eAt }],
      };
    }
    case "4.1.3":
      return {
        rows: [toIntervals(0.05 * max, e), testLoad].map((load) => ({
          load, indication: load, extraLoad: 0.4 * e, visibleDisplacement: true,
        })),
      };

    // --- K3: sensitivity, judged in millimetres, never against the mpe ----
    case "4.2":
      return {
        rows: [toIntervals(0.05 * max, e), testLoad, nearMax].map((load) => ({
          load, extraLoad: e, permanentDisplacement: 6,
        })),
      };

    // --- K6: stability of equilibrium, three sub-tables --------------------
    case "7":
      return {
        rows: [
          ...[1, 2, 3, 4, 5].map((n) => ({
            subform: "printingStorage", no: n, load: testLoad,
            firstPrintedOrStoredValue: testLoad, readingMin: testLoad, readingMax: testLoad,
            distinctValuesIndicated: 1,
          })),
          // E0 = I0 + ½ e − ΔL − L0, so a reading with no error carries ΔL = ½ e. Leaving ΔL
          // at zero would seed every trial with an error of exactly ½ e, which is twice the
          // 0.25 e limit this sub-table is judged on.
          //
          // The e is the one in force where each sub-table's readings are taken, which on a
          // multi-interval instrument is not the same for all three: zero-setting sits at no
          // load, tare balancing at about a third of Max.
          ...[1, 2, 3, 4, 5].map((n) => ({
            subform: "zeroSetting", no: n, zeroLoad: 0, load0: 10 * e,
            indicationAfterZeroSetting: 10 * e, additionalLoad: e / 2,
          })),
          ...[1, 2, 3, 4, 5].map((n) => {
            const tareLoad = toIntervals(0.3 * max, e);
            const eTare = rangeAt(instrument, tareLoad).e;
            return {
              subform: "tareBalancing", no: n, tareLoad, load0: 10 * eTare,
              indicationAfterTareBalancing: 10 * eTare, additionalLoad: eTare / 2,
            };
          }),
        ],
      };

    // --- Examinations ------------------------------------------------------
    case "16":
      return {
        rows: [],
        extras: {
          verdict: "PASSED",
          remarks:
            "Single-piece die-cast housing with a sealed load-cell compartment. Adjustment " +
            "access is behind a wire-and-lead seal; the legally relevant software is identified " +
            "on the display at power-up. Photographs at Figures 1 and 2.",
        },
      };

    default:
      break;
  }

  // --- K5: every disturbance form ----------------------------------------
  // A baseline reading, then disturbed ones. A fault larger than e counts against the
  // instrument unless it was detected and acted upon.
  if (kernel === "K5") {
    return {
      rows: [
        { load: testLoad, indication: testLoad, label: "without disturbance" },
        { load: testLoad, amplitude: 40, durationCycles: 10, numberOfDisturbances: 10,
          repetitionInterval: 10, indication: testLoad + bias, significantFaultNo: bias === 0 },
        { load: testLoad, amplitude: 70, durationCycles: 25, numberOfDisturbances: 10,
          repetitionInterval: 10, indication: testLoad, significantFaultNo: true },
      ],
    };
  }

  // --- K1: everything else ------------------------------------------------
  // Forms 8 and 10 record a load *condition* against a test load fixed in the header, exactly
  // as the printed form does, rather than repeating the load on every row.
  if (formId === "10") {
    return {
      rows: ["0", "5 min", "15 min", "30 min"].flatMap((t, i) => [
        { time: t, loadCondition: "Unloaded", ...weighingRow(instrument, 0, i), load: undefined },
        { time: t, loadCondition: "Loaded", ...weighingRow(instrument, testLoad, i), load: undefined },
      ]),
      extras: { testLoad },
    };
  }
  if (formId === "8") {
    return {
      rows: [
        { loadCondition: "Unloaded", position: "reference", ...weighingRow(instrument, 0, 0), load: undefined },
        { loadCondition: "Loaded", position: "tilted +", ...weighingRow(instrument, testLoad, 1), load: undefined },
        { loadCondition: "Loaded", position: "tilted −", ...weighingRow(instrument, testLoad, 2), load: undefined },
      ],
      extras: { testLoad },
    };
  }
  if (formId === "3.1" || formId === "3.2") {
    // The four corners of the load receptor and its centre, at a third of Max — A.4.7's
    // eccentric load where the receptor takes four support points.
    const eccentric = toIntervals(max / 3, e);
    return {
      rows: [0, 1, 2, 3, 4].map((n) => ({
        location: n + 1,
        ...weighingRow(instrument, eccentric, n),
      })),
    };
  }
  if (formId === "5") {
    // Repeatability: the same load weighed several times, not a walk up the range.
    return {
      rows: [0, 1, 2, 3, 4].map((n) => ({
        weighingNo: n + 1,
        ...weighingRow(instrument, testLoad, n),
      })),
    };
  }
  if (formId === "11") {
    return {
      rows: walk.flatMap((r) => [
        { ...r, voltage: "U min" },
        { ...r, voltage: "U max" },
      ]),
    };
  }
  return { rows: walk };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export interface DemoResult {
  created: string[];
  skipped: string[];
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
  const skipped: string[] = [];
  const notes: string[] = [];

  const exists = (id: string) => Boolean(ctx.db.prepare("SELECT 1 FROM reports WHERE id = ?").get(id));

  /**
   * A principal for one of the other roles in the approval chain.
   *
   * The whole point of the lifecycle is that no one officer can carry a report from bench to
   * certificate — an MA cannot recommend their own work, and only the Director locks. Seeding a
   * report to RECOMMENDED as the MA would therefore be seeding a state the application would
   * never let anyone reach.
   */
  const as = (role: RoleId): Principal | null => {
    const row = ctx.db
      .prepare("SELECT id, lab_id FROM users WHERE role_id = ? AND lab_id = ? AND active = 1 LIMIT 1")
      .get(role, principal.labId) as { id: string; lab_id: string } | undefined;
    return row ? { userId: row.id, labId: row.lab_id, role } : null;
  };

  const ad = as("AD");
  const director = as("DIRECTOR");
  if (!ad || !director) {
    notes.push(
      "Only the recording officer's account exists in this laboratory, so the reports stop " +
        "where that role's authority stops — nothing was seeded into a state the application " +
        "would not let one person reach.",
    );
  }

  // -----------------------------------------------------------------------
  // 1. The worked example, taken the whole way: recorded, reviewed, signed,
  //    locked and published.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0001")) {
    build(ctx, principal, "TS-DEMO-0001", "MA/2026/DEMO/0001", "IN_Sch7A", MULTI_INTERVAL);
    await walk(ctx, { ma: principal, ad, director }, "TS-DEMO-0001", "PUBLISHED", notes);
    created.push("TS-DEMO-0001");
  }

  // -----------------------------------------------------------------------
  // 2. The same family with a reading outside the band — recorded honestly,
  //    submitted, and returned by the AD with a deficiency against it.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0002")) {
    build(
      ctx, principal, "TS-DEMO-0002", "MA/2026/DEMO/0002", "OIML_R76",
      { ...MULTI_INTERVAL, model: "MW-15 MI rev B", serialNumber: "MW15-2026-0115" },
      // 3 e of bias. The widest band in Table 6 is ±1.5 e, so this fails at every load
      // rather than only where the band happens to be tight — a report that is wrong, not
      // one that is marginal.
      3,
    );
    await walk(ctx, { ma: principal, ad, director }, "TS-DEMO-0002", "SUBMITTED", notes);
    // Only if the report actually reached review. A deficiency is what a reviewing officer
    // records against a report in front of them, so raising one on a report still on the bench
    // would seed a history that could not have happened.
    const submitted = svc.getReport(ctx, principal, "TS-DEMO-0002").status === "SUBMITTED";
    if (ad && submitted) {
      svc.raiseDeficiency(ctx, ad, "TS-DEMO-0002", {
        id: "DEF-0002-1",
        formId: "1",
        severity: "major",
        text:
          "The instrument over-reads by about three scale intervals across the whole range: " +
          "at 750 g the corrected error is +3.2 g against a permissible ±1 g, and the same " +
          "offset carries through eccentricity, repeatability, tare, warm-up, voltage " +
          "variation, damp heat and endurance — twelve forms in all. This reads as a span " +
          "adjustment rather than twelve separate defects. Re-span the instrument against the " +
          "reference standard and repeat the affected forms before resubmission.",
      });
      // No explicit transition: DEFICIENCY_RAISED *is* the SUBMITTED → DEFICIENCY event, and
      // the projection is rebuilt from the log, so the report is already in DEFICIENCY here.
    }
    created.push("TS-DEMO-0002");
  }

  // -----------------------------------------------------------------------
  // 3. The class II* retail scale carrying the register's own defective
  //    checksum. It cannot validate, and that is the audit working.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0003")) {
    build(ctx, principal, "TS-DEMO-0003", "MA/2026/DEMO/0003", "IN_Sch7A", CLASS_II_STAR);
    // Deliberately left in DRAFT: an error-severity Annex G finding stands against the
    // software-identification field, so `no_blocking_validation_issues` is not satisfied.
    created.push("TS-DEMO-0003");
  }

  // -----------------------------------------------------------------------
  // 4. A 500 kg platform, halfway through the bench work.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0004")) {
    svc.createReport(ctx, principal, {
      reportId: "TS-DEMO-0004", applicationNo: "MA/2026/DEMO/0004",
      profile: "IN_Sch7A", feePaidInr: 25000,
    });
    svc.setInstrumentProfile(ctx, principal, "TS-DEMO-0004", WEIGHBRIDGE);
    // Only the first few forms — a report genuinely in progress, which is what most of a
    // laboratory's repository looks like on any given day.
    recordForms(ctx, principal, "TS-DEMO-0004", WEIGHBRIDGE, 0, 6);
    created.push("TS-DEMO-0004");
  }

  // -----------------------------------------------------------------------
  // 5. A class I balance, recorded and submitted, waiting on the AD.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0005")) {
    build(ctx, principal, "TS-DEMO-0005", "MA/2026/DEMO/0005", "OIML_R76", ANALYTICAL, 0, 10000);
    await walk(ctx, { ma: principal, ad, director }, "TS-DEMO-0005", "SUBMITTED", notes);
    created.push("TS-DEMO-0005");
  }

  // -----------------------------------------------------------------------
  // 6. The mechanical beam scale — the only report in the set that carries
  //    the sensitivity test and the non-self-indicating discrimination form.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0006")) {
    build(ctx, principal, "TS-DEMO-0006", "MA/2026/DEMO/0006", "IN_Sch7A", BEAM_SCALE, 0, 10000);
    await walk(ctx, { ma: principal, ad, director }, "TS-DEMO-0006", "RECOMMENDED", notes);
    created.push("TS-DEMO-0006");
  }

  // -----------------------------------------------------------------------
  // 7. Remitted by the Director for further tests — Rule 8's other direction,
  //    which a one-way pipeline would misstate.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0007")) {
    build(ctx, principal, "TS-DEMO-0007", "MA/2026/DEMO/0007", "IN_Sch7A", COUNTER_SCALE);
    await walk(ctx, { ma: principal, ad, director }, "TS-DEMO-0007", "RECOMMENDED", notes);
    // Only from RECOMMENDED — Rule 8 lets the Director remit a report that has reached them,
    // and a laboratory with no AD account never gets one that far.
    if (director && svc.getReport(ctx, principal, "TS-DEMO-0007").status === "RECOMMENDED") {
      svc.transitionReport(ctx, director, "TS-DEMO-0007", {
        to: "REMITTED",
        note:
          "Damp-heat results are reported at a single temperature. Repeat form 13b at the " +
          "upper limit of the declared temperature range and resubmit.",
      });
    }
    created.push("TS-DEMO-0007");
  }

  // -----------------------------------------------------------------------
  // 8. Recommended and signed, sitting with the Director for decision.
  // -----------------------------------------------------------------------
  if (!exists("TS-DEMO-0008")) {
    build(
      ctx, principal, "TS-DEMO-0008", "MA/2026/DEMO/0008", "OIML_R76",
      { ...COUNTER_SCALE, model: "SI-30 CS rev C", serialNumber: "SI30-2026-0209" },
    );
    await walk(ctx, { ma: principal, ad, director }, "TS-DEMO-0008", "RECOMMENDED", notes);
    created.push("TS-DEMO-0008");
  }

  for (const id of ["TS-DEMO-0001", "TS-DEMO-0002", "TS-DEMO-0003", "TS-DEMO-0004",
                    "TS-DEMO-0005", "TS-DEMO-0006", "TS-DEMO-0007", "TS-DEMO-0008"]) {
    if (!created.includes(id)) skipped.push(id);
  }

  return {
    created,
    skipped,
    note:
      (created.length === 0
        ? "The demonstration reports are already present."
        : `Created ${created.length} demonstration report${created.length === 1 ? "" : "s"}, ` +
          `every one through the same service calls and role checks an officer's clicks reach.`) +
      (notes.length > 0 ? ` ${notes.join(" ")}` : ""),
  };
}

/** Create a report, record its profile, and fill every applicable form. */
function build(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  applicationNo: string,
  profile: "IN_Sch7A" | "OIML_R76",
  instrument: InstrumentProfile,
  biasInE = 0,
  feePaidInr = 25000,
): void {
  svc.createReport(ctx, principal, { reportId, applicationNo, profile, feePaidInr });
  svc.setInstrumentProfile(ctx, principal, reportId, instrument);
  recordForms(ctx, principal, reportId, instrument, biasInE);
}

/**
 * Record observations against every applicable form.
 *
 * `limit` stops early, which is how a report in progress is seeded — the remaining forms print
 * "– –" with the reason "applicable, but no observations recorded", which is the honest state
 * rather than a blank.
 */
function recordForms(
  ctx: ServiceContext,
  principal: Principal,
  reportId: string,
  instrument: InstrumentProfile,
  biasInE = 0,
  limit?: number,
): void {
  const rows = ctx.db
    .prepare("SELECT form_id, test_id FROM report_forms WHERE report_id = ? AND applicable = 1")
    .all(reportId) as { form_id: string; test_id: string }[];

  // The projection has no ordering column, so the rule pack's own order is used — which is
  // also the order R 76-2 prints the forms in, and the order that keeps endurance last.
  const order = new Map(ctx.pack.tests.map((t, i) => [t.form, i]));
  const forms = [...rows].sort(
    (a, b) => (order.get(a.form_id) ?? 999) - (order.get(b.form_id) ?? 999),
  );

  const kernelOf = new Map(ctx.pack.tests.map((t) => [t.form, t.kernel]));

  // Loads come from the instrument, not from a constant: a 6 kg counter scale cannot be
  // weighed at 15 kg, and the mpe resolver refuses a load past Max. The ranges travel whole
  // because e and d change with the load on a multi-interval instrument, and the discrimination
  // and creep thresholds are set on whichever is in force where the reading was taken.
  const shape: InstrumentShape = { ranges: instrument.ranges, biasInE };

  for (const f of forms.slice(0, limit ?? forms.length)) {
    const payload = observationsFor(f.form_id, kernelOf.get(f.form_id) ?? "K1", shape);
    svc.recordWeighingObservations(ctx, principal, reportId, {
      formId: f.form_id,
      testId: f.test_id,
      rows: payload.rows as never,
      ...(payload.extras ? { extras: payload.extras as never } : {}),
      environment: [
        { checkpoint: "At start", temperatureC: 21.4, relativeHumidityPct: 52, pressureHPa: 1009 },
        { checkpoint: "At max", temperatureC: 21.9, relativeHumidityPct: 53, pressureHPa: 1009 },
        { checkpoint: "At end", temperatureC: 21.5, relativeHumidityPct: 52, pressureHPa: 1008 },
      ],
    });
  }
}

/**
 * Walk a report as far along the approval chain as `target`, each step taken by the role that
 * is actually entitled to take it, signing at the points an officer would.
 *
 * Stops quietly and records why if a step is not available — a report whose forms failed can
 * still be validated and submitted (a failure is a result, not a missing one), but one carrying
 * a blocking software-identification finding cannot, and the seeder must not pretend otherwise.
 */
async function walk(
  ctx: ServiceContext,
  people: { ma: Principal; ad: Principal | null; director: Principal | null },
  reportId: string,
  target: string,
  notes: string[],
): Promise<void> {
  const chain: { to: string; by: Principal | null; sign?: boolean }[] = [
    { to: "OBSERVATIONS_COMPLETE", by: people.ma },
    { to: "VALIDATED", by: people.ma },
    { to: "SUBMITTED", by: people.ma, sign: true },
    { to: "RECOMMENDED", by: people.ad, sign: true },
    { to: "LOCKED", by: people.director, sign: true },
    { to: "CERTIFICATE_ISSUED", by: people.director },
    { to: "PUBLISHED", by: people.director },
  ];

  for (const step of chain) {
    if (!step.by) return;
    try {
      if (step.to === "LOCKED") {
        // Locking renders the record copy first, which needs Chromium. Where that is not
        // available — a serverless deployment, a machine without `playwright install` — the
        // report stops at RECOMMENDED rather than being locked against a hash of nothing.
        await svc.renderAndLock(ctx, step.by, reportId);
      } else {
        svc.transitionReport(ctx, step.by, reportId, { to: step.to as never });
      }
      if (step.sign) sign(ctx, step.by, reportId);
    } catch (err) {
      notes.push(
        `${reportId} stopped at the step before ${step.to}: ${(err as Error).message ?? "unavailable"}`,
      );
      return;
    }
    if (step.to === target) return;
  }
}

/**
 * Register a signing key for the officer if they have none, then sign the report's head.
 *
 * The private key is generated, used once and dropped. That is a demonstration convenience and
 * never a security property: a real deployment signs on the officer's own device or with a DSC,
 * and the verification path does not care which produced the signature.
 */
function sign(ctx: ServiceContext, principal: Principal, reportId: string): void {
  const existing = ctx.db
    .prepare("SELECT public_key FROM users WHERE id = ?")
    .get(principal.userId) as { public_key: string | null } | undefined;

  let privateKeyPem: string | undefined;
  if (!existing?.public_key) {
    privateKeyPem = svc.registerSigningKey(ctx, principal).privateKeyPem;
  } else {
    // A key is already registered but its private half was never retained, so a fresh pair is
    // registered for this signature. Signatures made under the old key stay verifiable —
    // each is checked against the key that made it, not against the officer's current one.
    privateKeyPem = svc.registerSigningKey(ctx, principal).privateKeyPem;
  }
  if (!privateKeyPem) return;
  svc.signReport(ctx, principal, reportId, { privateKeyPem });
}
