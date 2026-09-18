/**
 * Observation entry — the screen the product exists for.
 *
 * **Every column on this screen comes from the printed form.** Not from this file. The server
 * serves `packages/rulepacks/forms/R76-2_2007_forms.json`, transcribed from R 76-2:2007, and
 * this screen renders the columns it declares for the form the officer picked: creep asks for
 * a time of reading, discrimination for two indications either side of an extra load, a
 * disturbance test for an amplitude and a significant-fault mark. That is what makes the
 * question on screen the question the form actually asks.
 *
 * It used to be one hardcoded ten-column weighing table shown for all thirty-six forms, posted
 * to a server that ran the error-against-mpe kernel on every one of them. An officer opening
 * form 6.2 was asked for a load and an indication and told PASSED against a permissible error —
 * a real-looking verdict on a question creep does not ask. Nine of the twenty tests in the rule
 * pack were wrong that way.
 *
 * **Nothing here computes anything.** Not the error, not the band, not the pass/fail. The
 * browser posts the rows and renders what comes back, so the numbers on screen are the numbers
 * the report will carry — the same function produced both.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
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
  TableCallout,
  TableWrap,
  Td,
  Th,
  Verdict,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import {
  api,
  type EnvironmentReading,
  type FormColumnSpec,
  type FormRow,
  type FormSpec,
  type FormSubformSpec,
} from "../../lib/api";
import { useCachedResource, useMutation } from "../../lib/useApi";
import { fmtNumber } from "../../lib/format";
import { NeedsProfile, StepNav, useReport } from "./ReportLayout";

/** What each kernel is judging, in one sentence an officer can act on. */
const KERNEL_SUMMARY: Record<string, string> = {
  K1: "The error at each load is compared with the permissible error for that load.",
  K2: "An extra load is added and the indication must move by the required amount.",
  K3: "The indicating element must show a permanent displacement of at least the class minimum.",
  K4: "Readings are compared across time or temperature against fixed multiples of e.",
  K5: "A fault larger than e counts against the instrument unless it was detected and acted upon.",
  K6: "The printed value must match what was indicated, within fixed multiples of e.",
};

export function ObservationsStep() {
  const { reportId, detail, instrument, reload, writable } = useReport();
  const [params, setParams] = useSearchParams();

  // The R 76-2 layouts are the same file for every report and every officer in the session —
  // fetching them again each time this tab is opened was the slow, and pointless, part of
  // MA-07 ("Loading the R 76-2 form layouts…" taking upward of fifteen seconds once and every
  // time after that paying the network round trip again). Cached once per page load instead.
  const formsFile = useCachedResource("r76-2-forms", () => api.forms());

  const applicable = useMemo(
    () =>
      [...detail.forms]
        .filter((f) => f.applicable === 1)
        .sort((a, b) => a.form_id.localeCompare(b.form_id, undefined, { numeric: true })),
    [detail.forms],
  );

  const formId = params.get("form") ?? applicable[0]?.form_id ?? "1";
  const currentForm = applicable.find((f) => f.form_id === formId);
  const spec: FormSpec | undefined = formsFile.data?.forms.find((f) => f.formId === formId);

  /**
   * The tables this form prints.
   *
   * Most forms print one. Form 7 prints three — printing/storage, zero-setting and tare
   * balancing — with different columns and one shared acceptance, so its own `columns` is empty
   * and the layout lives in `subforms`. Treating "one table" as the special case of "several"
   * means the rest of this screen does not have to know the difference.
   */
  const tables: FormSubformSpec[] = useMemo(() => {
    if (spec?.subforms?.length) return spec.subforms;
    if (spec?.columns?.length) return [{ id: "", title: "", columns: spec.columns }];
    return [];
  }, [spec]);

  /** A form with no table at all is an examination: a judgement and remarks, not a measurement. */
  const isExamination = Boolean(spec) && tables.length === 0;

  // Rows are held per sub-table, keyed by the sub-table's id ("" for a single-table form), so
  // form 7's three tables cannot overwrite one another.
  const [rowsByTable, setRowsByTable] = useState<Record<string, FormRow[]>>({ "": [{}] });
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [environment, setEnvironment] = useState<EnvironmentReading[]>([]);
  const [results, setResults] = useState<(FormRow & { verdict?: string })[] | null>(null);
  const [summary, setSummary] = useState<{ label: string; value: string; verdict?: string }[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);

  const record = useMutation(api.recordObservations);

  // Restore what is already recorded when the officer switches forms, so returning to a form
  // shows the report's state rather than an empty table.
  useEffect(() => {
    setResults(null);
    setSummary([]);
    setNotes([]);
    setExtras({});
    setVerdict(currentForm?.verdict ?? null);

    const checkpoints = spec?.environmental?.checkpoints ?? [];
    const blankEnv = checkpoints.map((checkpoint) => ({ checkpoint }));
    setEnvironment(blankEnv);

    const blank = Object.fromEntries(tables.map((t) => [t.id, [{} as FormRow]]));

    if (!currentForm?.result_json) {
      setRowsByTable(tables.length > 0 ? blank : { "": [{}] });
      return;
    }
    try {
      const parsed = JSON.parse(currentForm.result_json) as {
        rows?: FormRow[];
        summary?: { label: string; value: string; verdict?: string }[];
        notes?: string[];
        environment?: EnvironmentReading[];
      };
      // What was actually recorded, not an empty header. A recorded form used to show blank
      // temperature and humidity boxes, which reads as "nobody wrote these down" when somebody
      // had — and on a published report there is nowhere to write them anyway.
      if (parsed.environment?.length) {
        setEnvironment(
          blankEnv.map((slot) =>
            parsed.environment!.find((e) => e.checkpoint === slot.checkpoint) ?? slot,
          ),
        );
      }
      if (parsed.rows?.length) {
        const grouped: Record<string, FormRow[]> = { ...blank };
        for (const row of parsed.rows) {
          const key = tables.length > 1 ? String(row["subform"] ?? tables[0]!.id) : (tables[0]?.id ?? "");
          (grouped[key] ??= []).push(row);
        }
        // Drop the blank placeholder from any table that came back with real rows.
        for (const k of Object.keys(grouped)) {
          if (grouped[k]!.length > 1) grouped[k] = grouped[k]!.filter((r) => Object.keys(r).length > 0);
        }
        setRowsByTable(grouped);
        setResults(parsed.rows as (FormRow & { verdict?: string })[]);
        setSummary(parsed.summary ?? []);
        setNotes(parsed.notes ?? []);
      } else {
        setRowsByTable(tables.length > 0 ? blank : { "": [{}] });
      }
    } catch {
      setRowsByTable(tables.length > 0 ? blank : { "": [{}] });
    }
  }, [formId, currentForm?.result_json, currentForm?.verdict, spec, tables]);

  if (!instrument) return <NeedsProfile />;
  if (formsFile.initialLoading) {
    return (
      <Card>
        <p className="text-body-md text-on-surface-variant">Loading the R 76-2 form layouts…</p>
      </Card>
    );
  }

  const unit = instrument.unit;

  function setCell(tableId: string, i: number, key: string, value: string | number | boolean) {
    setRowsByTable((all) => ({
      ...all,
      [tableId]: (all[tableId] ?? []).map((r, j) => (j === i ? { ...r, [key]: value } : r)),
    }));
  }

  function addRow(tableId: string) {
    setRowsByTable((all) => ({ ...all, [tableId]: [...(all[tableId] ?? []), {}] }));
  }

  function removeRow(tableId: string, i: number) {
    setRowsByTable((all) => ({
      ...all,
      [tableId]: (all[tableId] ?? []).filter((_, j) => j !== i),
    }));
  }

  async function compute() {
    // Send only rows the officer actually filled in — a trailing blank row is not an
    // observation. Each row is tagged with the sub-table it came from, which is how the runner
    // knows whether a form 7 row is a printing trial or a zero-setting one.
    const filled: FormRow[] = [];
    for (const table of tables) {
      const inputs = (table.columns ?? []).filter((c) => c.kind !== "computed");
      for (const row of rowsByTable[table.id] ?? []) {
        if (!inputs.some((c) => row[c.key] !== undefined && row[c.key] !== "")) continue;
        filled.push(tables.length > 1 ? { ...row, subform: table.id } : row);
      }
    }
    if (filled.length === 0 && !isExamination) return;

    const cleanedExtras = Object.fromEntries(
      Object.entries(extras).filter(([, v]) => v !== ""),
    );
    const recordedEnvironment = environment.filter(
      (e) =>
        e.temperatureC !== undefined ||
        e.relativeHumidityPct !== undefined ||
        e.pressureHPa !== undefined,
    );

    const result = await record.run(reportId, formId, {
      ...(currentForm?.test_id ? { testId: currentForm.test_id } : {}),
      rows: filled,
      ...(Object.keys(cleanedExtras).length > 0 ? { extras: cleanedExtras } : {}),
      ...(recordedEnvironment.length > 0 ? { environment: recordedEnvironment } : {}),
    });
    if (result) {
      setResults(result.rows);
      setSummary(result.summary ?? []);
      setNotes(result.notes ?? []);
      setVerdict(result.verdict);
      reload();
    }
  }

  const kernel = spec?.kernel ?? "K1";

  // The next form worth going to is the next one with no verdict yet, wrapping past the end —
  // an officer who jumps back to fix form 3 should still be pointed at whatever is unfinished,
  // not at form 4 which they did an hour ago.
  const currentIndex = applicable.findIndex((f) => f.form_id === formId);
  const nextForm =
    applicable.slice(currentIndex + 1).find((f) => !f.verdict) ??
    applicable.slice(0, Math.max(currentIndex, 0)).find((f) => !f.verdict) ??
    null;
  const remaining = applicable.filter((f) => !f.verdict).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Which form. One control, because that is the only choice on this screen. */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field
            label="Form"
            hint="Only the forms the engine marked applicable to this instrument."
            className="min-w-[280px] flex-1"
          >
            <Select
              value={formId}
              onChange={(e) => setParams({ form: e.target.value }, { replace: true })}
            >
              {applicable.map((f) => (
                <option key={f.form_id} value={f.form_id}>
                  {f.form_id} — {formsFile.data?.forms.find((s) => s.formId === f.form_id)?.title
                    ?? f.test_id.replace(/_/g, " ")}
                  {f.verdict ? ` · ${f.verdict}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <span className="flex items-center gap-2 pb-1">
            <Badge tone="neutral">{applicable.filter((f) => f.verdict).length} of {applicable.length} recorded</Badge>
            {verdict && <Verdict value={verdict} />}
          </span>
        </div>
      </Card>

      {/* What this form is, and what decides it. */}
      <Card padded={false}>
        <div className="p-5 pb-3">
          <CardHeader
            icon="edit_note"
            title={`Form ${formId} — ${spec?.title ?? currentForm?.test_id.replace(/_/g, " ") ?? ""}`}
            description={KERNEL_SUMMARY[kernel] ?? ""}
            action={spec?.clause ? <Clause>{spec.clause}</Clause> : undefined}
          />

          {spec?.acceptance && (
            <div className="rounded-xl bg-surface-container-low/60 px-3.5 py-2.5">
              <p className="text-body-sm text-on-surface">
                <span className="font-semibold">Acceptance</span> — {spec.acceptance}
              </p>
              {spec.formulas && spec.formulas.length > 0 && (
                <p className="mt-1 font-mono text-body-sm text-on-surface-variant">
                  {spec.formulas.join("  ·  ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* The header values this form carries above its table, where it has any. */}
        {writable && (
          <ExtrasRow formId={formId} kernel={kernel} unit={unit} extras={extras} setExtras={setExtras} />
        )}

        {isExamination ? (
          /*
            R 76-2 form 16 is a free-text page describing the construction of the instrument, and
            its summary row still carries a PASSED / FAILED box. It is an examination — the
            officer's judgement and their remarks are the observation — so it gets a verdict and
            a remarks field rather than a table with a Compute button over nothing.
          */
          <div className="flex flex-col gap-4 px-5 pb-5">
            <Field label="Verdict" className="w-56">
              <Select
                value={extras["verdict"] ?? "PASSED"}
                onChange={(e) => setExtras((x) => ({ ...x, verdict: e.target.value }))}
              >
                <option value="PASSED">Passed</option>
                <option value="FAILED">Failed</option>
              </Select>
            </Field>
            <Field
              label="Remarks"
              hint="Description, main components, and anything a verifying authority would need."
            >
              <textarea
                value={extras["remarks"] ?? ""}
                onChange={(e) => setExtras((x) => ({ ...x, remarks: e.target.value }))}
                rows={6}
                className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </Field>
          </div>
        ) : (
          <>
            {tables.map((table) => (
              <FormTable
                readOnly={!writable}
                key={table.id}
                table={table}
                showTitle={tables.length > 1}
                unit={unit}
                rows={rowsByTable[table.id] ?? []}
                results={results}
                allRows={rowsByTable}
                tables={tables}
                onCell={(i, key, v) => setCell(table.id, i, key, v)}
                onAddRow={() => addRow(table.id)}
                onRemoveRow={(i) => removeRow(table.id, i)}
              />
            ))}

            {spec?.notes && spec.notes.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 px-9 py-4 text-body-sm text-on-surface-variant">
                {spec.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      {/* Laboratory and environmental conditions — a named requirement of the problem
          statement, and the header R 76-2 prints at the top of every env-sensitive form. */}
      {spec?.environmental?.checkpoints && environment.length > 0 && (
        <EnvironmentCard
          spec={spec}
          readings={environment}
          setReadings={setEnvironment}
          readOnly={!writable}
          classI={instrument.accuracyClass === "I"}
        />
      )}

      {record.error && <Alert tone="fail" title="Could not record">{record.error}</Alert>}

      {/* Form-level conditions, where the form has them: creep's two ΔP checks, span's
          variation across measurements. These are not per-row, so they are not columns. */}
      {summary.length > 0 && (
        <Card>
          <CardHeader icon="rule" title="Acceptance conditions" description="What the engine checked, and against what" />
          <ul className="flex flex-col gap-2">
            {summary.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 border-b border-outline-variant/30 pb-1.5 last:border-0">
                {s.verdict && <Verdict value={s.verdict} />}
                <span className="text-body-md text-on-surface">{s.label}</span>
                <span className="ml-auto font-mono text-body-sm tabular-nums text-on-surface-variant">
                  {s.value}
                </span>
              </li>
            ))}
          </ul>
          {notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-body-sm text-on-surface-variant">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/*
        Two moves, and they are different moves.

        Recording this form and moving to the next one is the inner loop — twenty-six times on
        a fully electronic instrument — so it is the primary action, and it says which form is
        next rather than "next". Leaving observations altogether is the outer loop and only
        makes sense once every applicable form carries a verdict, so until then it says how
        many are left.
      */}
      <StepNav
        slug="observations"
        nextLabel={
          !writable
            ? undefined
            : nextForm
              ? `Record and continue to form ${nextForm.form_id}`
              : remaining > 0
                ? `${remaining} form${remaining === 1 ? "" : "s"} still to record`
                : undefined
        }
        onNext={
          writable && nextForm
            ? async () => {
                await compute();
                setParams({ form: nextForm.form_id }, { replace: true });
              }
            : undefined
        }
        extra={
          <>
            {verdict && <Verdict value={verdict} />}
            {/* Nothing to compute on a closed report — the rows below are the record. */}
            {writable && (
              <Button
                variant={nextForm ? "secondary" : "primary"}
                icon={isExamination ? "check" : "calculate"}
                loading={record.pending}
                onClick={compute}
              >
                {isExamination ? "Record examination" : "Compute and record"}
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One printed table
// ---------------------------------------------------------------------------

/**
 * One table of a form, laid out exactly as R 76-2 prints it.
 *
 * The columns come from the form's own spec, so this component never knows what test it is
 * rendering: it draws an input for each column the officer fills, a shaded cell for each one
 * the engine computes, and a verdict at the end. Form 7 gets three of these under one heading;
 * every other form gets one.
 */
function FormTable({
  table,
  readOnly,
  showTitle,
  unit,
  rows,
  results,
  allRows,
  tables,
  onCell,
  onAddRow,
  onRemoveRow,
}: {
  table: FormSubformSpec;
  /** A closed report's rows are the record: shown, never editable. */
  readOnly: boolean;
  showTitle: boolean;
  unit: string;
  rows: FormRow[];
  results: (FormRow & { verdict?: string })[] | null;
  allRows: Record<string, FormRow[]>;
  tables: FormSubformSpec[];
  onCell: (i: number, key: string, v: string | number | boolean) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
}) {
  const inputColumns = (table.columns ?? []).filter((c) => c.kind !== "computed");
  const computedColumns = (table.columns ?? []).filter((c) => c.kind === "computed");

  // Results come back as one flat list in the order the rows were posted, so a sub-table has to
  // count past the tables before it to find its own.
  const offset = tables
    .slice(0, tables.findIndex((t) => t.id === table.id))
    .reduce((n, t) => n + countFilled(allRows[t.id] ?? [], t), 0);

  return (
    <>
      {showTitle && (
        <div className="border-t border-outline-variant/40 bg-surface-container-lowest px-5 py-2.5">
          <h3 className="text-label-lg font-semibold text-on-surface">{table.title}</h3>
          {table.acceptance && (
            <p className="text-body-sm text-on-surface-variant">{table.acceptance}</p>
          )}
        </div>
      )}

      <TableWrap className="rounded-none border-x-0">
        <thead>
          <tr>
            <Th className="w-10" />
            {inputColumns.map((c) => (
              <Th key={c.key} align={alignOf(c)}>{labelOf(c, unit)}</Th>
            ))}
            {computedColumns.map((c) => (
              <Th key={c.key} align="right">{labelOf(c, unit)}</Th>
            ))}
            <Th align="center">Result</Th>
            <Th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const res = results?.[offset + i];
            const failed = res?.verdict === "FAILED";
            return (
              <Fragment key={i}>
                <tr className={cn(failed && "bg-error-container/30")}>
                  <Td align="center" className="text-label-sm tabular-nums text-on-surface-variant">
                    {i + 1}
                  </Td>

                  {inputColumns.map((c) => (
                    <Td key={c.key}>
                      <CellInput
                        column={c}
                        value={row[c.key]}
                        readOnly={readOnly}
                        onChange={(v) => onCell(i, c.key, v)}
                      />
                    </Td>
                  ))}

                  {/* Computed cells are shaded, so what the instrument showed is never confused
                      with what the engine derived from it. */}
                  {computedColumns.map((c) => (
                    <Td
                      key={c.key}
                      align="right"
                      numeric
                      className={cn(
                        "bg-surface-container-low/50",
                        failed && isVerdictColumn(c) && "font-bold text-error",
                      )}
                    >
                      {formatComputed(res?.[c.key])}
                    </Td>
                  ))}

                  <Td align="center">{res?.verdict ? <Verdict value={res.verdict} /> : null}</Td>
                  <Td align="center">
                    {rows.length > 1 && !readOnly && (
                      <button
                        onClick={() => onRemoveRow(i)}
                        aria-label={`Remove row ${i + 1}`}
                        className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </Td>
                </tr>

                {/* On a multi-interval instrument the permissible error can widen part-way up
                    the range with nothing changing on the display. Announced at the row where it
                    happens rather than footnoted — it is the error a spreadsheet makes. */}
                {res && bandShoulder(results, offset + i) && (
                  <TableCallout
                    colSpan={inputColumns.length + computedColumns.length + 3}
                    icon="swap_vert"
                    title="The partial range changes here"
                  >
                    The permissible error moves from ± {fmtNumber(Number(results![offset + i - 1]!["mpe"]))} to
                    ± {fmtNumber(Number(res["mpe"]))} {unit}. Nothing changes on the display
                    (R 76-1 §3.3).
                  </TableCallout>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TableWrap>

      {!readOnly && (
        <div className="px-5 py-2">
          <Button variant="ghost" size="sm" icon="add" onClick={onAddRow}>
            Add row
          </Button>
        </div>
      )}
    </>
  );
}

/** How many of a table's rows will actually be posted — mirrors `compute`'s own filter. */
function countFilled(rows: FormRow[], table: FormSubformSpec): number {
  const inputs = (table.columns ?? []).filter((c) => c.kind !== "computed");
  return rows.filter((r) => inputs.some((c) => r[c.key] !== undefined && r[c.key] !== "")).length;
}

// ---------------------------------------------------------------------------
// One cell
// ---------------------------------------------------------------------------

/**
 * The control follows the column's declared unit.
 *
 * A significant-fault column is a yes/no on the printed form and gets a checkbox; a load is a
 * number and gets a numeric field; "Location" on the eccentricity form is a position on the
 * receptor and gets free text. Rendering everything as a text box, as the old screen did, made
 * a boolean look like something to be measured.
 */
function CellInput({
  column,
  value,
  readOnly,
  onChange,
}: {
  column: FormColumnSpec;
  value: string | number | boolean | null | undefined;
  readOnly?: boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  // On a closed report the value is printed rather than put in a box: a disabled input still
  // reads as something that was meant to be filled in, and this was.
  if (readOnly) {
    const shown = value === undefined || value === null || value === "" ? "—" : String(value);
    return (
      <span
        className={cn(
          "block px-1 text-body-md text-on-surface",
          column.unit === "boolean"
            ? "text-center"
            : alignOf(column) === "right" && "text-right tabular-nums",
        )}
      >
        {column.unit === "boolean" ? (value === true || value === "true" ? "Yes" : "No") : shown}
      </span>
    );
  }

  if (column.unit === "boolean") {
    return (
      <span className="flex justify-center">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={column.label}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
      </span>
    );
  }

  const numeric = column.unit === "mass" || column.unit === "count" || column.unit === "percent";
  return (
    <Input
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        // A mass/count/percent column is a number on the wire (FormRow allows one) — sending
        // the raw string worked because the server tolerated it, but the client should not
        // depend on that tolerance. Empty stays "" rather than becoming Number("") === 0, which
        // `compute()`'s own filled-row check (row[c.key] !== "") already relies on to tell a
        // blank cell from a real zero.
        onChange(numeric && raw !== "" ? Number(raw) : raw);
      }}
      {...(numeric ? { inputMode: "decimal" as const } : {})}
      aria-label={column.label}
      className={cn("h-9", numeric && "text-right tabular-nums")}
    />
  );
}

/** Mass columns are read in the instrument's unit; the header says so once, not per cell. */
function labelOf(column: FormColumnSpec, unit: string): string {
  return column.unit === "mass" ? `${column.label} (${unit})` : column.label;
}

function alignOf(column: FormColumnSpec): "left" | "right" | "center" {
  if (column.unit === "boolean") return "center";
  if (column.unit === "mass" || column.unit === "count" || column.unit === "percent") return "right";
  return "left";
}

/** Which computed column carries the verdict, so a failed row can point at it. */
function isVerdictColumn(column: FormColumnSpec): boolean {
  return ["correctedError", "deltaP", "difference", "fault", "elMinusE0", "zeroChangePerInterval"]
    .includes(column.key);
}

function formatComputed(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return fmtNumber(value);
  return String(value);
}

/** Did the verification scale interval change between this row and the one above it? */
function bandShoulder(results: (FormRow & { verdict?: string })[] | null, i: number): boolean {
  if (!results || i === 0) return false;
  const here = results[i]?.["mpe"];
  const above = results[i - 1]?.["mpe"];
  return here !== undefined && above !== undefined && here !== above;
}

// ---------------------------------------------------------------------------
// Header values that are not columns
// ---------------------------------------------------------------------------

/**
 * A few forms record a value once, above the table, rather than on every row.
 *
 * Form 10 records "Unloaded / Loaded" against a test load fixed for the whole run; form 14
 * takes its readings near Max. Asking the officer to retype that on every row would be an
 * invitation to a transcription error in a legal document, so it is asked once — which is also
 * how R 76-2 prints it.
 */
function ExtrasRow({
  formId,
  kernel,
  unit,
  extras,
  setExtras,
}: {
  formId: string;
  kernel: string;
  unit: string;
  extras: Record<string, string>;
  setExtras: (fn: (e: Record<string, string>) => Record<string, string>) => void;
}) {
  const needsTestLoad = ["8", "10", "14", "6.1"].includes(formId);
  const needsZeroError = kernel === "K1" && !needsTestLoad;

  if (!needsTestLoad && !needsZeroError) return null;

  return (
    <div className="flex flex-wrap gap-4 border-t border-outline-variant/40 bg-surface-container-lowest px-5 py-3">
      {needsTestLoad && (
        <Field
          label={`Test load (${unit})`}
          hint="Recorded once in the form's header, as the printed form does."
          className="w-56"
        >
          <Input
            value={extras["testLoad"] ?? ""}
            onChange={(e) => setExtras((x) => ({ ...x, testLoad: e.target.value }))}
            inputMode="decimal"
            className="h-9 text-right tabular-nums"
          />
        </Field>
      )}
      {needsZeroError && (
        <Field
          label={`E₀ at or near zero (${unit})`}
          hint="Leave blank to take it from the row recorded at zero load."
          className="w-56"
        >
          <Input
            value={extras["zeroError"] ?? ""}
            onChange={(e) => setExtras((x) => ({ ...x, zeroError: e.target.value }))}
            inputMode="decimal"
            className="h-9 text-right tabular-nums"
          />
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Environmental conditions
// ---------------------------------------------------------------------------

/**
 * Temperature, humidity and pressure at start, at max and at end.
 *
 * R 76-2 prints this header on every environment-sensitive form, and the problem statement
 * names "recording laboratory and environmental conditions" as its own requirement. The
 * renderer has always printed the header; nothing collected the values, so it printed empty.
 *
 * Barometric pressure is only required for class I instruments and for the span-stability test
 * (R 76-2 explanatory notes), so it is asked for only where it is owed rather than everywhere.
 */
function EnvironmentCard({
  spec,
  readings,
  setReadings,
  readOnly,
  classI,
}: {
  spec: FormSpec;
  readings: EnvironmentReading[];
  setReadings: (fn: (r: EnvironmentReading[]) => EnvironmentReading[]) => void;
  /** A recorded form's conditions are the record: printed, not offered for editing. */
  readOnly: boolean;
  classI: boolean;
}) {
  const wantsPressure = Boolean(spec.environmental?.capturesPressure) && (classI || spec.formId === "14");

  function set(i: number, patch: Partial<EnvironmentReading>) {
    setReadings((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  type NumericField = "temperatureC" | "relativeHumidityPct" | "pressureHPa";
  const fields: { key: NumericField; label: string; unit: string; show: boolean }[] = (
    [
      { key: "temperatureC", label: "Temperature", unit: "°C", show: spec.environmental?.capturesTemperature !== false },
      { key: "relativeHumidityPct", label: "Relative humidity", unit: "%", show: spec.environmental?.capturesHumidity !== false },
      { key: "pressureHPa", label: "Barometric pressure", unit: "hPa", show: wantsPressure },
    ] as const
  )
    .filter((f) => f.show)
    .map((f) => ({ ...f }));

  return (
    <Card padded={false}>
      <div className="p-5 pb-2">
        <CardHeader
          icon="thermostat"
          title="Laboratory conditions"
          description="Printed in this form's header on the report."
          action={<Clause>R 76-2 explanatory notes</Clause>}
        />
      </div>
      <TableWrap className="rounded-none border-x-0 border-b-0">
        <thead>
          <tr>
            <Th />
            {readings.map((r) => (
              <Th key={r.checkpoint} align="right">{r.checkpoint}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={String(f.key)}>
              <Td className="text-body-sm text-on-surface-variant">
                {f.label} <span className="text-on-surface-variant">({f.unit})</span>
              </Td>
              {readings.map((r, i) => (
                <Td key={r.checkpoint} align="right" numeric>
                  {readOnly ? (
                    <span className="block text-body-md text-on-surface">
                      {r[f.key] === undefined ? "—" : String(r[f.key])}
                    </span>
                  ) : (
                    <Input
                      value={r[f.key] === undefined ? "" : String(r[f.key])}
                      onChange={(e) =>
                        set(i, { [f.key]: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                      inputMode="decimal"
                      aria-label={`${f.label} ${r.checkpoint}`}
                      className="h-9 text-right tabular-nums"
                    />
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {wantsPressure && (
        <p className="px-5 py-3 text-body-sm text-on-surface-variant">
          Barometric pressure is required here — {spec.formId === "14"
            ? "the span-stability test records it regardless of class"
            : "this is a class I instrument"}.
        </p>
      )}
    </Card>
  );
}
