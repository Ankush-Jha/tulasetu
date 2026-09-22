/**
 * Annex F — module compatibility.
 *
 * Most instruments on the national register are assembled rather than designed as a unit:
 * twelve of sixteen sampled certificates name a separately certified load cell. Annex F is
 * what says whether a given indicator and load cell may be combined without testing the pair,
 * and it is a set of inequalities, not a judgement.
 *
 * One correction worth knowing, because it is easy to get backwards: F.4(2) is a
 * **containment** test, not an overlap. The instrument's declared temperature range must sit
 * *inside* each module's rated range. Two ranges can overlap and still fail.
 *
 * Every check returns the required value, the actual value and its clause, so the page shows
 * the working rather than a verdict alone.
 */

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { cn } from "../lib/cn";
import { ApiError } from "../lib/api";
import { useMutation } from "../lib/useApi";

interface CheckResult {
  check: string;
  passed: boolean;
  clause: string;
  detail: string;
  required: number | string;
  actual: number | string;
}
interface ModulesResult {
  checks: CheckResult[];
  verdict: string;
}

async function checkModules(input: unknown): Promise<ModulesResult> {
  const res = await fetch("/api/tools/modules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.getItem("taraazu.userId")
        ? { "X-User-Id": localStorage.getItem("taraazu.userId")! }
        : {}),
    },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "UNKNOWN", body?.message ?? "Check failed.");
  return body as ModulesResult;
}

export function ModulesPage() {
  // Defaults describe a plausible single-cell class III platform. The load-cell figures are
  // illustrative rather than taken from a datasheet — see the note at the foot of the page.
  const [wi, setWi] = useState({
    accuracyClass: "III",
    max: "30000",
    e: "10",
    reductionRatio: "1",
    numberOfLoadCells: "1",
    deadLoad: "2000",
    initialZeroSettingRange: "600",
    nonUniformLoadCorrection: "0",
    tempMin: "-10",
    tempMax: "40",
  });
  const [lc, setLc] = useState({
    accuracyClass: "C",
    maxCapacity: "35000",
    minDeadLoad: "0",
    maxScaleIntervals: "3000",
    y: "15000",
    tempMin: "-10",
    tempMax: "40",
    fractionOfMpe: "0.7",
    humidityMark: "CH",
  });
  const [ind, setInd] = useState({
    accuracyClass: "III",
    maxScaleIntervals: "6000",
    tempMin: "-10",
    tempMax: "40",
    fractionOfMpe: "0.5",
  });

  const [result, setResult] = useState<ModulesResult | null>(null);
  const run = useMutation(checkModules);

  async function submit() {
    const out = await run.run({
      instrument: {
        accuracyClass: wi.accuracyClass,
        unit: "g",
        ranges: [{ max: Number(wi.max), e: Number(wi.e) }],
        reductionRatio: Number(wi.reductionRatio),
        numberOfLoadCells: Number(wi.numberOfLoadCells),
        deadLoad: Number(wi.deadLoad),
        initialZeroSettingRange: Number(wi.initialZeroSettingRange),
        nonUniformLoadCorrection: Number(wi.nonUniformLoadCorrection),
        temperatureRange: { minC: Number(wi.tempMin), maxC: Number(wi.tempMax) },
      },
      loadCell: {
        accuracyClass: lc.accuracyClass,
        unit: "g",
        maxCapacity: Number(lc.maxCapacity),
        minDeadLoad: Number(lc.minDeadLoad),
        maxScaleIntervals: Number(lc.maxScaleIntervals),
        y: Number(lc.y),
        temperatureRange: { minC: Number(lc.tempMin), maxC: Number(lc.tempMax) },
        fractionOfMpe: Number(lc.fractionOfMpe),
        humidityMark: lc.humidityMark,
      },
      indicator: {
        accuracyClass: ind.accuracyClass,
        maxScaleIntervals: Number(ind.maxScaleIntervals),
        temperatureRange: { minC: Number(ind.tempMin), maxC: Number(ind.tempMax) },
        fractionOfMpe: Number(ind.fractionOfMpe),
      },
    });
    if (out) setResult(out);
  }

  const failed = result?.checks.filter((c) => !c.passed) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="R 76-1 Annex F"
        title="Module compatibility"
        description="Whether a separately certified indicator and load cell may be combined into an instrument without testing the pair."
        actions={
          <Button variant="primary" icon="play_arrow" loading={run.pending} onClick={submit}>
            Check compatibility
          </Button>
        }
      />

      {/*
        `min-w-0` on both columns below overrides the grid item default of `min-width: auto` —
        without it, a grid item's minimum width is its content's min-content, and the results
        table (F.check descriptions plus four more columns) pushed the whole page wider than
        its viewport at 390px rather than scrolling inside its own card (F14/V-03).
      */}
      <div className="grid items-start gap-5 xl:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-3">
          <Card>
            <CardHeader icon="scale" title="Weighing instrument" description="Annex F.1 — masses in grams" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Accuracy class">
                <Select value={wi.accuracyClass} onChange={(e) => setWi({ ...wi, accuracyClass: e.target.value })}>
                  {["I", "II", "III", "IIII"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <NumField label="Max" value={wi.max} onChange={(v) => setWi({ ...wi, max: v })} />
              <NumField label="e" value={wi.e} onChange={(v) => setWi({ ...wi, e: v })} />
              <NumField label="R — reduction ratio" hint="1 with no leverwork" value={wi.reductionRatio} onChange={(v) => setWi({ ...wi, reductionRatio: v })} />
              <NumField label="N — load cells" value={wi.numberOfLoadCells} onChange={(v) => setWi({ ...wi, numberOfLoadCells: v })} />
              <NumField label="DL — dead load" value={wi.deadLoad} onChange={(v) => setWi({ ...wi, deadLoad: v })} />
              <NumField label="IZSR" hint="Initial zero-setting range" value={wi.initialZeroSettingRange} onChange={(v) => setWi({ ...wi, initialZeroSettingRange: v })} />
              <NumField label="NUD" hint="Non-uniform load correction" value={wi.nonUniformLoadCorrection} onChange={(v) => setWi({ ...wi, nonUniformLoadCorrection: v })} />
              <TempPair minV={wi.tempMin} maxV={wi.tempMax} onMin={(v) => setWi({ ...wi, tempMin: v })} onMax={(v) => setWi({ ...wi, tempMax: v })} />
            </div>
          </Card>

          <Card>
            <CardHeader icon="sensors" title="Load cell" description="Annex F.2 — from its OIML R 60 certificate" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="R 60 class">
                <Select value={lc.accuracyClass} onChange={(e) => setLc({ ...lc, accuracyClass: e.target.value })}>
                  {["A", "B", "C", "D"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <NumField label="Emax" value={lc.maxCapacity} onChange={(v) => setLc({ ...lc, maxCapacity: v })} />
              <NumField label="Emin" value={lc.minDeadLoad} onChange={(v) => setLc({ ...lc, minDeadLoad: v })} />
              <NumField label="nLC" value={lc.maxScaleIntervals} onChange={(v) => setLc({ ...lc, maxScaleIntervals: v })} />
              <NumField label="Y = Emax / vmin" value={lc.y} onChange={(v) => setLc({ ...lc, y: v })} />
              <NumField label="pLC" hint="F.2.2 default 0.7" value={lc.fractionOfMpe} onChange={(v) => setLc({ ...lc, fractionOfMpe: v })} />
              <Field label="Humidity mark" hint="NH cells are not allowed under the modular approach">
                <Select value={lc.humidityMark} onChange={(e) => setLc({ ...lc, humidityMark: e.target.value })}>
                  {["CH", "SH", "NH"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <TempPair minV={lc.tempMin} maxV={lc.tempMax} onMin={(v) => setLc({ ...lc, tempMin: v })} onMax={(v) => setLc({ ...lc, tempMax: v })} />
            </div>
          </Card>

          <Card>
            <CardHeader icon="monitor" title="Indicator" description="Annex F.3" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Accuracy class">
                <Select value={ind.accuracyClass} onChange={(e) => setInd({ ...ind, accuracyClass: e.target.value })}>
                  {["I", "II", "III", "IIII"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <NumField label="nind" value={ind.maxScaleIntervals} onChange={(v) => setInd({ ...ind, maxScaleIntervals: v })} />
              <NumField label="pind" hint="F.3.2 default 0.5" value={ind.fractionOfMpe} onChange={(v) => setInd({ ...ind, fractionOfMpe: v })} />
              <TempPair minV={ind.tempMin} maxV={ind.tempMax} onMin={(v) => setInd({ ...ind, tempMin: v })} onMax={(v) => setInd({ ...ind, tempMax: v })} />
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          {run.error && <Alert tone="fail" title="Check failed">{run.error}</Alert>}

          {!result ? (
            <Card>
              <EmptyState
                icon="memory"
                title="No check run yet"
                description="A plausible single-cell class III platform is loaded. Press Check compatibility to see every Annex F condition evaluated."
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat
                  label="Verdict"
                  value={result.verdict}
                  icon={result.verdict === "PASSED" ? "check_circle" : "cancel"}
                  tone={result.verdict === "PASSED" ? "pass" : "fail"}
                />
                <Stat
                  label="Checks"
                  value={`${result.checks.length - failed.length} / ${result.checks.length}`}
                  icon="rule"
                  tone={failed.length === 0 ? "pass" : "warn"}
                />
              </div>

              <Card padded={false}>
                <div className="p-5 pb-0">
                  <CardHeader icon="rule" title="Every condition" description="Required against actual, with its clause" />
                </div>
                <TableWrap className="rounded-t-none border-x-0 border-b-0">
                  <thead>
                    <tr>
                      <Th>Check</Th>
                      <Th align="right">Required</Th>
                      <Th align="right">Actual</Th>
                      <Th align="center">Result</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.checks.map((c) => (
                      <tr key={c.check} className={cn(!c.passed && "bg-error-container/30")}>
                        <Td>
                          <span className="block text-body-md text-on-surface">{c.detail}</span>
                          <Clause>{c.clause}</Clause>
                        </Td>
                        <Td align="right" numeric className="text-body-sm">{String(c.required)}</Td>
                        <Td align="right" numeric className="text-body-sm">{String(c.actual)}</Td>
                        <Td align="center">
                          <Badge tone={c.passed ? "pass" : "fail"} icon={c.passed ? "check" : "close"}>
                            {c.passed ? "OK" : "Fail"}
                          </Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </Card>
            </>
          )}

          <Alert tone="warn" icon="warning" title="The default load-cell figures are illustrative">
            Emax, Y and nLC above are plausible values, not readings from a datasheet. Use the
            figures printed on the cell&rsquo;s own OIML R 60 certificate before relying on a
            result or putting it in front of anyone.
          </Alert>

          <Card>
            <CardHeader icon="info" title="Containment, not overlap" />
            <p className="text-body-md text-on-surface-variant">
              F.4(2) requires the instrument&rsquo;s declared temperature range to lie inside
              each module&rsquo;s rated range — <span className="font-mono text-body-sm">Tmin_module ≤ Tmin_WI</span>{" "}
              and <span className="font-mono text-body-sm">Tmax_module ≥ Tmax_WI</span>. Ranges that
              merely overlap fail. Error apportionment also has a floor as well as a ceiling:
              each contributing fraction is at least 0.3 and at most 0.8, with{" "}
              <span className="font-mono text-body-sm">Σpᵢ² ≤ 1</span>.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function NumField({
  label, value, onChange, hint,
}: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="tabular-nums" />
    </Field>
  );
}

function TempPair({
  minV, maxV, onMin, onMax,
}: { minV: string; maxV: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <>
      <NumField label="Tmin (°C)" value={minV} onChange={onMin} />
      <NumField label="Tmax (°C)" value={maxV} onChange={onMax} />
    </>
  );
}
