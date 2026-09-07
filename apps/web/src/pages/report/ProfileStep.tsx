/**
 * Instrument registration — four steps.
 *
 * This was one long form. It collected the accuracy class, three range rows and ten feature
 * checkboxes on a single screen, and said nothing about what any of it did. That is the wrong
 * shape for this task for three reasons.
 *
 * **The answers are not independent.** The class constrains which scale intervals are legal;
 * the range structure decides whether there is one set of forms or one per range; the features
 * decide which of seventeen forms apply at all. Presenting them as a flat list hides a
 * dependency chain that the officer has to hold in their head instead.
 *
 * **The consequences are invisible.** Ticking "software-controlled" adds a 54-item checklist.
 * Choosing class II over class III moves the permissible error by a factor of ten. A form that
 * takes those answers without showing what they do is asking someone to sign for something they
 * cannot see.
 *
 * **Nobody filling this in is the author of R 76.** They know the instrument in front of them.
 * So each choice carries what it is, what it means in ordinary terms, and what it changes — and
 * the panel beside the form shows the engine's actual answer as they type.
 *
 * The live panel is a real engine call (`POST /tools/profile-preview`) on the unsaved profile,
 * not a calculation in the browser. That matters: the bands shown while typing are the bands
 * the report will carry, because the same function produced both.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  Field,
  Icon,
  Input,
  Disclosure,
  Explain,
  Select,
  Spinner,
} from "../../components/ui";
import { MpeStaircase } from "../../components/charts/MpeStaircase";
import { cn } from "../../lib/cn";
import { api, type ApplicableTest, type Issue } from "../../lib/api";
import { useDebounced, useMutation } from "../../lib/useApi";
import { reportPath } from "../../lib/nav";
import { fmtNumber } from "../../lib/format";
import {
  ACCURACY_CLASSES,
  FEATURES,
  FEATURE_GROUPS,
  RANGE_KINDS,
  WIZARD_STEPS,
} from "../../content/registration";
import { useReport, type InstrumentProfileShape } from "./ReportLayout";

type RangeRow = { e: string; d: string; min: string; max: string };
const BLANK_RANGE: RangeRow = { e: "", d: "", min: "", max: "" };

/** R 76-1 §3.3's worked example — the instrument the engine's golden tests are built on. */
const SAMPLE = {
  manufacturer: "Example Instruments Pvt Ltd",
  model: "EX-15 MI",
  serialNumber: "EX15-2026-0042",
  softwareVersion: "2.4.1",
  softwareChecksum: "34559a18232bc0c6c417",
  ranges: [
    { e: "1", d: "1", min: "20", max: "2000" },
    { e: "2", d: "2", min: "2000", max: "5000" },
    { e: "10", d: "10", min: "5000", max: "15000" },
  ] as RangeRow[],
};

export function ProfileStep() {
  const { reportId, instrument, detail, reload } = useReport();
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);

  const [unit, setUnit] = useState<InstrumentProfileShape["unit"]>("g");
  const [accuracyClass, setAccuracyClass] = useState<InstrumentProfileShape["accuracyClass"]>("III");
  const [indicatingType, setIndicatingType] = useState<InstrumentProfileShape["indicatingType"]>("self");
  const [rangeKind, setRangeKind] = useState<InstrumentProfileShape["rangeKind"]>("single");
  const [ranges, setRanges] = useState<RangeRow[]>([{ ...BLANK_RANGE }]);

  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [softwareVersion, setSoftwareVersion] = useState("");
  const [softwareChecksum, setSoftwareChecksum] = useState("");

  const [flags, setFlags] = useState<Record<string, boolean>>({
    electronic: true,
    softwareControlled: false,
    hasTareDevice: false,
    hasPrintOrStorage: false,
    tiltable: false,
    rollingLoad: false,
    vehiclePowered: false,
    directSalesToPublic: false,
    priceComputing: false,
    modular: false,
  });

  const save = useMutation(api.setProfile);
  const [savedIssues, setSavedIssues] = useState<Issue[] | null>(null);

  // Load whatever is already recorded, so returning shows the report's state, not a blank form.
  useEffect(() => {
    if (!instrument) return;
    setUnit(instrument.unit);
    setAccuracyClass(instrument.accuracyClass);
    setIndicatingType(instrument.indicatingType);
    setRangeKind(instrument.rangeKind);
    setRanges(instrument.ranges.map((r) => ({
      e: String(r.e), d: String(r.d), min: String(r.min), max: String(r.max),
    })));
    setManufacturer(instrument.manufacturer ?? "");
    setModel(instrument.model ?? "");
    setSerialNumber(instrument.serialNumber ?? "");
    setSoftwareVersion(instrument.softwareVersion ?? "");
    setSoftwareChecksum(instrument.softwareChecksum ?? "");
    setFlags((f) => {
      const next = { ...f };
      for (const feat of FEATURES) {
        next[feat.key as string] = Boolean((instrument as unknown as Record<string, unknown>)[feat.key as string]);
      }
      next["electronic"] = instrument.electronic;
      return next;
    });
  }, [instrument]);

  /** The profile as it currently stands, ready for the engine. */
  const profile: InstrumentProfileShape = useMemo(
    () => ({
      unit,
      accuracyClass,
      indicatingType,
      rangeKind,
      ranges: ranges.map((r) => ({
        e: Number(r.e), d: Number(r.d), min: Number(r.min), max: Number(r.max),
      })),
      ...(flags as Partial<InstrumentProfileShape>),
      electronic: Boolean(flags["electronic"]),
      ...(manufacturer ? { manufacturer } : {}),
      ...(model ? { model } : {}),
      ...(serialNumber ? { serialNumber } : {}),
      ...(softwareVersion ? { softwareVersion } : {}),
      ...(softwareChecksum ? { softwareChecksum } : {}),
    }),
    [unit, accuracyClass, indicatingType, rangeKind, ranges, flags, manufacturer, model,
     serialNumber, softwareVersion, softwareChecksum],
  );

  // Preview on a debounce: an officer typing "15000" passes through 1, 15, 150 and 1500, and
  // each of those is a different instrument as far as the engine is concerned.
  const debounced = useDebounced(profile, 350);
  const preview = useProfilePreview(debounced);

  const step = WIZARD_STEPS[stepIndex]!;
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  /** A step is complete when the things it collects are present and legal. */
  const completion = useMemo(() => {
    const rangesFilled = ranges.every((r) => r.e && r.d && r.min && r.max);
    const rangeErrors = (preview.data?.issues ?? []).some(
      (i) => i.severity === "error" && (i.path ?? "").startsWith("ranges"),
    );
    return {
      identity: Boolean(manufacturer && model),
      metrology: rangesFilled && !rangeErrors,
      construction: true, // every feature has a defensible default of "no"
      review: !preview.data?.blocking,
    } as Record<string, boolean>;
  }, [manufacturer, model, ranges, preview.data]);

  function setRange(i: number, patch: Partial<RangeRow>) {
    setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function loadSample() {
    setUnit("g");
    setAccuracyClass("III");
    setIndicatingType("self");
    setRangeKind("multi-interval");
    setRanges(SAMPLE.ranges.map((r) => ({ ...r })));
    setManufacturer(SAMPLE.manufacturer);
    setModel(SAMPLE.model);
    setSerialNumber(SAMPLE.serialNumber);
    setSoftwareVersion(SAMPLE.softwareVersion);
    setSoftwareChecksum(SAMPLE.softwareChecksum);
    setFlags((f) => ({ ...f, electronic: true, hasTareDevice: true, softwareControlled: true }));
  }

  async function submit() {
    const result = await save.run(reportId, profile, detail.report.version);
    if (result) {
      setSavedIssues(result.issues);
      reload();
      if (!result.issues.some((i) => i.severity === "error")) {
        navigate(reportPath(reportId, "tests"));
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Stepper
        current={stepIndex}
        completion={completion}
        onSelect={setStepIndex}
      />

      <div className="grid items-start gap-5 xl:grid-cols-5">
        <div className="flex flex-col gap-5 xl:col-span-3">
          <Card elevation="raised">
            {/*
              No step heading here. The stepper directly above already names the step and its
              number, and a heading, a "Step 2 of 4" line and a paragraph of purpose were three
              further restatements of it standing between the officer and the first field. The
              purpose is a sentence worth reading once, so it is available on demand.
            */}
            {stepIndex === 0 && (
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="ghost" icon="science" onClick={loadSample}>
                  Load worked example
                </Button>
              </div>
            )}

            {step.id === "identity" && (
              <IdentityStep
                {...{ manufacturer, setManufacturer, model, setModel, serialNumber, setSerialNumber,
                      indicatingType, setIndicatingType }}
                report={detail.report}
              />
            )}
            {step.id === "metrology" && (
              <MetrologyStep
                {...{ accuracyClass, setAccuracyClass, unit, setUnit, rangeKind, setRangeKind,
                      ranges, setRanges, setRange }}
              />
            )}
            {step.id === "construction" && (
              <ConstructionStep
                {...{ flags, setFlags, softwareVersion, setSoftwareVersion,
                      softwareChecksum, setSoftwareChecksum }}
              />
            )}
            {step.id === "review" && (
              <ReviewStep profile={profile} preview={preview.data} unit={unit} />
            )}
          </Card>

          {/* Actions live at the foot of the form, where the eye ends up. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
            <Button
              variant="ghost"
              icon="arrow_back"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => i - 1)}
            >
              {stepIndex === 0 ? "Back" : `Back: ${WIZARD_STEPS[stepIndex - 1]!.title}`}
            </Button>

            <span className="text-body-sm text-on-surface-variant">
              {step.number} of {WIZARD_STEPS.length} · {model || "unnamed instrument"}
            </span>

            <div className="flex items-center gap-2">
              {isLast ? (
                <Button variant="primary" icon="check" loading={save.pending} onClick={submit}>
                  Save and resolve tests
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon="arrow_forward"
                  onClick={() => setStepIndex((i) => i + 1)}
                >
                  Continue to {WIZARD_STEPS[stepIndex + 1]!.title}
                </Button>
              )}
            </div>
          </div>

          {save.error && <Alert tone="fail" title="Could not save">{save.error}</Alert>}
          {savedIssues?.some((i) => i.severity === "error") && (
            <Alert tone="fail" title="Saved, but the profile has blocking findings">
              The profile is recorded — nothing you typed was lost — but the report cannot be
              validated until these are resolved. They are listed in the panel beside this form.
            </Alert>
          )}
        </div>

        {/*
          The live panel, and what it shows depends on the step.
          
          A permissible-error staircase beside the manufacturer's name is answering a question
          nobody has asked yet. Each step gets the consequence of *that* step: what the
          certificate will carry, then the bands, then the test count, then the whole thing.
        */}
        <div className="flex flex-col gap-5 xl:col-span-2">
          <LivePanel
            preview={preview}
            unit={unit}
            profile={profile}
            step={step.id}
            report={detail.report}
            onJumpToStep={(id) => {
              const i = WIZARD_STEPS.findIndex((s) => s.id === id);
              if (i >= 0) setStepIndex(i);
            }}
            onFixRangeMin={(rangeIndex, requiredGrams) => {
              setRange(rangeIndex, { min: String(gramsToUnit(requiredGrams, unit)) });
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The stepper
// ---------------------------------------------------------------------------

/**
 * The sub-steps, kept visually subordinate to the report rail above them.
 *
 * These were four large cards, which put a second full-weight stepper directly beneath the
 * report's own progress rail — two things of equal prominence claiming to be *the* indicator of
 * where you are. A reader cannot follow two. So the report rail stays the primary progress
 * indicator and this is a tab strip: same information, visibly a level down.
 */
function Stepper({
  current,
  completion,
  onSelect,
}: {
  current: number;
  completion: Record<string, boolean>;
  onSelect: (i: number) => void;
}) {
  return (
    <nav aria-label="Registration steps" className="flex gap-1 rounded-xl bg-surface-container-low p-1">
      {WIZARD_STEPS.map((s, i) => {
        const done = completion[s.id] && i < current;
        const isCurrent = i === current;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(i)}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              isCurrent
                ? "bg-surface-container-lowest card-shadow"
                : "hover:bg-surface-container-lowest/60",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-label-sm font-bold",
                done
                  ? "bg-success-container text-on-success"
                  : isCurrent
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {done ? <Icon name="check" size={12} /> : s.number}
            </span>
            <span
              className={cn(
                "truncate text-label-md",
                isCurrent ? "font-semibold text-on-surface" : "text-on-surface-variant",
              )}
            >
              {s.title}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — identity
// ---------------------------------------------------------------------------

function IdentityStep(p: {
  manufacturer: string; setManufacturer: (v: string) => void;
  model: string; setModel: (v: string) => void;
  serialNumber: string; setSerialNumber: (v: string) => void;
  indicatingType: InstrumentProfileShape["indicatingType"];
  setIndicatingType: (v: InstrumentProfileShape["indicatingType"]) => void;
  report: { application_no: string | null; profile: string; ruleset_id: string; created_at: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-label-lg text-on-surface mb-2">The instrument</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manufacturer" required>
            <Input value={p.manufacturer} onChange={(e) => p.setManufacturer(e.target.value)} />
          </Field>
          <Field label="Model" required hint="As it will appear on the certificate.">
            <Input value={p.model} onChange={(e) => p.setModel(e.target.value)} />
          </Field>
          <Field label="Serial number" hint="Of the sample submitted for testing.">
            <Input value={p.serialNumber} onChange={(e) => p.setSerialNumber(e.target.value)} />
          </Field>
          <Field
            label="How equilibrium is reached"
            required
            hint="Non-self-indicating instruments attract the sensitivity test and are excluded from checklist 17.1."
          >
            <Select value={p.indicatingType} onChange={(e) => p.setIndicatingType(e.target.value as never)}>
              <option value="self">Self-indicating — settles on its own</option>
              <option value="semi-self">Semi-self-indicating</option>
              <option value="non-self">Non-self-indicating — the operator balances it</option>
            </Select>
          </Field>
        </div>
      </section>

      {/*
        The application context, fixed when the report was created.
        
        Shown here rather than only on the creation screen because these are the fields AoM
        Rule 5 puts alongside the instrument's identity, and an officer returning to a report
        weeks later needs them without hunting. They are read-only: the rule pack in particular
        is pinned at creation so that a later pack update cannot retroactively change an issued
        result, and letting it be edited here would defeat that.
      */}
      <section>
        <h3 className="text-label-lg text-on-surface mb-2">
          The application
          <Explain term="these fields">
            Fixed when the report was created. The rule pack is pinned so a later update to the
            standard cannot change a result that has already been issued.
          </Explain>
        </h3>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {[
            ["Application number", p.report.application_no ?? "Not allotted"],
            ["Conformity profile",
              p.report.profile === "IN_Sch7A"
                ? "Seventh Schedule, Heading A"
                : p.report.profile === "OIML_R76" ? "OIML R 76" : p.report.profile],
            ["Rule pack", p.report.ruleset_id],
            ["Opened", new Date(p.report.created_at).toLocaleDateString("en-IN", {
              day: "2-digit", month: "short", year: "numeric" })],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-outline-variant/30 py-1.5">
              <dt className="text-body-sm text-on-surface-variant">{k}</dt>
              <dd className="text-body-md text-on-surface text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — metrology
// ---------------------------------------------------------------------------

function MetrologyStep(p: {
  accuracyClass: InstrumentProfileShape["accuracyClass"];
  setAccuracyClass: (v: InstrumentProfileShape["accuracyClass"]) => void;
  unit: InstrumentProfileShape["unit"];
  setUnit: (v: InstrumentProfileShape["unit"]) => void;
  rangeKind: InstrumentProfileShape["rangeKind"];
  setRangeKind: (v: InstrumentProfileShape["rangeKind"]) => void;
  ranges: RangeRow[];
  setRanges: (fn: (rs: RangeRow[]) => RangeRow[]) => void;
  setRange: (i: number, patch: Partial<RangeRow>) => void;
}) {
  const kind = RANGE_KINDS.find((k) => k.id === p.rangeKind)!;
  const selectedClass = ACCURACY_CLASSES.find((c) => c.id === p.accuracyClass)!;

  return (
    <div className="flex flex-col gap-6">
      {/* Accuracy class. Four compact choices; the detail that matters once is one click away. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-label-lg text-on-surface">
            Accuracy class
            <Explain term="the accuracy class">
              Pick by what the instrument is for. The class fixes the permissible errors and
              decides which of the seventeen test forms apply.
            </Explain>
          </h3>
          <Clause>R 76-1 Table 3</Clause>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ACCURACY_CLASSES.map((c) => {
            const selected = p.accuracyClass === c.id;
            return (
              <button
                key={c.id}
                onClick={() => p.setAccuracyClass(c.id)}
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  selected
                    ? "border-primary bg-primary-fixed"
                    : "border-outline-variant/60 hover:bg-surface-container-low",
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className={cn("text-label-lg font-bold", selected ? "text-on-primary-fixed" : "text-on-surface")}>
                    {c.symbol}
                  </span>
                  <span className="text-label-md text-on-surface-variant">{c.name}</span>
                </span>
                <span className="mt-0.5 block text-body-sm text-on-surface-variant leading-snug">
                  {c.examples}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-body-sm text-on-surface-variant">
          <span>{selectedClass.meaning}</span>
          <Badge tone="neutral">{selectedClass.eRange}</Badge>
          <Badge tone="neutral">n {selectedClass.nRange}</Badge>
          <Badge tone="neutral">{selectedClass.minCapacity}</Badge>
        </p>
      </section>

      {/* Range structure. The consequence in one line; the reasoning behind a disclosure. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-label-lg text-on-surface">
            Range structure
            <Explain term="the range structure">
              How the weighing range is divided. This is the choice most often got wrong, and it
              decides whether the report carries one set of forms or one per range.
            </Explain>
          </h3>
          <Clause>{kind.clause}</Clause>
        </div>
        <div className="flex gap-1 rounded-xl bg-surface-container-low p-1">
          {RANGE_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => {
                p.setRangeKind(k.id);
                if (k.id === "single") p.setRanges((rs) => rs.slice(0, 1));
                else p.setRanges((rs) => (rs.length === 1 ? [...rs, { ...BLANK_RANGE }] : rs));
              }}
              aria-pressed={p.rangeKind === k.id}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-label-md font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                p.rangeKind === k.id
                  ? "bg-surface-container-lowest text-on-surface card-shadow"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {k.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          {kind.meaning} <span className="text-on-surface">{kind.consequence}</span>
        </p>
      </section>

      {/* Ranges. Compact rows: labels once, in the header, rather than under every field. */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-label-lg text-on-surface">
              {p.rangeKind === "single" ? "Weighing range" : "Ranges"}
              <Explain term="the scale intervals">
                <strong>e</strong> is the verification scale interval — the step the instrument is
                held to legally. <strong>d</strong> is the actual scale interval, the smallest
                change the display shows. They are often equal. <strong>n = Max / e</strong> is
                what the class limits are set on.
              </Explain>
            </h3>
          </div>
          <Field label="Unit" className="w-24">
            <Select value={p.unit} onChange={(e) => p.setUnit(e.target.value as never)} className="h-9">
              <option value="mg">mg</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="t">t</option>
            </Select>
          </Field>
        </div>

        <div className="overflow-hidden rounded-xl border border-outline-variant/50">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low">
                <th className="w-24 px-3 py-1.5 text-left text-label-sm uppercase tracking-wider text-on-surface-variant">
                  {p.rangeKind === "multi-interval" ? "Partial" : "Range"}
                </th>
                {["e", "d", "Min", "Max"].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left text-label-sm uppercase tracking-wider text-on-surface-variant">{h}</th>
                ))}
                <th className="w-24 px-3 py-1.5 text-right text-label-sm uppercase tracking-wider text-on-surface-variant">n</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {p.ranges.map((r, i) => {
                const n = r.e && r.max && Number(r.e) > 0 ? Number(r.max) / Number(r.e) : null;
                return (
                  <tr key={i} className="border-t border-outline-variant/30">
                    <td className="px-3 py-1.5 text-body-sm text-on-surface-variant">{i + 1}</td>
                    {(["e", "d", "min", "max"] as const).map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        <Input
                          value={r[k]}
                          onChange={(e) => p.setRange(i, { [k]: e.target.value })}
                          inputMode="decimal"
                          className="h-9 tabular-nums"
                          aria-label={`${k} for range ${i + 1}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-body-sm tabular-nums text-on-surface">
                      {n === null ? "—" : fmtNumber(Math.round(n))}
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      {p.ranges.length > 1 && (
                        <button
                          onClick={() => p.setRanges((rs) => rs.filter((_, j) => j !== i))}
                          aria-label={`Remove range ${i + 1}`}
                          className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                        >
                          <Icon name="close" size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {p.rangeKind !== "single" && (
          <Button
            variant="ghost" size="sm" icon="add" className="mt-2"
            onClick={() => p.setRanges((rs) => [...rs, { ...BLANK_RANGE }])}
          >
            Add {p.rangeKind === "multi-interval" ? "partial range" : "range"}
          </Button>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — construction
// ---------------------------------------------------------------------------

function ConstructionStep(p: {
  flags: Record<string, boolean>;
  setFlags: (fn: (f: Record<string, boolean>) => Record<string, boolean>) => void;
  softwareVersion: string; setSoftwareVersion: (v: string) => void;
  softwareChecksum: string; setSoftwareChecksum: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {FEATURE_GROUPS.map((group) => (
        <section key={group.id}>
          <h3 className="text-label-lg text-on-surface">{group.title}</h3>
          <p className="text-body-sm text-on-surface-variant mb-2.5">{group.hint}</p>
          {/*
            Two columns. Each of these is a short question with a one-line answer, and stacking
            eleven of them singly ran the step to 1.6 screens against a half-empty right-hand
            panel — scrolling past whitespace to reach a checkbox.
          */}
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.filter((f) => f.group === group.id).map((f) => {
              const on = Boolean(p.flags[f.key as string]);
              return (
                <label
                  key={f.key as string}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors",
                    on ? "border-primary/40 bg-primary-fixed/40" : "border-outline-variant/50 hover:bg-surface-container-low",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      p.setFlags((prev) => ({ ...prev, [f.key as string]: e.target.checked }))
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-label-lg text-on-surface">{f.label}</span>
                    <span className="block text-body-sm text-on-surface-variant">{f.question}</span>
                    {on && (
                      <span className="mt-1.5 flex items-start gap-1.5 text-body-sm text-primary">
                        <Icon name="add_circle" size={14} className="mt-0.5 shrink-0" />
                        {f.effect}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      {p.flags["softwareControlled"] && (
        <section>
          <h3 className="text-label-lg text-on-surface mb-2.5">Software identification</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Software version">
              <Input value={p.softwareVersion} onChange={(e) => p.setSoftwareVersion(e.target.value)} />
            </Field>
            <Field
              label="Checksum"
              hint="Checked for format against Annex G, and against every other report in the repository."
            >
              <Input
                value={p.softwareChecksum}
                onChange={(e) => p.setSoftwareChecksum(e.target.value)}
                className="font-mono"
                placeholder="34559a18232bc0c6c417"
              />
            </Field>
          </div>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            The live national register carries a file size, a modulus and template filler in this
            field on real certificates. An error-severity finding here will stop the report
            validating — which is the check doing its job.
          </p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — review
// ---------------------------------------------------------------------------

function ReviewStep({
  profile,
  preview,
  unit,
}: {
  profile: InstrumentProfileShape;
  preview: ProfilePreview | null;
  unit: string;
}) {
  const applicable = preview?.applicable.filter((t) => t.applicable) ?? [];
  const excluded = preview?.applicable.filter((t) => !t.applicable) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {[
          ["Manufacturer", profile.manufacturer ?? "—"],
          ["Model", profile.model ?? "—"],
          ["Serial number", profile.serialNumber ?? "—"],
          ["Accuracy class", `Class ${profile.accuracyClass}`],
          ["Range structure", RANGE_KINDS.find((k) => k.id === profile.rangeKind)?.name ?? profile.rangeKind],
          ["Indication", profile.indicatingType],
          ["Maximum capacity", `${profile.ranges.map((r) => fmtNumber(r.max)).join(" / ")} ${unit}`],
          ["Scale interval", `${profile.ranges.map((r) => fmtNumber(r.e)).join(" / ")} ${unit}`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-outline-variant/30 py-1.5">
            <dt className="text-body-sm text-on-surface-variant">{k}</dt>
            <dd className="text-body-md text-on-surface text-right">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="text-label-lg text-on-surface mb-2">
          {applicable.length} test{applicable.length === 1 ? "" : "s"} will apply
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {applicable.map((t) => (
            <Badge key={`${t.formId}-${t.rangeIndex ?? 0}`} tone="info">
              {t.formId} {t.title ?? t.testId.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </div>

      {excluded.length > 0 && (
        <div>
          <h3 className="text-label-lg text-on-surface mb-2">
            {excluded.length} will not, and the report will say why
          </h3>
          <ul className="flex flex-col gap-1.5">
            {excluded.map((t) => (
              <li key={`${t.formId}-${t.rangeIndex ?? 0}`} className="flex gap-2 text-body-sm">
                <Badge tone="neutral" className="shrink-0 font-mono">{t.formId}</Badge>
                <span className="text-on-surface-variant">{t.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The live panel
// ---------------------------------------------------------------------------

/**
 * One panel, not three.
 *
 * This was a status card, a staircase card and a test-list card stacked down the right side —
 * three headings competing to be the thing the officer reads. It answers one question, so it is
 * one card: is this a legal instrument, and what will it be held to?
 *
 * The band table and the form list are real answers but rarely needed while typing, so they sit
 * behind disclosures. The staircase stays open because it is the one thing that cannot be said
 * in a sentence.
 */
function LivePanel({
  preview,
  unit,
  profile,
  step,
  report,
  onJumpToStep,
  onFixRangeMin,
}: {
  preview: ReturnType<typeof useProfilePreview>;
  unit: string;
  profile: InstrumentProfileShape;
  step: string;
  report: { lab_id: string; created_at: string; profile: string };
  onJumpToStep: (stepId: string) => void;
  onFixRangeMin: (rangeIndex: number, requiredGrams: number) => void;
}) {
  // Step 1 is about identity, so the panel says what that identity will become rather than
  // showing bands for ranges the officer has not reached yet. But a blocking finding raised on
  // a step the officer has already left does not stop existing — silence here would read as
  // "nothing is wrong" when something still is.
  if (step === "identity") {
    const carriedErrors = (preview.data?.issues ?? []).filter((i) => i.severity === "error");
    return (
      <Card elevation="raised" className="xl:sticky xl:top-[92px]">
        <h2 className="text-label-lg text-on-surface mb-3">What this becomes</h2>
        <p className="text-body-md text-on-surface-variant">
          These four fields are what the certificate carries and what the public register will
          show. Twelve of sixteen sampled certificates name the manufacturer and model exactly as
          they were entered here.
        </p>
        {carriedErrors.length > 0 && (
          <button
            onClick={() => onJumpToStep(carriedErrors[0]!.path?.startsWith("ranges") ? "metrology" : "construction")}
            className="mt-3 flex w-full items-start gap-2 rounded-xl bg-error-container/50 p-3 text-left transition-colors hover:bg-error-container/70"
          >
            <Icon name="error" size={16} className="mt-0.5 shrink-0 text-on-error-container" />
            <span className="text-body-sm text-on-error-container">
              {carriedErrors.length} blocking finding{carriedErrors.length === 1 ? "" : "s"} further
              on — this step is fine, but the report cannot be saved until they are fixed.
            </span>
          </button>
        )}
        <div className="mt-4 rounded-xl border border-outline-variant/50 p-3.5">
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
            On the certificate
          </p>
          <p className="mt-1 text-headline-sm text-on-surface">
            {profile.model || "Model"}
          </p>
          <p className="text-body-md text-on-surface-variant">
            {profile.manufacturer || "Manufacturer"}
          </p>
          {profile.serialNumber && (
            <p className="mt-1 font-mono text-body-sm text-on-surface-variant">
              {profile.serialNumber}
            </p>
          )}
        </div>
        <p className="mt-3 text-body-sm text-on-surface-variant">
          Approval marks follow <span className="font-mono">IND / lab / year / model</span> under
          AoM Rule 12. <Clause>Rule 5 — application contents</Clause>
        </p>
      </Card>
    );
  }

  const data = preview.data;
  const errors = (data?.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (data?.issues ?? []).filter((i) => i.severity === "warning");
  const applicable = (data?.applicable ?? []).filter((t) => t.applicable);

  if (!data && !preview.pending) {
    return (
      <Card>
        <p className="text-body-md text-on-surface-variant">
          Enter the class and a weighing range, and the engine&rsquo;s reading of the instrument
          appears here.
        </p>
      </Card>
    );
  }

  return (
    <Card elevation="raised" className="xl:sticky xl:top-[92px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-label-lg text-on-surface">What the engine makes of it</h2>
        {preview.pending && <Spinner size={14} className="text-on-surface-variant" />}
      </div>

      {/*
        The verdict on the combination, in one line — and each finding is a way out of it, not
        just a description of it. A Table 3 minimum-capacity shortfall is arithmetic the engine
        already did (the required value is right there in the message); asking the officer to
        re-derive it and retype it is friction the panel can remove. Everything else at least
        says which step owns it, so "fix this" does not mean "go hunting".
      */}
      {errors.length > 0 ? (
        <div className="rounded-xl bg-error-container/50 p-3">
          <p className="flex items-center gap-1.5 text-label-md text-on-error-container">
            <Icon name="error" size={16} />
            {errors.length} blocking finding{errors.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1.5 flex flex-col gap-2 text-body-sm text-on-surface">
            {errors.map((issue, k) => {
              const rangeIndex = parseRangeIndex(issue.path);
              const requiredGrams =
                issue.code === "E_MIN_CAPACITY_TOO_LOW" ? parseRequiredMinGrams(issue.message) : null;
              const ownerStep =
                issue.path?.startsWith("ranges") ? "metrology"
                : issue.code?.startsWith("E_SWID") ? "construction"
                : null;
              return (
                <li key={k} className="flex flex-col items-start gap-1">
                  <span>{issue.message}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {rangeIndex !== null && requiredGrams !== null && (
                      <button
                        onClick={() => onFixRangeMin(rangeIndex, requiredGrams)}
                        className="rounded-full bg-on-error-container/10 px-2.5 py-1 text-label-sm font-semibold text-on-error-container transition-colors hover:bg-on-error-container/20"
                      >
                        Set Min to {fmtNumber(gramsToUnit(requiredGrams, unit))} {unit}
                      </button>
                    )}
                    {ownerStep && ownerStep !== step && (
                      <button
                        onClick={() => onJumpToStep(ownerStep)}
                        className="rounded-full px-2.5 py-1 text-label-sm text-on-error-container underline decoration-dotted underline-offset-2 transition-colors hover:bg-on-error-container/10"
                      >
                        Go to {ownerStep}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : data ? (
        <p className="flex items-center gap-1.5 rounded-xl bg-success-container/50 px-3 py-2 text-label-md text-on-success">
          <Icon name="check_circle" size={16} />
          A legal combination under Table 3
        </p>
      ) : null}

      {warnings.length > 0 && (
        <p className="mt-2 text-body-sm text-on-surface-variant">
          <Icon name="warning" size={13} className="mr-1 inline align-[-2px] text-[#B45309]" />
          {warnings.map((i) => i.message).join(" ")}
        </p>
      )}

      {/* n per range — the number the class limits are actually set on. */}
      {profile.ranges.some((r) => r.e > 0 && r.max > 0) && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
          {profile.ranges.map((r, i) =>
            r.e > 0 && r.max > 0 ? (
              <span key={i}>
                {profile.ranges.length > 1 ? `n${i + 1}` : "n"}{" "}
                <span className="font-semibold tabular-nums text-on-surface">
                  {fmtNumber(Math.round(r.max / r.e))}
                </span>
              </span>
            ) : null,
          )}
        </p>
      )}

      {data && data.bands.length > 0 && step !== "construction" && (
        <>
          <div className="mt-4 border-t border-outline-variant/40 pt-3">
            <p className="mb-1 text-label-md text-on-surface">
              Permissible error across the range
              <span className="ml-1.5 font-normal text-on-surface-variant">
                {data.bands.length} band{data.bands.length === 1 ? "" : "s"}
              </span>
            </p>
            <MpeStaircase bands={data.bands} unit={unit} />
          </div>

          <Disclosure summary={`The ${data.bands.length} bands as a table`} className="mt-2">
            <table className="w-full border-collapse text-body-sm">
              <tbody>
                {data.bands.map((b, i) => (
                  <tr key={i} className="border-b border-outline-variant/30 last:border-0">
                    <td className="py-1 tabular-nums text-on-surface-variant">
                      {fmtNumber(b.fromLoad)}–{fmtNumber(b.toLoad)} {unit}
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums text-on-surface">
                      ± {fmtNumber(b.mpe)} {unit}
                    </td>
                    <td className="py-1 pl-3 text-right text-on-surface-variant">
                      {b.factor} e{data.bands.some((x) => x.e !== b.e) ? b.rangeIndex : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              In service these double. <Clause>R 76-1 §3.5.2</Clause>
            </p>
          </Disclosure>
        </>
      )}

      {data && data.applicable.length > 0 && step === "construction" && (
        <div className="mt-4 border-t border-outline-variant/40 pt-3">
          <p className="text-metric-display text-on-surface tabular-nums">
            {applicable.length}
            <span className="text-body-lg text-on-surface-variant"> of {data.applicable.length} forms</span>
          </p>
          <p className="text-body-sm text-on-surface-variant">
            Every feature you tick changes this. Endurance always runs last.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.applicable.map((t) => (
              <Badge
                key={`${t.formId}-${t.rangeIndex ?? 0}`}
                tone={t.applicable ? "info" : "neutral"}
                className={t.applicable ? undefined : "opacity-50"}
              >
                {t.formId}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {data && data.applicable.length > 0 && step !== "construction" && (
        <Disclosure
          summary={`${applicable.length} of ${data.applicable.length} test forms apply`}
          className="mt-2"
        >
          <div className="flex flex-wrap gap-1">
            {data.applicable.map((t) => (
              <Badge
                key={`${t.formId}-${t.rangeIndex ?? 0}`}
                tone={t.applicable ? "info" : "neutral"}
                className={t.applicable ? undefined : "opacity-50"}
              >
                {t.formId}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Changing a feature on the next step changes this count.
          </p>
        </Disclosure>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Turning a finding into a fix
// ---------------------------------------------------------------------------

/** Grams-per-unit, mirroring the engine's own toGrams (packages/engine/src/applicability.ts). */
const UNIT_FACTOR: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 };

function gramsToUnit(grams: number, unit: string): number {
  const factor = UNIT_FACTOR[unit] ?? 1;
  // Round to a sane number of decimals rather than carrying float noise into the field —
  // an officer typing "20" should not get back "19.999999999998".
  return Math.round((grams / factor) * 1e6) / 1e6;
}

/** validate.ts's path shape is `ranges[i].min` — pull the index back out. */
function parseRangeIndex(path?: string): number | null {
  const m = path?.match(/^ranges\[(\d+)\]/);
  return m ? Number(m[1]) : null;
}

/**
 * validate.ts's E_MIN_CAPACITY_TOO_LOW message ends "... required <n>e = <grams> g for class
 * <cls>." — the engine already did the multiplication; this reads the answer back out rather
 * than re-deriving it client-side, which would risk disagreeing with the engine that actually
 * decides.
 */
function parseRequiredMinGrams(message: string): number | null {
  const m = message.match(/=\s*([\d.]+)\s*g for class/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Preview plumbing
// ---------------------------------------------------------------------------

export interface ProfilePreview {
  issues: Issue[];
  bands: {
    fromLoad: number; toLoad: number; mpe: number; factor: number;
    e: number; rangeIndex: number; startsNewRange: boolean;
  }[];
  applicable: ApplicableTest[];
  blocking: boolean;
}

/**
 * Ask the engine what it makes of an unsaved profile.
 *
 * Deliberately a server call rather than arithmetic in the browser. The whole compliance
 * argument rests on every number coming from one tested engine; a "preview" computed
 * client-side would be a second implementation that could disagree with the report, and the
 * moment it did, the screen would be lying.
 */
function useProfilePreview(profile: InstrumentProfileShape) {
  const [data, setData] = useState<ProfilePreview | null>(null);
  const [pending, setPending] = useState(false);

  const ready = profile.ranges.every((r) => r.e > 0 && r.max > 0 && Number.isFinite(r.min));

  useEffect(() => {
    if (!ready) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    let live = true;
    setPending(true);

    api
      .previewProfile(profile, controller.signal)
      .then((result) => { if (live) setData(result); })
      .catch(() => { /* a half-typed profile is not an error worth showing */ })
      .finally(() => { if (live) setPending(false); });

    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(profile), ready]);

  return { data, pending };
}
