/**
 * Observation entry.
 *
 * The screen the product exists for. An officer types load and indication; the server returns
 * the error, the corrected error, the resolved permissible error and the verdict for every row.
 *
 * **Nothing here computes anything.** Not the error, not the band, not the pass/fail. The
 * browser posts readings and renders what comes back. That is what makes the numbers on screen
 * the same numbers the report will carry, and it is why the mpe column is worth watching: on a
 * multi-interval instrument it changes as the load crosses a partial range, which is the error
 * a spreadsheet makes and the reason this application exists.
 *
 * The live preview above the table resolves a single load without recording anything, so the
 * band can be seen before a reading is committed.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  TableWrap,
  Td,
  Th,
  Verdict,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, type WeighingRow } from "../../lib/api";
import { useApi, useDebounced, useMutation } from "../../lib/useApi";
import { fmtMass, fmtMpe, fmtNumber, fmtSigned } from "../../lib/format";
import { NeedsProfile, useReport } from "./ReportLayout";

type Row = { load: string; indication: string; additionalLoad: string; label: string };

const BLANK: Row = { load: "", indication: "", additionalLoad: "0", label: "" };

export function ObservationsStep() {
  const { reportId, detail, instrument, reload } = useReport();
  const [params, setParams] = useSearchParams();

  const applicable = useMemo(
    () =>
      [...detail.forms]
        .filter((f) => f.applicable === 1)
        .sort((a, b) => a.form_id.localeCompare(b.form_id, undefined, { numeric: true })),
    [detail.forms],
  );

  const formId = params.get("form") ?? applicable[0]?.form_id ?? "1";
  const currentForm = applicable.find((f) => f.form_id === formId);

  const [rows, setRows] = useState<Row[]>([{ ...BLANK, load: "0", indication: "0", label: "zero" }]);
  const [results, setResults] = useState<WeighingRow[] | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [previewLoad, setPreviewLoad] = useState("");

  const record = useMutation(api.recordObservations);
  const debouncedPreview = useDebounced(previewLoad, 300);

  // Live band for a single load. Resolved by the engine, never derived here.
  const preview = useApi(
    (s) => api.previewMpe(reportId, Number(debouncedPreview), s),
    [reportId, debouncedPreview],
    { enabled: Boolean(debouncedPreview) && Number.isFinite(Number(debouncedPreview)) },
  );

  // Restore a previously recorded result when switching forms, so the officer sees what is
  // already on the report rather than an empty table.
  useEffect(() => {
    setResults(null);
    setVerdict(currentForm?.verdict ?? null);
    if (!currentForm?.result_json) {
      setRows([{ ...BLANK, load: "0", indication: "0", label: "zero" }]);
      return;
    }
    try {
      const parsed = JSON.parse(currentForm.result_json) as { rows?: WeighingRow[] };
      if (parsed.rows?.length) {
        setResults(parsed.rows);
        setRows(
          parsed.rows.map((r) => ({
            load: String(r.load),
            indication: String(r.indication),
            additionalLoad: String(r.additionalLoad ?? 0),
            label: r.label ?? "",
          })),
        );
      }
    } catch {
      /* A malformed stored result is not worth crashing the page over. */
    }
  }, [formId, currentForm?.result_json, currentForm?.verdict]);

  if (!instrument) return <NeedsProfile />;

  const unit = instrument.unit;

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function compute() {
    const observations = rows
      .filter((r) => r.load !== "" && r.indication !== "")
      .map((r) => ({
        load: Number(r.load),
        indication: Number(r.indication),
        additionalLoad: Number(r.additionalLoad || 0),
        ...(r.label ? { label: r.label } : {}),
      }));
    if (observations.length === 0) return;

    const result = await record.run(reportId, formId, {
      ...(currentForm?.test_id ? { testId: currentForm.test_id } : {}),
      observations,
    });
    if (result) {
      setResults(result.rows);
      setVerdict(result.verdict);
      reload();
    }
  }

  const blockingIssues = record.error;

  return (
    <div className="flex flex-col gap-5">
      {/* Form picker + live band */}
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
          <Field label="Form" hint="Only forms the engine marked applicable appear here.">
            <Select
              value={formId}
              onChange={(e) => setParams({ form: e.target.value }, { replace: true })}
            >
              {applicable.map((f) => (
                <option key={f.form_id} value={f.form_id}>
                  {f.form_id} — {f.test_id.replace(/_/g, " ")}
                  {f.verdict ? ` (${f.verdict})` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="hidden h-10 w-px bg-outline-variant/50 lg:block" />

          <Field
            label="Check a load"
            hint="Resolves the permissible error without recording anything."
          >
            <div className="flex items-center gap-3">
              <Input
                value={previewLoad}
                onChange={(e) => setPreviewLoad(e.target.value)}
                placeholder={`Load in ${unit}`}
                inputMode="decimal"
                className="tabular-nums"
              />
              <div className="min-w-[168px] shrink-0">
                {preview.loading ? (
                  <span className="text-body-sm text-on-surface-variant">Resolving…</span>
                ) : preview.data ? (
                  <span className="flex flex-col leading-tight">
                    <span className="text-headline-sm text-primary tabular-nums">
                      {fmtMpe(preview.data.mpe, unit)}
                    </span>
                    <span className="text-label-sm text-on-surface-variant">
                      {preview.data.factor} e · range {preview.data.rangeIndex} · e = {fmtNumber(preview.data.e)} {unit}
                    </span>
                  </span>
                ) : previewLoad ? (
                  <span className="text-body-sm text-error">Outside the weighing range</span>
                ) : null}
              </div>
            </div>
          </Field>
        </div>

        {preview.data && (
          <div className="mt-3">
            <Alert tone="info" icon="rule">
              {preview.data.reason}
              {preview.data.clause && <> <Clause>{preview.data.clause}</Clause></>}
            </Alert>
          </div>
        )}
      </Card>

      {/* Entry */}
      <Card padded={false}>
        <div className="p-5 pb-3">
          <CardHeader
            icon="edit_note"
            title={`Form ${formId} — observations`}
            description={`Loads and indications in ${unit}. The engine resolves e, the band and the verdict per row.`}
            action={
              verdict ? <Verdict value={verdict} /> : undefined
            }
          />
          <div className="rounded-xl bg-surface-container-low/60 px-3.5 py-2.5">
            <p className="text-body-sm text-on-surface-variant font-mono">
              P = I + ½e − ΔL · E = I + ½e − ΔL − L · Ec = E − E₀ · pass if |Ec| ≤ |mpe|
            </p>
            <p className="text-body-sm text-on-surface-variant mt-1">
              The ½e − ΔL correction is applied only where d &gt; 0.2 e; otherwise E = I − L.
              <Clause> R 76-1 §3.5.3.2</Clause>
            </p>
          </div>
        </div>

        <TableWrap className="rounded-none border-x-0">
          <thead>
            <tr>
              <Th className="w-10"></Th>
              <Th align="right">Load, L</Th>
              <Th align="right">Indication, I</Th>
              <Th align="right">Add. load, ΔL</Th>
              <Th>Note</Th>
              <Th align="right">Error, E</Th>
              <Th align="right">Corrected, Ec</Th>
              <Th align="right" className="w-24">mpe</Th>
              <Th align="center">Result</Th>
              <Th className="w-10"></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const res = results?.[i];
              const failed = res?.verdict === "FAILED";
              return (
                <tr key={i} className={cn(failed && "bg-error-container/30")}>
                  <Td align="center" className="text-label-sm text-on-surface-variant tabular-nums">
                    {i + 1}
                  </Td>
                  <Td>
                    <Input
                      value={r.load}
                      onChange={(e) => setRow(i, { load: e.target.value })}
                      inputMode="decimal"
                      className="h-9 text-right tabular-nums"
                    />
                  </Td>
                  <Td>
                    <Input
                      value={r.indication}
                      onChange={(e) => setRow(i, { indication: e.target.value })}
                      inputMode="decimal"
                      className="h-9 text-right tabular-nums"
                    />
                  </Td>
                  <Td>
                    <Input
                      value={r.additionalLoad}
                      onChange={(e) => setRow(i, { additionalLoad: e.target.value })}
                      inputMode="decimal"
                      className="h-9 text-right tabular-nums"
                    />
                  </Td>
                  <Td>
                    <Input
                      value={r.label}
                      onChange={(e) => setRow(i, { label: e.target.value })}
                      placeholder="—"
                      className="h-9"
                    />
                  </Td>
                  {/* Computed columns are shaded, so what the instrument showed is never
                      confused with what the engine derived. */}
                  <Td align="right" numeric className="bg-surface-container-low/50">
                    {res ? fmtSigned(res.error, unit) : "—"}
                  </Td>
                  <Td align="right" numeric className={cn("bg-surface-container-low/50", failed && "font-bold text-error")}>
                    {res ? fmtSigned(res.correctedError, unit) : "—"}
                  </Td>
                  <Td align="right" numeric className="bg-surface-container-low/50">
                    <span className="whitespace-nowrap">{res ? fmtMpe(res.mpe.mpe, unit) : "—"}</span>
                    {res && (
                      <span className="block text-label-sm text-on-surface-variant">
                        {res.mpe.factor} e{res.mpe.rangeIndex > 1 ? `${res.mpe.rangeIndex}` : ""}
                      </span>
                    )}
                  </Td>
                  <Td align="center">{res ? <Verdict value={res.verdict} /> : null}</Td>
                  <Td align="center">
                    {rows.length > 1 && (
                      <button
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                        aria-label={`Remove row ${i + 1}`}
                        className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon="add" onClick={() => setRows((rs) => [...rs, { ...BLANK }])}>
              Add row
            </Button>
            <Button
              variant="ghost"
              icon="science"
              onClick={() =>
                setRows([
                  { ...BLANK, load: "0", indication: "0", label: "zero" },
                  { ...BLANK, load: "500", indication: "500" },
                  { ...BLANK, load: "2000", indication: "2000", label: "changeover e1 → e2" },
                  { ...BLANK, load: "4000", indication: "4000" },
                  { ...BLANK, load: "4500", indication: "4500" },
                  { ...BLANK, load: "5000", indication: "5000", label: "changeover e2 → e3" },
                  { ...BLANK, load: "15000", indication: "15000", label: "Max" },
                ])
              }
            >
              Fill band-boundary loads
            </Button>
          </div>
          <Button variant="primary" icon="calculate" loading={record.pending} onClick={compute}>
            Compute and record
          </Button>
        </div>
      </Card>

      {blockingIssues && <Alert tone="fail" title="Could not record">{blockingIssues}</Alert>}

      {results && (
        <Card>
          <CardHeader
            icon="insights"
            title="What the engine did"
            description="Each row's band, and why it was chosen"
          />
          <ul className="flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body-sm">
                <Badge tone={r.verdict === "FAILED" ? "fail" : "pass"}>{fmtMass(r.load, unit)}</Badge>
                <span className="text-on-surface-variant">{r.mpe.reason}</span>
                {r.roundingEliminated && (
                  <Badge tone="neutral" icon="rule">rounding eliminated (d &gt; 0.2 e)</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
