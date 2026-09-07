/**
 * The Rule 4(9) annual return.
 *
 * Every approved laboratory owes this: models tested, fees realised, and the time taken per
 * test. Today it is a data-gathering exercise, because the underlying facts live in
 * spreadsheets scattered across a lab. Once observations are timestamped events, the same
 * return is a query — the compliance artefact falls out of the data model.
 *
 * The caveats are printed with the figures rather than tucked away. Time per test is measured
 * between the first and last recorded observation for a form, which reflects *recording* time
 * and not bench time; a laboratory that quotes the number without that qualification cannot
 * defend it.
 */

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { fmtDuration } from "../lib/format";

export function StatisticsPage() {
  const { can, session } = useAuth();
  const thisYear = new Date().getUTCFullYear();

  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [scope, setScope] = useState<"lab" | "national">("lab");

  const canNational = can("stats:read_national");

  const stats = useApi(
    (s) => api.rule49({ from, to, ...(scope === "national" && canNational ? { scope: "national" as const } : {}) }, s),
    [from, to, scope, canNational],
  );

  return (
    <>
      <PageHeader
        eyebrow="AoM Rule 4(9)"
        title="Annual return"
        description="Models tested, fees realised and time taken per test — the return every approved laboratory owes, generated from the record rather than assembled by hand."
        actions={
          stats.data ? (
            <Button
              variant="secondary"
              icon="download"
              onClick={() => {
                const blob = new Blob([JSON.stringify(stats.data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `rule-4-9-${from}-to-${to}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </Button>
          ) : null
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field
            label="Scope"
            hint={canNational ? undefined : "The national roll-up is limited to the Director."}
          >
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              disabled={!canNational}
            >
              <option value="lab">{session?.labName ?? "My laboratory"}</option>
              {canNational && <option value="national">All laboratories</option>}
            </Select>
          </Field>
        </div>
      </Card>

      {stats.error ? (
        <ErrorState error={stats.error} onRetry={stats.reload} />
      ) : stats.loading ? (
        <LoadingState label="Building the return…" />
      ) : stats.data ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Models tested" value={stats.data.modelsTested} icon="inventory_2" />
            <Stat label="Approved" value={stats.data.modelsApproved} icon="task_alt" tone="pass" />
            <Stat
              label="Fees realised"
              value={`₹${stats.data.feesRealisedInr.toLocaleString("en-IN")}`}
              icon="payments"
              hint="Rule 19: ₹10,000 mechanical · ₹25,000 digital-electronic"
            />
            <Stat
              label="Median turnaround"
              value={stats.data.medianTurnaroundDays === null ? "—" : `${Math.round(stats.data.medianTurnaroundDays)} d`}
              icon="schedule"
              tone={stats.data.exceededThreeMonths > 0 ? "warn" : "neutral"}
              hint={
                stats.data.exceededThreeMonths > 0
                  ? `${stats.data.exceededThreeMonths} past three months`
                  : undefined
              }
            />
          </div>

          {stats.data.exceededThreeMonths > 0 && (
            <Alert tone="warn" icon="hourglass_top" title="Reports past the three-month mark">
              {stats.data.exceededThreeMonths} report
              {stats.data.exceededThreeMonths === 1 ? "" : "s"} took longer than three months.
              AoM Rule 6(8) allows a provisional certificate in that situation, valid for at
              most one year under Rule 8(7).
            </Alert>
          )}

          <div className="grid gap-5 xl:grid-cols-3">
            <Card padded={false} className="xl:col-span-2">
              <div className="p-5 pb-0">
                <CardHeader
                  icon="timer"
                  title="Time taken per test"
                  description="Derived from the append-only log, per R 76-2 form"
                />
              </div>
              {stats.data.perTest.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="timer_off"
                    title="No tests recorded in this period"
                    description="Time per test is measured between the first and last observation event for a form, so it appears once observations have been recorded."
                  />
                </div>
              ) : (
                <TableWrap className="rounded-t-none border-x-0 border-b-0">
                  <thead>
                    <tr>
                      <Th className="w-20">Form</Th>
                      <Th>Test</Th>
                      <Th align="right">Performed</Th>
                      <Th align="right">Passed</Th>
                      <Th align="right">Failed</Th>
                      <Th align="right">Median</Th>
                      <Th align="right">Mean</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data.perTest.map((t) => (
                      <tr key={t.formId}>
                        <Td className="font-mono text-body-sm">{t.formId}</Td>
                        <Td>{t.testId.replace(/_/g, " ")}</Td>
                        <Td align="right" numeric>{t.timesPerformed}</Td>
                        <Td align="right" numeric className="text-on-success">{t.passed}</Td>
                        <Td align="right" numeric className={t.failed > 0 ? "text-error font-semibold" : ""}>
                          {t.failed}
                        </Td>
                        <Td align="right" numeric>{fmtDuration(t.medianMinutes)}</Td>
                        <Td align="right" numeric>{fmtDuration(t.meanMinutes)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader icon="donut_small" title="By accuracy class" />
                {Object.keys(stats.data.byAccuracyClass).length === 0 ? (
                  <p className="text-body-md text-on-surface-variant">Nothing in this period.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {Object.entries(stats.data.byAccuracyClass)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cls, n]) => {
                        const pct = (n / stats.data!.modelsTested) * 100;
                        return (
                          <li key={cls} className="flex items-center gap-3">
                            <span className="w-16 shrink-0 text-label-md text-on-surface">
                              {cls === "IIII" ? "IIII / IV" : cls}
                            </span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="w-8 shrink-0 text-right text-body-sm tabular-nums text-on-surface-variant">
                              {n}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader icon="info" title="How these were measured" />
                <ul className="flex flex-col gap-2">
                  {stats.data.caveats.map((c, i) => (
                    <li key={i} className="text-body-sm text-on-surface-variant">
                      {c}
                    </li>
                  ))}
                </ul>
                <Badge tone="neutral" className="mt-3">
                  Generated {new Date(stats.data.generatedAt).toLocaleString("en-IN")}
                </Badge>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
