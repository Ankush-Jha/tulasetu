/**
 * Dashboard.
 *
 * Answers the two questions an officer opens the application with: what is on my bench, and
 * what needs me. Everything here is read from the server — the counts, the recent reports, the
 * statutory return — because a dashboard with invented numbers is worse than no dashboard.
 */

import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  Skeleton,
  Stat,
  StatusChip,
  TableWrap,
  Td,
  Th,
  Verdict,
} from "../components/ui";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { reportPath } from "../lib/nav";
import { formatDate } from "../lib/format";

export function DashboardPage() {
  const { session, can } = useAuth();

  const counts = useApi((s) => api.dashboard(s), []);
  const recent = useApi((s) => api.listReports({ limit: 8 }, s), []);
  const year = new Date().getUTCFullYear();
  const stats = useApi(
    (s) => api.rule49({ from: `${year}-01-01`, to: `${year}-12-31` }, s),
    [year],
    { enabled: can("stats:read_own_lab") },
  );

  return (
    <>
      <PageHeader
        eyebrow={session ? `${session.roleLabel} · ${session.labName}` : undefined}
        title={`Good day, ${session?.displayName ?? "officer"}`}
        description="Model approval testing under OIML R 76 and the Seventh Schedule, Heading A."
        actions={
          can("report:create") ? (
            <Button variant="primary" icon="add" onClick={() => (window.location.href = "/reports/new")}>
              New report
            </Button>
          ) : null
        }
      />

      {/* Counts */}
      {counts.error ? (
        <ErrorState error={counts.error} onRetry={counts.reload} />
      ) : counts.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : counts.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="In process" value={counts.data.inProcess} icon="pending_actions" tone="info" />
          <Stat label="Completed" value={counts.data.completed} icon="task_alt" tone="pass" />
          <Stat
            label="With deficiency"
            value={counts.data.withDeficiency}
            icon="report"
            tone={counts.data.withDeficiency > 0 ? "fail" : "neutral"}
          />
          <Stat label="Total reports" value={counts.data.total} icon="folder_open" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Recent reports */}
        <Card className="xl:col-span-2">
          <CardHeader
            icon="folder_open"
            title="Recent reports"
            description="Most recently created in your laboratory"
            action={
              <Button size="sm" variant="ghost" icon="arrow_forward" onClick={() => (window.location.href = "/reports")}>
                All reports
              </Button>
            }
          />
          {recent.error ? (
            <ErrorState error={recent.error} onRetry={recent.reload} />
          ) : recent.loading ? (
            <LoadingState />
          ) : !recent.data?.length ? (
            <EmptyState
              icon="folder_off"
              title="No reports yet"
              description="A report begins with the instrument profile — the accuracy class and weighing ranges are what let the engine resolve permissible errors."
              action={
                can("report:create") ? (
                  <Link to="/reports/new">
                    <Button variant="primary" icon="add">Create the first report</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Report</Th>
                  <Th>Instrument</Th>
                  <Th>Class</Th>
                  <Th>Status</Th>
                  <Th>Result</Th>
                  <Th align="right">Created</Th>
                </tr>
              </thead>
              <tbody>
                {recent.data.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-container-low/60">
                    <Td>
                      <Link
                        to={reportPath(r.id)}
                        className="font-mono text-body-sm font-semibold text-primary hover:underline"
                      >
                        {r.id}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-on-surface">{r.model ?? "—"}</span>
                      <span className="block text-body-sm text-on-surface-variant">{r.manufacturer ?? "—"}</span>
                    </Td>
                    <Td>{r.accuracy_class ?? "—"}</Td>
                    <Td><StatusChip status={r.status} /></Td>
                    <Td><Verdict value={r.overall_verdict} /></Td>
                    <Td align="right" numeric className="text-on-surface-variant text-body-sm">
                      {formatDate(r.created_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        {/* Rule 4(9) */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              icon="monitoring"
              title={`Rule 4(9) return · ${year}`}
              description="The annual return every approved laboratory owes"
            />
            {!can("stats:read_own_lab") ? (
              <p className="text-body-md text-on-surface-variant">
                Your role does not include laboratory statistics.
              </p>
            ) : stats.error ? (
              <ErrorState error={stats.error} onRetry={stats.reload} />
            ) : stats.loading ? (
              <LoadingState />
            ) : stats.data ? (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  <MiniStat label="Models tested" value={stats.data.modelsTested} />
                  <MiniStat label="Approved" value={stats.data.modelsApproved} />
                  <MiniStat
                    label="Fees realised"
                    value={`₹${stats.data.feesRealisedInr.toLocaleString("en-IN")}`}
                  />
                  <MiniStat
                    label="Median turnaround"
                    value={
                      stats.data.medianTurnaroundDays === null
                        ? "—"
                        : `${Math.round(stats.data.medianTurnaroundDays)} d`
                    }
                  />
                </dl>
                {stats.data.exceededThreeMonths > 0 && (
                  <Alert tone="warn" icon="schedule" title="Past three months">
                    {stats.data.exceededThreeMonths} report
                    {stats.data.exceededThreeMonths === 1 ? "" : "s"} ran beyond three months.
                    Rule 6(8) allows a provisional certificate in that case.
                  </Alert>
                )}
                <Link to="/statistics" className="mt-4 inline-block">
                  <Button size="sm" variant="secondary" icon="arrow_forward">Full return</Button>
                </Link>
              </>
            ) : null}
          </Card>

          <Card>
            <CardHeader icon="verified" title="How this differs" />
            <ul className="flex flex-col gap-2.5">
              {[
                ["calculate", "The report is computed, not typed. 17 forms reduce to five calculation kernels plus four special cases."],
                ["trending_up", "Permissible-error bands follow the load. On a multi-interval instrument the limit can loosen mid-range — the error a spreadsheet makes."],
                ["policy", "The standard is data. Thresholds and clause references live in versioned rule packs, not in code."],
                ["lock", "Observations are append-only and hash-chained, per ISO/IEC 17025 §7.8."],
              ].map(([icon, text]) => (
                <li key={text} className="flex gap-2.5">
                  <Icon name={icon!} size={18} className="mt-0.5 shrink-0 text-primary" />
                  <span className="text-body-md text-on-surface-variant">{text}</span>
                </li>
              ))}
            </ul>
            <Badge tone="info" icon="psychology_alt" className="mt-4">
              No machine learning in the calculation path
            </Badge>
          </Card>
        </div>
      </div>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-outline-variant/50 p-3">
      <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</dt>
      <dd className="text-headline-sm text-on-surface tabular-nums mt-0.5">{value}</dd>
    </div>
  );
}
