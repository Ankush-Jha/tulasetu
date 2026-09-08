/**
 * The instrument — one screen.
 *
 * This was four sub-steps with a tab strip of their own, sitting directly under the report's
 * own progress rail, beside a permanent panel restating what the engine made of each answer as
 * it was typed. Two steppers and a running commentary for fifteen fields.
 *
 * The fields are unchanged, because they are what R 76-2 and AoM Rule 5 ask for. What changed
 * is that they are now one page with four headed sections, so the hierarchy is carried by
 * headings rather than by a second navigation the reader has to operate. The consequence of an
 * answer is shown once, where it lands: the resolved permissible-error bands sit under the
 * ranges table that produces them, and the test count sits under the features that change it.
 *
 * The preview is still a real engine call (`POST /tools/profile-preview`) on the unsaved
 * profile, never arithmetic in the browser. That matters: a second implementation in the client
 * could disagree with the report, and the moment it did the screen would be lying.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Clause,
  Field,
  Icon,
  Input,
  Disclosure,
  Select,
  Spinner,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, type ApplicableTest, type Issue } from "../../lib/api";
import { useDebounced, useMutation } from "../../lib/useApi";
import { reportPath } from "../../lib/nav";
import { fmtNumber } from "../../lib/format";
import { ACCURACY_CLASSES, FEATURES, RANGE_KINDS } from "../../content/registration";
import { useReport, type InstrumentProfileShape } from "./ReportLayout";

type RangeRow = { e: string; d: string; min: string; max: string };
const BLANK_RANGE: RangeRow = { e: "", d: "", min: "", max: "" };

export function ProfileStep() {
  const { reportId, instrument, detail, reload, writable } = useReport();
  const navigate = useNavigate();

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

  // On a debounce: an officer typing "15000" passes through 1, 15, 150 and 1500, and each of
  // those is a different instrument as far as the engine is concerned.
  const preview = useProfilePreview(useDebounced(profile, 350));

  function setRange(i: number, patch: Partial<RangeRow>) {
    setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
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

  const errors = (preview.data?.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (preview.data?.issues ?? []).filter((i) => i.severity === "warning");
  const applicableCount = (preview.data?.applicable ?? []).filter((t) => t.applicable).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {/*
        The form itself is inert on a closed report: every control inside stops taking focus,
        clicks and typing, without each of them having to know about it. The banner at the top
        of the page says why. The server refuses the write regardless — this only stops an
        officer filling in a form that was never going to be accepted.
      */}
      <div className={cn("contents", !writable && "pointer-events-none opacity-90")} inert={!writable}>
      {/* 1 — Identity ---------------------------------------------------- */}
      <Card>
        <SectionHeading n={1} title="Identity" note="What the certificate will carry." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manufacturer" required>
            <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </Field>
          <Field label="Model" required>
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          <Field label="Serial number" hint="Of the sample submitted for testing.">
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </Field>
          <Field label="Indication">
            <Select value={indicatingType} onChange={(e) => setIndicatingType(e.target.value as never)}>
              <option value="self">Self-indicating</option>
              <option value="semi-self">Semi-self-indicating</option>
              <option value="non-self">Non-self-indicating</option>
            </Select>
          </Field>
        </div>
      </Card>

      {/* 2 — Metrology --------------------------------------------------- */}
      <Card>
        <SectionHeading
          n={2}
          title="Class and weighing range"
          note="This decides the permissible errors and which tests apply."
        />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ACCURACY_CLASSES.map((c) => {
            const selected = accuracyClass === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setAccuracyClass(c.id)}
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  selected ? "border-primary bg-primary-fixed" : "border-outline-variant/60 hover:bg-surface-container-low",
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className={cn("text-label-lg font-bold", selected ? "text-on-primary-fixed" : "text-on-surface")}>
                    {c.symbol}
                  </span>
                  <span className="text-label-md text-on-surface-variant">{c.name}</span>
                </span>
                <span className="mt-0.5 block text-body-sm leading-snug text-on-surface-variant">
                  {c.examples}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-surface-container-low p-1">
            {RANGE_KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => {
                  setRangeKind(k.id);
                  if (k.id === "single") setRanges((rs) => rs.slice(0, 1));
                  else setRanges((rs) => (rs.length === 1 ? [...rs, { ...BLANK_RANGE }] : rs));
                }}
                aria-pressed={rangeKind === k.id}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-label-md font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  rangeKind === k.id
                    ? "bg-surface-container-lowest text-on-surface card-shadow"
                    : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                {k.name}
              </button>
            ))}
          </div>
          <Field label="Unit" className="w-24">
            <Select value={unit} onChange={(e) => setUnit(e.target.value as never)} className="h-9">
              <option value="mg">mg</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="t">t</option>
            </Select>
          </Field>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-outline-variant/50">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low">
                <th className="w-16 px-3 py-1.5 text-left text-label-sm uppercase tracking-wider text-on-surface-variant">
                  {rangeKind === "multi-interval" ? "Partial" : "Range"}
                </th>
                {["e", "d", "Min", "Max"].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left text-label-sm uppercase tracking-wider text-on-surface-variant">{h}</th>
                ))}
                <th className="w-20 px-3 py-1.5 text-right text-label-sm uppercase tracking-wider text-on-surface-variant">n</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {ranges.map((r, i) => {
                const n = r.e && r.max && Number(r.e) > 0 ? Number(r.max) / Number(r.e) : null;
                return (
                  <tr key={i} className="border-t border-outline-variant/30">
                    <td className="px-3 py-1.5 text-body-sm text-on-surface-variant">{i + 1}</td>
                    {(["e", "d", "min", "max"] as const).map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        <Input
                          value={r[k]}
                          onChange={(e) => setRange(i, { [k]: e.target.value })}
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
                      {ranges.length > 1 && (
                        <button
                          onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
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

        {rangeKind !== "single" && (
          <Button
            variant="ghost" size="sm" icon="add" className="mt-2"
            onClick={() => setRanges((rs) => [...rs, { ...BLANK_RANGE }])}
          >
            Add {rangeKind === "multi-interval" ? "partial range" : "range"}
          </Button>
        )}

        {/*
          The engine's answer, where the answer is owed: directly under the numbers that
          produce it, not in a panel running alongside the whole form. On a multi-interval
          instrument the band widens part-way up the range with nothing changing on the
          display, which is the error a spreadsheet makes.
        */}
        <BandReadout preview={preview} unit={unit} ranges={profile.ranges} />
      </Card>

      {/* 3 — Construction ------------------------------------------------ */}
      <Card>
        <SectionHeading
          n={3}
          title="Construction and use"
          note={`Each answer switches test forms on or off. ${applicableCount > 0 ? `${applicableCount} apply so far.` : ""}`}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const on = Boolean(flags[f.key as string]);
            return (
              <label
                key={f.key as string}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  on ? "border-primary/40 bg-primary-fixed/40" : "border-outline-variant/50 hover:bg-surface-container-low",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setFlags((prev) => ({ ...prev, [f.key as string]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-label-lg text-on-surface">{f.label}</span>
                  {/* The consequence, only once it is a consequence. */}
                  {on && <span className="block text-body-sm text-primary">{f.effect}</span>}
                </span>
              </label>
            );
          })}
        </div>

        {flags["softwareControlled"] && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Software version">
              <Input value={softwareVersion} onChange={(e) => setSoftwareVersion(e.target.value)} />
            </Field>
            <Field
              label="Checksum"
              hint="Checked for format against R 76-1 Annex G, and against every other report."
            >
              <Input
                value={softwareChecksum}
                onChange={(e) => setSoftwareChecksum(e.target.value)}
                className="font-mono"
                placeholder="34559a18232bc0c6c417"
              />
            </Field>
          </div>
        )}
      </Card>

      {/* Findings and the way forward ------------------------------------ */}
      {errors.length > 0 && (
        <Alert tone="fail" title={`${errors.length} blocking finding${errors.length === 1 ? "" : "s"}`}>
          <ul className="flex flex-col gap-1.5">
            {errors.map((issue, k) => {
              const requiredGrams =
                issue.code === "E_MIN_CAPACITY_TOO_LOW" ? parseRequiredMinGrams(issue.message) : null;
              const rangeIndex = parseRangeIndex(issue.path);
              return (
                <li key={k} className="flex flex-wrap items-center gap-2">
                  <span>{issue.message}</span>
                  {/* The engine already did this arithmetic — the required value is in the
                      message. Asking the officer to re-derive and retype it is friction. */}
                  {rangeIndex !== null && requiredGrams !== null && (
                    <button
                      onClick={() => setRange(rangeIndex, { min: String(gramsToUnit(requiredGrams, unit)) })}
                      className="rounded-full bg-on-error-container/10 px-2.5 py-0.5 text-label-sm font-semibold text-on-error-container transition-colors hover:bg-on-error-container/20"
                    >
                      Set Min to {fmtNumber(gramsToUnit(requiredGrams, unit))} {unit}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert tone="warn" title="Worth checking">{warnings.map((i) => i.message).join(" ")}</Alert>
      )}

      {save.error && <Alert tone="fail" title="Could not save">{save.error}</Alert>}
      {savedIssues?.some((i) => i.severity === "error") && (
        <Alert tone="fail" title="Saved, with blocking findings">
          The profile is recorded — nothing you typed was lost — but the report cannot be
          validated until the findings above are resolved.
        </Alert>
      )}

      {/*
        No save on a report that cannot be saved. The server refuses it — a locked report is the
        record copy under ISO/IEC 17025 §7.8 — and offering the button anyway meant filling in a
        form to be told so afterwards. The banner above the page says why; here the way forward
        is simply the next section.
      */}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
        <span className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          {preview.pending && <Spinner size={14} />}
          {errors.length === 0 && preview.data
            ? "A legal combination under R 76-1 Table 3."
            : "Enter the class and a weighing range."}
        </span>
        {writable ? (
          <Button variant="primary" icon="check" loading={save.pending} onClick={submit}>
            Save and resolve tests
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="arrow_forward"
            onClick={() => navigate(reportPath(reportId, "tests"))}
          >
            Applicable tests
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionHeading({ n, title, note }: { n: number; title: string; note: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-label-sm font-bold text-on-surface-variant">
        {n}
      </span>
      <h2 className="text-label-lg font-semibold text-on-surface">{title}</h2>
      <p className="min-w-0 text-body-sm text-on-surface-variant">{note}</p>
    </div>
  );
}

/**
 * The resolved permissible-error bands, in one line plus a table on demand.
 *
 * This used to be a staircase chart in a sticky panel. The chart was handsome and answered a
 * question nobody had asked yet; what an officer needs while typing a range is whether the
 * combination is legal and where the band steps — which is a sentence and a short table.
 */
function BandReadout({
  preview,
  unit,
  ranges,
}: {
  preview: ReturnType<typeof useProfilePreview>;
  unit: string;
  ranges: { e: number; max: number }[];
}) {
  const data = preview.data;
  if (!data || data.bands.length === 0) return null;

  const stepsMidRange = data.bands.some((b) => b.startsNewRange && b.fromLoad > 0);

  return (
    <div className="mt-4 border-t border-outline-variant/40 pt-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant">
        <span>
          <span className="font-semibold text-on-surface">{data.bands.length}</span> permissible-error
          band{data.bands.length === 1 ? "" : "s"} across the range
        </span>
        {ranges.map((r, i) =>
          r.e > 0 && r.max > 0 ? (
            <Badge key={i} tone="neutral">
              {ranges.length > 1 ? `n${i + 1}` : "n"} {fmtNumber(Math.round(r.max / r.e))}
            </Badge>
          ) : null,
        )}
      </p>

      {stepsMidRange && (
        <p className="mt-1.5 flex items-start gap-1.5 text-body-sm text-on-surface">
          <Icon name="swap_vert" size={15} className="mt-0.5 shrink-0 text-primary" />
          e changes part-way up the range, so the permissible error widens with nothing changing
          on the display. <Clause>R 76-1 §3.3</Clause>
        </p>
      )}

      <Disclosure summary="The bands as a table" className="mt-2">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turning a finding into a fix
// ---------------------------------------------------------------------------

/** Grams-per-unit, mirroring the engine's own toGrams (packages/engine/src/applicability.ts). */
const UNIT_FACTOR: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 };

function gramsToUnit(grams: number, unit: string): number {
  const factor = UNIT_FACTOR[unit] ?? 1;
  // Round to a sane number of decimals rather than carrying float noise into the field — an
  // officer typing "20" should not get back "19.999999999998".
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
 * than re-deriving it client-side, which would risk disagreeing with the engine that decides.
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
 * argument rests on every number coming from one tested engine.
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
