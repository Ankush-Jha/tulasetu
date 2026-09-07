/**
 * Dashboard.
 *
 * Answers the two questions an officer opens the application with: what is on my bench, and
 * what needs me. Everything here is read from the server — the counts, the recent reports, the
 * statutory return — because a dashboard with invented numbers is worse than no dashboard.
 */

import { useMemo } from "react";
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
import { useApi, useMutation } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { reportPath } from "../lib/nav";
import { formatDate } from "../lib/format";

export function DashboardPage() {
  const { session, can } = useAuth();
  const seed = useMutation(api.seedDemoData);

  const counts = useApi((s) => api.dashboard(s), []);
  const recent = useApi((s) => api.listReports({ limit: 8 }, s), []);
  const year = new Date().getUTCFullYear();
  const stats = useApi(
    (s) => api.rule49({ from: `${year}-01-01`, to: `${year}-12-31` }, s),
    [year],
    { enabled: can("stats:read_own_lab") },
  );

  const lifecycle = useApi((s) => api.lifecycle(s), []);

  /**
   * Which reports this officer can actually move forward.
   *
   * A dashboard's job is to answer "what needs me", and that depends on the role: a
   * Metrological Assistant's queue is drafts and returned reports, an Assistant Director's is
   * submissions awaiting review, the Director's is recommendations awaiting a decision. The
   * states are read off the lifecycle table the server publishes, so this cannot drift from
   * what the server will actually permit.
   */
  const actionable = useMemo(() => {
    if (!recent.data || !lifecycle.data || !session) return [];
    const mine = new Set(
      lifecycle.data.transitions
        .filter((t) => t.roles.includes(session.role))
        .map((t) => t.from),
    );
    return recent.data.filter((r) => mine.has(r.status));
  }, [recent.data, lifecycle.data, session]);

  async function loadDemo() {
    const r = await seed.run();
    if (r) {
      counts.reload();
      recent.reload();
      stats.reload();
    }
  }

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

      {seed.error && (
        <div className="mb-4">
          <Alert tone="fail" title="Could not load the demonstration data">{seed.error}</Alert>
        </div>
      )}

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
              title="Nothing recorded yet"
              description="Load five demonstration reports to see the repository, the statistics and the approval chain with something in them — or start one from scratch."
              action={
                can("report:create") ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="primary" icon="auto_awesome" loading={seed.pending} onClick={loadDemo}>
                      Load demonstration data
                    </Button>
                    <Link to="/reports/new">
                      <Button variant="secondary" icon="add">Start one from scratch</Button>
                    </Link>
                  </div>
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
            <CardHeader
              icon="pending_actions"
              title="Waiting on you"
              description="Reports in a state your role can move"
            />
            {actionable.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nothing is waiting on you.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {actionable.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <Link
                      to={reportPath(r.id)}
                      className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-container-low"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-label-md text-on-surface">
                          {r.model ?? r.id}
                        </span>
                        <span className="block truncate text-body-sm text-on-surface-variant">
                          {r.manufacturer ?? "—"}
                        </span>
                      </span>
                      <StatusChip status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
