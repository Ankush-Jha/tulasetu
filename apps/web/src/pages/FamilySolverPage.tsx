/**
 * Family / EUT solver.
 *
 * Given a family of variants, R 76-1 §3.10.4 says which of them must physically be tested and
 * which the approval covers untested. The answer is not a matter of judgement — it is an
 * algorithm — and the output is the clause the certificate itself carries: twelve of sixteen
 * sampled Indian certificates contain a "shall also cover…" paragraph of exactly this kind.
 *
 * The subtlety worth watching in the results: a variant can be required as an EUT not because
 * of anything about *itself* but because of a gap it is needed to bridge. In the standard's
 * own Table 8, variant 2.4 must be tested only because 2.5 cannot be reached from 2.1 (the
 * capacity ratio is 40, and the limit is 10). So the selection cannot be made variant by
 * variant, and a solver that tries will get Table 8 wrong.
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
  Icon,
  Input,
  PageHeader,
  Select,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { cn } from "../lib/cn";
import { ApiError, type FamilyResult, type FamilyVariant } from "../lib/api";
import { useMutation } from "../lib/useApi";
import { fmtNumber } from "../lib/format";

type Row = { id: string; family: string; accuracyClass: string; max: string; e: string; d: string; n: string };

/** R 76-1 Table 8 — eight variants in two families. Expected EUT set: 1.2, 2.1, 2.4. */
const TABLE_8: Row[] = [
  { id: "1.1", family: "1", accuracyClass: "II", max: "200", e: "0.01", d: "0.001", n: "20000" },
  { id: "1.2", family: "1", accuracyClass: "II", max: "400", e: "0.01", d: "0.001", n: "40000" },
  { id: "1.3", family: "1", accuracyClass: "II", max: "2000", e: "0.05", d: "0.05", n: "40000" },
  { id: "2.1", family: "2", accuracyClass: "III", max: "1500", e: "0.5", d: "0.5", n: "3000" },
  { id: "2.2", family: "2", accuracyClass: "III", max: "3000", e: "1", d: "1", n: "3000" },
  { id: "2.3", family: "2", accuracyClass: "III", max: "5000", e: "2", d: "2", n: "2500" },
  { id: "2.4", family: "2", accuracyClass: "III", max: "15000", e: "5", d: "5", n: "3000" },
  { id: "2.5", family: "2", accuracyClass: "III", max: "60000", e: "20", d: "20", n: "3000" },
];

const BLANK: Row = { id: "", family: "1", accuracyClass: "III", max: "", e: "", d: "", n: "" };

async function solve(variants: FamilyVariant[]): Promise<FamilyResult> {
  const res = await fetch("/api/tools/family", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.getItem("taraazu.userId")
        ? { "X-User-Id": localStorage.getItem("taraazu.userId")! }
        : {}),
    },
    body: JSON.stringify({ variants }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "UNKNOWN", body?.message ?? "Solver failed.");
  return body as FamilyResult;
}

export function FamilySolverPage() {
  const [rows, setRows] = useState<Row[]>(TABLE_8.map((r) => ({ ...r })));
  const [result, setResult] = useState<FamilyResult | null>(null);
  const run = useMutation(solve);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const variants: FamilyVariant[] = rows
      .filter((r) => r.id && r.max && r.e)
      .map((r) => ({
        id: r.id,
        family: r.family,
        accuracyClass: r.accuracyClass,
        max: Number(r.max),
        e: Number(r.e),
        d: Number(r.d || r.e),
        ...(r.n ? { n: Number(r.n) } : {}),
        unit: "g" as const,
      }));
    const out = await run.run(variants);
    if (out) setResult(out);
  }

  const euts = result?.selections.filter((s) => s.eut) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="R 76-1 §3.10.4"
        title="Family / EUT solver"
        description="Given a family of variants, decide the minimum set that must physically be tested — and generate the coverage clause the certificate carries."
        actions={
          <>
            <Button variant="ghost" icon="science" onClick={() => { setRows(TABLE_8.map((r) => ({ ...r }))); setResult(null); }}>
              Load Table 8
            </Button>
            <Button variant="primary" icon="play_arrow" loading={run.pending} onClick={submit}>
              Solve
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-5">
        {/*
          `min-w-0` overrides a grid item's default `min-width: auto` — without it, the
          variants table's own minimum content width (now that its inputs carry a real
          `min-width`, V-03) became the grid column's minimum, and the whole page grew wider
          than the viewport instead of the table scrolling inside TableWrap's own
          `overflow-x-auto`. This is what keeps that scroll contained to the card, at 390px and
          everywhere narrower than the table itself.
        */}
        <Card padded={false} className="min-w-0 xl:col-span-3">
          <div className="p-5 pb-3">
            <CardHeader
              icon="table_rows"
              title="Variants"
              description="Masses in grams. n is derived from Max / e when left blank."
            />
          </div>
          <TableWrap className="rounded-none border-x-0">
            <thead>
              <tr>
                <Th className="w-20">Variant</Th>
                <Th className="w-16">Family</Th>
                <Th className="w-20">Class</Th>
                <Th align="right">Max</Th>
                <Th align="right">e</Th>
                <Th align="right">d</Th>
                <Th align="right">n</Th>
                <Th className="w-10"></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const selection = result?.selections.find((s) => s.variant.id === r.id);
                return (
                  <tr key={i} className={cn(selection?.eut && "bg-success-container/30")}>
                    <Td>
                      <Input value={r.id} onChange={(e) => setRow(i, { id: e.target.value })} className="h-9 min-w-[64px] font-mono" />
                    </Td>
                    <Td>
                      <Input value={r.family} onChange={(e) => setRow(i, { family: e.target.value })} className="h-9 min-w-[56px]" />
                    </Td>
                    <Td>
                      <Select
                        value={r.accuracyClass}
                        onChange={(e) => setRow(i, { accuracyClass: e.target.value })}
                        className="h-9 min-w-[72px]"
                      >
                        <option value="I">I</option>
                        <option value="II">II</option>
                        <option value="III">III</option>
                        <option value="IIII">IIII</option>
                      </Select>
                    </Td>
                    {/*
                      Mass columns need room for a five-digit Max (R 76-1's own Table 8 goes to
                      60000) as well as a three-decimal e or d — at 390px an unconstrained input
                      shrank to 26px, under the readable floor, with the table quietly cropping
                      the value inside a box too narrow to show it (V-03). A minimum width forces
                      the table to overflow honestly into TableWrap's own horizontal scroll
                      instead of cramming digits nobody could read.
                    */}
                    <Td><Input value={r.max} onChange={(e) => setRow(i, { max: e.target.value })} className="h-9 min-w-[76px] text-right tabular-nums" inputMode="decimal" /></Td>
                    <Td><Input value={r.e} onChange={(e) => setRow(i, { e: e.target.value })} className="h-9 min-w-[76px] text-right tabular-nums" inputMode="decimal" /></Td>
                    <Td><Input value={r.d} onChange={(e) => setRow(i, { d: e.target.value })} className="h-9 min-w-[76px] text-right tabular-nums" inputMode="decimal" /></Td>
                    <Td><Input value={r.n} onChange={(e) => setRow(i, { n: e.target.value })} className="h-9 min-w-[76px] text-right tabular-nums" inputMode="decimal" /></Td>
                    <Td align="center">
                      <button
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                        aria-label={`Remove variant ${r.id || i + 1}`}
                        className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <div className="p-5">
            <Button variant="secondary" icon="add" onClick={() => setRows((rs) => [...rs, { ...BLANK }])}>
              Add variant
            </Button>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          {run.error && <Alert tone="fail" title="Solver failed">{run.error}</Alert>}

          {!result ? (
            <Card>
              <EmptyState
                icon="account_tree"
                title="No result yet"
                description="Table 8 from the standard is loaded. Press Solve — the expected answer is that only 1.2, 2.1 and 2.4 need testing."
              />
            </Card>
          ) : (
            <>
              <Card elevation="raised">
                <CardHeader
                  icon="task_alt"
                  title={`Test ${euts.length} of ${result.selections.length}`}
                  description="Equipment under test"
                />
                <div className="flex flex-wrap gap-1.5">
                  {euts.map((s) => (
                    <Badge key={s.variant.id} tone="pass" icon="science">{s.variant.id}</Badge>
                  ))}
                </div>
                <p className="text-body-sm text-on-surface-variant mt-3">
                  The remaining {result.selections.length - euts.length} variant
                  {result.selections.length - euts.length === 1 ? " is" : "s are"} covered without
                  testing under <Clause>§3.10.4.3</Clause>.
                </p>
              </Card>

              <Card>
                <CardHeader icon="gavel" title="Coverage clause" description="Generated — this is what the certificate carries" />
                <blockquote className="rounded-xl border-l-[3px] border-primary bg-surface-container-low/60 p-3.5 text-body-md italic text-on-surface">
                  {result.coverageClause}
                </blockquote>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="content_copy"
                  className="mt-3"
                  onClick={() => navigator.clipboard?.writeText(result.coverageClause)}
                >
                  Copy
                </Button>
              </Card>

              <Card>
                <CardHeader icon="rule" title="Why each variant" />
                <ul className="flex flex-col gap-2.5">
                  {result.selections.map((s) => (
                    <li key={s.variant.id} className="flex gap-2.5">
                      <Badge tone={s.eut ? "pass" : "neutral"} className="shrink-0 font-mono">
                        {s.variant.id}
                      </Badge>
                      <span className="min-w-0">
                        <span className="block text-body-sm text-on-surface-variant">{s.justification}</span>
                        {s.clause && <Clause>{s.clause}</Clause>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              {result.issues.length > 0 && (
                <Card>
                  <CardHeader icon="info" title="Notes from the solver" />
                  <ul className="flex flex-col gap-1.5">
                    {result.issues.map((i, idx) => (
                      <li key={idx} className="text-body-sm text-on-surface-variant">
                        <Badge tone="neutral" className="mr-1.5 font-mono">{i.code}</Badge>
                        {i.message}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
