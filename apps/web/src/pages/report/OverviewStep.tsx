/**
 * What has happened to this report, and what happens next.
 *
 * This is where a report opens now, and it exists because the application had one answer for
 * every report regardless of its state: a data-entry wizard. A report that had been recorded,
 * validated, submitted, reviewed, signed by three officers, locked, certificated and published
 * opened on an editable form with a "Save and resolve tests" button — an action the server
 * would refuse, on a document that is the record copy under ISO/IEC 17025 §7.8.
 *
 * It was wrong for the reviewer too. An Assistant Director opening a submitted report does not
 * want a bench form; they want the verdict, the failures, the deficiencies already raised, and
 * the two decisions open to them. A Director wants to know it has been reviewed and signed.
 *
 * So the page answers three questions in the order they are actually asked: where is this
 * report, what does it say, and what can *I* do about it. The steps beneath remain reachable —
 * a reviewer reads the observations — but they are the detail, not the front door.
 */

import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  Icon,
  Stat,
  StatusChip,
  Verdict,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api } from "../../lib/api";
import { useMutation } from "../../lib/useApi";
import { REPORT_STEPS, reportPath } from "../../lib/nav";
import { formatDate, formatDateTime } from "../../lib/format";
import { useReport } from "./ReportLayout";

/**
 * What each state means, and what is owed next — in the words an officer would use rather than
 * the state machine's own.
 *
 * `owed` names the role the report is waiting on. A report is almost always waiting on somebody,
 * and "who" is the first thing anyone wants to know when they open one.
 */
const STATES: Record<string, { meaning: string; owed?: string; tone: "info" | "warn" | "pass" | "fail" }> = {
  DRAFT: {
    meaning: "Bench work is in progress. Observations can still be recorded and amended.",
    owed: "the Metrological Assistant",
    tone: "info",
  },
  OBSERVATIONS_COMPLETE: {
    meaning: "Every applicable form carries a verdict. Validation has not been run yet.",
    owed: "the Metrological Assistant",
    tone: "info",
  },
  VALIDATED: {
    meaning: "Validation is clean. The report is ready to go up for review.",
    owed: "the Metrological Assistant",
    tone: "info",
  },
  SUBMITTED: {
    meaning: "With the Assistant or Deputy Director for verification under AoM Rule 8.",
    owed: "the AD / DD",
    tone: "info",
  },
  DEFICIENCY: {
    meaning:
      "The reviewing officer recorded a deficiency and returned the report. It goes back to " +
      "the laboratory for correction before it can be recommended.",
    owed: "the AD / DD, to return it to the lab",
    tone: "warn",
  },
  RECOMMENDED: {
    meaning: "Verified by the AD / DD and recommended to the Director (Legal Metrology).",
    owed: "the Director",
    tone: "info",
  },
  REMITTED: {
    meaning:
      "The Director remitted the report back for further tests, as AoM Rule 8 permits. It " +
      "returns to the laboratory.",
    owed: "the Metrological Assistant",
    tone: "warn",
  },
  PROVISIONAL: {
    meaning:
      "A provisional certificate was issued under AoM Rule 6(8), valid for not more than one " +
      "year while testing continues.",
    owed: "the Director",
    tone: "warn",
  },
  LOCKED: {
    meaning:
      "The record copy is rendered and its hash is in the audit trail. Nothing can be amended; " +
      "a correction is a new revision.",
    owed: "the Director",
    tone: "pass",
  },
  CERTIFICATE_ISSUED: {
    meaning: "A certificate of approval has been issued under AoM Rule 11.",
    owed: "the Director, to publish it",
    tone: "pass",
  },
  PUBLISHED: {
    meaning:
      "The certificate is published under AoM Rule 11(4). The report and the drawings behind " +
      "it are not open to public inspection (Rule 16(2)).",
    tone: "pass",
  },
  WITHDRAWN: {
    meaning: "Approval was revoked under AoM Rule 13(1)(e).",
    tone: "fail",
  },
};

export function OverviewStep() {
  const { detail, reportId, reload, instrument } = useReport();
  const { report, forms, available, guards, writable, signatures, deficiencies } = detail;

  const transition = useMutation(api.transition);

  const applicable = forms.filter((f) => f.applicable === 1);
  const recorded = applicable.filter((f) => f.verdict);
  const failed = applicable.filter((f) => f.verdict === "FAILED");
  const openDeficiencies = deficiencies.filter((d) => !d.resolvedAt);
  const state = STATES[report.status] ?? { meaning: report.status, tone: "info" as const };

  async function move(to: string) {
    const ok = await transition.run(reportId, { to });
    if (ok) reload();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Where the report is, and who it is waiting on. */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <StatusChip status={report.status} />
              <Verdict value={report.overall_verdict} />
              {!writable.allowed && (
                <Badge tone="neutral" icon="lock">Read-only</Badge>
              )}
            </div>
            <p className="max-w-2xl text-body-md text-on-surface">{state.meaning}</p>
            {state.owed && (
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Waiting on <span className="font-semibold text-on-surface">{state.owed}</span>.
              </p>
            )}
          </div>

          {/* The moves this officer can actually take, which is not the same as the moves
              that exist. An action nobody can take is not worth a button. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {available.length === 0 ? (
              <span className="rounded-full bg-surface-container-low px-3 py-1.5 text-body-sm text-on-surface-variant">
                No action for your role
              </span>
            ) : (
              available.map((t) => (
                <Button
                  key={`${t.from}-${t.to}`}
                  variant={t.to === "LOCKED" || t.to === "PUBLISHED" ? "primary" : "secondary"}
                  loading={transition.pending}
                  onClick={() => move(t.to)}
                  title={t.basis}
                >
                  {t.label}
                </Button>
              ))
            )}
          </div>
        </div>

        {transition.error && (
          <div className="mt-3">
            <Alert tone="fail" title="That step is not available yet">{transition.error}</Alert>
          </div>
        )}

        {/* Why a move is not offered. The state machine knows; silence would make the officer
            guess, which is the question "why is that button not there". */}
        {available.some((t) => (t.requires ?? []).some((g) => !guards.includes(g))) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {available.flatMap((t) =>
              (t.requires ?? [])
                .filter((g) => !guards.includes(g))
                .map((g) => (
                  <Badge key={`${t.to}-${g}`} tone="warn" icon="pending">
                    {describeGuard(g)} — still outstanding
                  </Badge>
                )),
            )}
          </div>
        )}
      </Card>

      {/* What the report says. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            icon="fact_check"
            title="Result"
            description={`${recorded.length} of ${applicable.length} applicable forms recorded`}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Forms applicable" value={String(applicable.length)} />
            <Stat label="Recorded" value={`${recorded.length}`} />
            <Stat
              label="Failed"
              value={String(failed.length)}
              tone={failed.length > 0 ? "fail" : "pass"}
            />
          </div>

          {failed.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-label-md text-on-surface">
                {failed.length} form{failed.length === 1 ? "" : "s"} outside the permissible limits
              </p>
              <div className="flex flex-wrap gap-1.5">
                {failed.map((f) => (
                  <Link
                    key={f.form_id}
                    to={`${reportPath(reportId, "observations")}?form=${encodeURIComponent(f.form_id)}`}
                  >
                    <Badge tone="fail" className="font-mono">{f.form_id}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {instrument && (
            <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-outline-variant/40 pt-3 sm:grid-cols-2">
              {[
                ["Manufacturer", instrument.manufacturer ?? "—"],
                ["Model", instrument.model ?? "—"],
                ["Accuracy class", `Class ${instrument.accuracyClass}`],
                ["Serial number", instrument.serialNumber ?? "—"],
                ["Max", `${instrument.ranges.map((r) => r.max).join(" / ")} ${instrument.unit}`],
                ["Scale interval e", `${instrument.ranges.map((r) => r.e).join(" / ")} ${instrument.unit}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-outline-variant/20 py-1">
                  <dt className="text-body-sm text-on-surface-variant">{k}</dt>
                  <dd className="text-body-sm text-on-surface text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        {/* Who has put their name to it. */}
        <Card>
          <CardHeader icon="verified_user" title="Signatures" description="Re-verified when this page loaded" />
          {signatures.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">
              Nobody has signed this report yet. A signature covers the whole event chain behind
              it, so it is taken at submission and at each review.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {signatures.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Icon
                    name={s.verified ? "verified" : "gpp_bad"}
                    size={17}
                    className={cn("mt-0.5 shrink-0", s.verified ? "text-on-success" : "text-error")}
                  />
                  <span className="min-w-0">
                    <span className="block text-label-md text-on-surface">{s.actorName}</span>
                    <span className="block text-body-sm text-on-surface-variant">
                      {s.role} · {formatDateTime(s.recordedAt)}
                    </span>
                    {!s.verified && (
                      <span className="block text-body-sm text-error">
                        Does not verify{s.reason ? ` — ${s.reason}` : ""}
                      </span>
                    )}
                    {/* A renewed DSC is ordinary; it is worth stating, not worth alarming
                        about. The signature was checked against the key that made it. */}
                    {s.verified && s.keyRotated && (
                      <span className="block text-body-sm text-on-surface-variant">
                        Signed under a key since replaced — verified against the key that made it.
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {report.locked_hash && (
            <div className="mt-4 border-t border-outline-variant/40 pt-3">
              <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                Record copy
              </p>
              <code className="mt-1 block break-all font-mono text-body-sm text-on-surface">
                {report.locked_hash}
              </code>
            </div>
          )}
        </Card>
      </div>

      {/* Deficiencies: what a reviewing officer said, and whether it was answered. */}
      {deficiencies.length > 0 && (
        <Card>
          <CardHeader
            icon="report_problem"
            title="Deficiencies"
            description={
              openDeficiencies.length > 0
                ? `${openDeficiencies.length} open — the report cannot be recommended until they are closed`
                : "All closed"
            }
            action={<Clause>AoM Rule 8</Clause>}
          />
          <ul className="flex flex-col gap-3">
            {deficiencies.map((d) => (
              <li
                key={d.id}
                className={cn(
                  "rounded-xl border p-3.5",
                  d.resolvedAt ? "border-outline-variant/50" : "border-error/40 bg-error-container/20",
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={d.resolvedAt ? "neutral" : "fail"}>
                    {d.resolvedAt ? "Closed" : d.severity}
                  </Badge>
                  {d.formId && <Badge tone="neutral" className="font-mono">Form {d.formId}</Badge>}
                  <span className="text-body-sm text-on-surface-variant">
                    {d.raisedBy} · {formatDate(d.raisedAt)}
                  </span>
                </div>
                <p className="text-body-md text-on-surface">{d.text}</p>
                {d.resolution && (
                  <p className="mt-1.5 border-l-2 border-outline-variant pl-2.5 text-body-sm text-on-surface-variant">
                    <span className="font-semibold">Answered:</span> {d.resolution}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* The detail, for whoever wants it. Read-only where the report is. */}
      <Card>
        <CardHeader
          icon="list_alt"
          title={writable.allowed ? "Continue the report" : "Read the report"}
          description={
            writable.allowed
              ? "Each section, in the order the data depends on it"
              : "Nothing here can be changed — the sections are open for reading"
          }
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_STEPS.filter((s) => s.slug !== "overview").map((s) => (
            <Link
              key={s.slug}
              to={reportPath(reportId, s.slug)}
              className="flex items-center gap-3 rounded-xl border border-outline-variant/50 p-3 transition-colors hover:bg-surface-container-low"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant">
                <Icon name={s.icon} size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-label-md text-on-surface">{s.label}</span>
                <span className="block truncate text-body-sm text-on-surface-variant">{s.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** The server's guard names, in words an officer would use. */
function describeGuard(guard: string): string {
  switch (guard) {
    case "all_applicable_forms_complete": return "Every applicable form recorded";
    case "no_blocking_validation_issues": return "Validation clean";
    case "all_deficiencies_resolved": return "Deficiencies closed";
    case "final_pdf_rendered": return "Record copy rendered";
    default: return guard;
  }
}
