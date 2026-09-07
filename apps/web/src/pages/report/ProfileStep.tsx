/**
 * Instrument profile.
 *
 * The most consequential screen in the application: the accuracy class and the weighing
 * ranges decide every permissible error the report will contain, and which of R 76-2's forms
 * apply at all.
 *
 * Two things are deliberate.
 *
 * **Range structure is a first-class choice, not a checkbox.** A multi-interval instrument has
 * one Max and one weighing range, split into partial ranges whose `e` changes with the load
 * (R 76-1 §3.3). A multiple-range instrument is several independent instruments in one case
 * (§3.2), and gets a full set of forms *per range*. Conflating them is the classic error, so
 * the form names the difference where the choice is made.
 *
 * **Validation findings are shown, never enforced by refusing the write.** An officer must be
 * able to see why a profile is wrong while they are typing it; refusing to save would lose
 * what they entered. The lifecycle guard is what stops an invalid report progressing.
 */

import { useEffect, useState, type FormEvent } from "react";
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
  Select,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, type Issue } from "../../lib/api";
import { useMutation } from "../../lib/useApi";
import { reportPath } from "../../lib/nav";
import { fmtNumber } from "../../lib/format";
import { useReport, type InstrumentProfileShape } from "./ReportLayout";

type RangeRow = { e: string; d: string; min: string; max: string };

const BLANK_RANGE: RangeRow = { e: "", d: "", min: "", max: "" };

/**
 * R 76-1 §3.3's worked example — Max 2 / 5 / 15 kg, e = 1 / 2 / 10 g, class III.
 *
 * The instrument the engine's golden tests are built on, so loading it here and walking the
 * loads gives a result that can be checked against the standard by eye.
 */
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

  const [flags, setFlags] = useState({
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

  const [issues, setIssues] = useState<Issue[]>([]);
  const save = useMutation(api.setProfile);

  // Load whatever is already recorded, so returning to this step shows the report's state
  // rather than an empty form.
  useEffect(() => {
    if (!instrument) return;
    setUnit(instrument.unit);
    setAccuracyClass(instrument.accuracyClass);
    setIndicatingType(instrument.indicatingType);
    setRangeKind(instrument.rangeKind);
    setRanges(
      instrument.ranges.map((r) => ({
        e: String(r.e), d: String(r.d), min: String(r.min), max: String(r.max),
      })),
    );
    setManufacturer(instrument.manufacturer ?? "");
    setModel(instrument.model ?? "");
    setSerialNumber(instrument.serialNumber ?? "");
    setSoftwareVersion(instrument.softwareVersion ?? "");
    setSoftwareChecksum(instrument.softwareChecksum ?? "");
    setFlags((f) => ({
      ...f,
      electronic: instrument.electronic,
      softwareControlled: instrument.softwareControlled ?? false,
      hasTareDevice: instrument.hasTareDevice ?? false,
      hasPrintOrStorage: instrument.hasPrintOrStorage ?? false,
      tiltable: instrument.tiltable ?? false,
      rollingLoad: instrument.rollingLoad ?? false,
      vehiclePowered: instrument.vehiclePowered ?? false,
      directSalesToPublic: instrument.directSalesToPublic ?? false,
      priceComputing: instrument.priceComputing ?? false,
      modular: instrument.modular ?? false,
    }));
  }, [instrument]);

  function loadSample() {
    setUnit("g");
    setAccuracyClass("III");
    setIndicatingType("self");
    setRangeKind("multi-interval");
    setRanges(SAMPLE.ranges.map((r) => ({ ...r })));
    setManufacturer(SAMPLE.manufacturer ?? "");
    setModel(SAMPLE.model ?? "");
    setSerialNumber(SAMPLE.serialNumber ?? "");
    setSoftwareVersion(SAMPLE.softwareVersion ?? "");
    setSoftwareChecksum(SAMPLE.softwareChecksum ?? "");
    setFlags((f) => ({ ...f, electronic: true, hasTareDevice: true }));
  }

  function setRange(i: number, patch: Partial<RangeRow>) {
    setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload: InstrumentProfileShape = {
      unit,
      accuracyClass,
      indicatingType,
      rangeKind,
      ranges: ranges.map((r) => ({
        e: Number(r.e), d: Number(r.d), min: Number(r.min), max: Number(r.max),
      })),
      ...flags,
      ...(manufacturer ? { manufacturer } : {}),
      ...(model ? { model } : {}),
      ...(serialNumber ? { serialNumber } : {}),
      ...(softwareVersion ? { softwareVersion } : {}),
      ...(softwareChecksum ? { softwareChecksum } : {}),
    };

    const result = await save.run(reportId, payload, detail.report.version);
    if (result) {
      setIssues(result.issues);
      reload();
      // Only move on when nothing blocking came back — otherwise the officer would land on
      // the test list without having seen why the profile is wrong.
      if (!result.issues.some((i) => i.severity === "error")) {
        navigate(reportPath(reportId, "tests"));
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const isMultiRange = rangeKind !== "single";

  return (
    <form onSubmit={submit} className="grid items-start gap-5 xl:grid-cols-3">
      <div className="flex flex-col gap-5 xl:col-span-2">
        {/* Identity */}
        <Card>
          <CardHeader
            icon="badge"
            title="Identity"
            description="Carried onto the report header and the certificate"
            action={
              <Button type="button" size="sm" variant="ghost" icon="science" onClick={loadSample}>
                Load worked example
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Manufacturer">
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </Field>
            <Field label="Model">
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <Field label="Serial number">
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </Field>
            <Field label="Software version">
              <Input value={softwareVersion} onChange={(e) => setSoftwareVersion(e.target.value)} />
            </Field>
            <Field
              label="Software checksum"
              className="sm:col-span-2"
              hint="R 76-1 Annex G. Checked for format, and against every other report in the repository — the national register contains one value shared by two manufacturers."
            >
              <Input
                value={softwareChecksum}
                onChange={(e) => setSoftwareChecksum(e.target.value)}
                className="font-mono"
                placeholder="34559a18232bc0c6c417"
              />
            </Field>
          </div>
        </Card>

        {/* Metrology */}
        <Card>
          <CardHeader icon="straighten" title="Metrological characteristics" description="R 76-1 Table 3" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Accuracy class" required>
              <Select value={accuracyClass} onChange={(e) => setAccuracyClass(e.target.value as never)}>
                <option value="I">I — special</option>
                <option value="II">II — high</option>
                <option value="III">III — medium</option>
                <option value="IIII">IIII / IV — ordinary</option>
              </Select>
            </Field>
            <Field label="Unit" required>
              <Select value={unit} onChange={(e) => setUnit(e.target.value as never)}>
                <option value="mg">mg</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="t">t</option>
              </Select>
            </Field>
            <Field label="Indication" required>
              <Select value={indicatingType} onChange={(e) => setIndicatingType(e.target.value as never)}>
                <option value="self">Self-indicating</option>
                <option value="semi-self">Semi-self-indicating</option>
                <option value="non-self">Non-self-indicating</option>
              </Select>
            </Field>
            <Field label="Range structure" required>
              <Select
                value={rangeKind}
                onChange={(e) => {
                  const next = e.target.value as InstrumentProfileShape["rangeKind"];
                  setRangeKind(next);
                  if (next === "single") setRanges((rs) => rs.slice(0, 1));
                  else if (ranges.length === 1) setRanges((rs) => [...rs, { ...BLANK_RANGE }]);
                }}
              >
                <option value="single">Single range</option>
                <option value="multi-interval">Multi-interval</option>
                <option value="multiple-range">Multiple range</option>
              </Select>
            </Field>
          </div>

          {isMultiRange && (
            <div className="mt-4">
              <Alert
                tone="info"
                icon={rangeKind === "multi-interval" ? "linear_scale" : "call_split"}
                title={rangeKind === "multi-interval" ? "One weighing range, split into partial ranges" : "Several independent weighing ranges"}
              >
                {rangeKind === "multi-interval" ? (
                  <>
                    One Max and one weighing range; <strong>e changes with the load</strong>, so the
                    permissible-error band can change part-way up the range without the display
                    resolution changing. One set of forms. <Clause>R 76-1 §3.3</Clause>
                  </>
                ) : (
                  <>
                    Each range is treated as if it were an instrument with one range, so the report
                    carries <strong>a full set of forms per range</strong>. <Clause>R 76-1 §3.2</Clause>
                  </>
                )}
              </Alert>
            </div>
          )}

          {/* Ranges */}
          <div className="mt-4 flex flex-col gap-3">
            {ranges.map((r, i) => (
              <div
                key={i}
                className="rounded-xl border border-outline-variant/50 bg-surface-container-low/40 p-3.5"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-label-md text-on-surface">
                    {rangeKind === "single"
                      ? "Weighing range"
                      : rangeKind === "multi-interval"
                        ? `Partial range ${i + 1}`
                        : `Weighing range ${i + 1}`}
                  </span>
                  {ranges.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label={`e${ranges.length > 1 ? ` (e${i + 1})` : ""}`} required>
                    <Input
                      value={r.e}
                      onChange={(e) => setRange(i, { e: e.target.value })}
                      inputMode="decimal"
                      className="tabular-nums"
                      required
                    />
                  </Field>
                  <Field label="d" required>
                    <Input
                      value={r.d}
                      onChange={(e) => setRange(i, { d: e.target.value })}
                      inputMode="decimal"
                      className="tabular-nums"
                      required
                    />
                  </Field>
                  <Field label="Min" required>
                    <Input
                      value={r.min}
                      onChange={(e) => setRange(i, { min: e.target.value })}
                      inputMode="decimal"
                      className="tabular-nums"
                      required
                    />
                  </Field>
                  <Field
                    label="Max"
                    required
                    hint={
                      r.e && r.max && Number(r.e) > 0
                        ? `n = ${fmtNumber(Number(r.max) / Number(r.e))}`
                        : undefined
                    }
                  >
                    <Input
                      value={r.max}
                      onChange={(e) => setRange(i, { max: e.target.value })}
                      inputMode="decimal"
                      className="tabular-nums"
                      required
                    />
                  </Field>
                </div>
              </div>
            ))}

            {rangeKind !== "single" && (
              <Button
                type="button"
                variant="secondary"
                icon="add"
                onClick={() => setRanges((rs) => [...rs, { ...BLANK_RANGE }])}
              >
                Add {rangeKind === "multi-interval" ? "partial range" : "weighing range"}
              </Button>
            )}
          </div>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader
            icon="tune"
            title="Features"
            description="These decide which forms apply — each one switches a test on or off"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["electronic", "Electronic", "Unlocks warm-up, voltage, disturbance, damp heat and span stability"],
                ["softwareControlled", "Software-controlled", "Adds checklist 17.4"],
                ["hasTareDevice", "Tare device", "Adds form 9"],
                ["hasPrintOrStorage", "Printing or storage device", "Adds form 7"],
                ["tiltable", "Liable to be tilted in use", "Adds form 8"],
                ["rollingLoad", "Loaded by a rolling load", "Adds form 3.2"],
                ["vehiclePowered", "Powered from a road vehicle", "Adds form 12.7"],
                ["directSalesToPublic", "Direct sales to the public", "Class II here becomes II* — an Indian designation with no OIML equivalent"],
                ["priceComputing", "Price computing or labelling", "Adds checklist 17.2"],
                ["modular", "Modular construction", "Enables the Annex F compatibility check"],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                  flags[key]
                    ? "border-primary/40 bg-primary-fixed/40"
                    : "border-outline-variant/50 hover:bg-surface-container-low",
                )}
              >
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(e) => setFlags((f) => ({ ...f, [key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-label-md text-on-surface">{label}</span>
                  <span className="block text-body-sm text-on-surface-variant">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
      </div>

      {/* Right column: validation and save */}
      <div className="flex flex-col gap-5">
        <Card elevation="raised">
          <CardHeader icon="save" title="Save profile" />
          <p className="text-body-sm text-on-surface-variant mb-3">
            Saving re-resolves which forms apply. Findings are shown here rather than blocking
            the write — you can correct them and save again.
          </p>
          <Button type="submit" variant="primary" icon="check" loading={save.pending} className="w-full">
            Save and resolve tests
          </Button>
          {save.error && (
            <div className="mt-3">
              <Alert tone="fail" title="Could not save">{save.error}</Alert>
            </div>
          )}
        </Card>

        {issues.length > 0 && (
          <Card>
            <CardHeader
              icon={errors.length ? "error" : warnings.length ? "warning" : "info"}
              title="Validation"
              description={`${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
            />
            <ul className="flex flex-col gap-2">
              {[...errors, ...warnings, ...infos].map((issue, i) => (
                <li key={`${issue.code}-${i}`} className="flex gap-2.5">
                  <Icon
                    name={issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "info"}
                    size={16}
                    className={cn(
                      "mt-0.5 shrink-0",
                      issue.severity === "error"
                        ? "text-error"
                        : issue.severity === "warning"
                          ? "text-[#B45309]"
                          : "text-on-surface-variant",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-body-md text-on-surface">{issue.message}</span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <Badge tone="neutral" className="font-mono">{issue.code}</Badge>
                      {issue.clause && <Clause>{issue.clause}</Clause>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader icon="lightbulb" title="Why this matters" />
          <p className="text-body-md text-on-surface-variant">
            On the worked example — Max 2 / 5 / 15 kg, e = 1 / 2 / 10 g, class III — the
            permissible error walks ±0.5 g, ±1 g, ±2 g, ±3 g, ±10 g as the load rises. The jump
            from ±2 g to ±3 g happens at 4 kg, in the middle of a partial range, with no change
            in what the display shows. A spreadsheet that uses one <em>e</em> for the whole
            instrument gets every row past the first changeover wrong.
          </p>
        </Card>
      </div>
    </form>
  );
}
