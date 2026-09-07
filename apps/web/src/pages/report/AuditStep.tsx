/**
 * The audit trail.
 *
 * ISO/IEC 17025 §7.8 requires that original observations be recorded when made, and that an
 * amendment be tracked with its date and the person who made it while the original is
 * retained. TulaSetu satisfies that by making the event log the record and the report a
 * projection of it — so this page is not a summary of what happened, it *is* what happened.
 *
 * The chain verification is the part worth understanding. Each event carries a hash over its
 * own content and the previous event's hash. Editing a row behind the application's back does
 * not merely violate a rule — it breaks the chain, and this page names the event where it
 * broke. That is the difference between an audit trail that is enforced and one that is
 * merely promised.
 */

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Icon,
  LoadingState,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useMutation } from "../../lib/useApi";
import { formatDateTime, humanizeEvent } from "../../lib/format";
import { useReport } from "./ReportLayout";

/** Events that record a measurement, as distinct from ones that move the report along. */
const OBSERVATION_EVENTS = new Set(["OBSERVATIONS_RECORDED", "FORM_RESULT_COMPUTED", "PROFILE_UPDATED"]);

export function AuditStep() {
  const { reportId } = useReport();
  const audit = useApi((s) => api.audit(reportId, s), [reportId]);
  const sigs = useApi((s) => api.signatures(reportId, s), [reportId]);

  // The demonstration signer: a key pair is issued once and the private half is held only in
  // this tab, for as long as the page is open. A deployment replaces this with a DSC token —
  // the server never sees a private key either way, which is the property that matters.
  const [demoKey, setDemoKey] = useState<string | null>(null);
  const issueKey = useMutation(api.registerSigningKey);
  const sign = useMutation(api.signReport);

  async function issue() {
    const r = await issueKey.run();
    if (r?.privateKeyPem) setDemoKey(r.privateKeyPem);
  }

  async function doSign() {
    if (!demoKey) return;
    const r = await sign.run(reportId, { privateKeyPem: demoKey });
    if (r) {
      sigs.reload();
      audit.reload();
    }
  }

  if (audit.initialLoading) return <LoadingState label="Reading the log…" />;
  if (audit.error) return <ErrorState error={audit.error} onRetry={audit.reload} />;
  if (!audit.data) return null;

  const { verification, events } = audit.data;
  const first = events[0];
  const last = events[events.length - 1];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Chain"
          value={verification.ok ? "Verified" : "Broken"}
          icon={verification.ok ? "verified_user" : "gpp_bad"}
          tone={verification.ok ? "pass" : "fail"}
          hint={verification.ok ? "Every record is unaltered" : undefined}
        />
        <Stat label="Records" value={verification.eventCount} icon="receipt_long" />
        <Stat
          label="First recorded"
          value={first ? formatDateTime(first.recordedAt).split(",")[0] ?? "—" : "—"}
          icon="schedule"
          hint={last ? `Last ${formatDateTime(last.recordedAt)}` : undefined}
        />
      </div>

      {verification.ok ? (
        <Alert tone="pass" icon="verified_user" title="The chain verifies">
          Every recorded observation hashes to the value stored beside it, and each links to the
          one before. Nothing in this report has been altered since it was written.
        </Alert>
      ) : (
        <Alert tone="fail" icon="gpp_bad" title="The chain does not verify">
          {verification.reason}
          {verification.brokenAtSeq !== undefined && (
            <> The first affected record is sequence {verification.brokenAtSeq}.</>
          )}{" "}
          This report should not be relied on until the cause is established.
        </Alert>
      )}

      {/* Signatures */}
      <Card>
        <CardHeader
          icon="draw"
          title="Digital signatures"
          description="A signature covers the head of the chain, and so the whole history behind it"
          action={
            <div className="flex items-center gap-2">
              {!demoKey && (
                <Button size="sm" variant="secondary" icon="key" loading={issueKey.pending} onClick={issue}>
                  Issue a demonstration key
                </Button>
              )}
              {demoKey && (
                <Button size="sm" variant="primary" icon="draw" loading={sign.pending} onClick={doSign}>
                  Sign this report
                </Button>
              )}
            </div>
          }
        />

        {issueKey.error && <Alert tone="fail" title="Could not issue a key">{issueKey.error}</Alert>}
        {sign.error && <Alert tone="fail" title="Could not sign">{sign.error}</Alert>}

        {demoKey && (
          <div className="mb-4">
            <Alert tone="warn" icon="key" title="A demonstration key, held in this tab only">
              The private half exists in this browser tab and nowhere else — reload and it is
              gone. A deployment signs on a DSC token instead; the server never holds a private
              key in either case. Sections 4 and 5 of the Information Technology Act, 2000 give
              a signature produced by a secure asymmetric process the standing of a handwritten
              one.
            </Alert>
          </div>
        )}

        {sigs.error ? (
          <ErrorState error={sigs.error} onRetry={sigs.reload} />
        ) : sigs.initialLoading ? (
          <LoadingState />
        ) : !sigs.data?.signatures.length ? (
          <p className="text-body-md text-on-surface-variant">
            Not signed. The hash chain already makes the record tamper-evident; a signature adds
            who stands behind it.
          </p>
        ) : (
          <>
            {!sigs.data.trustworthy && (
              <div className="mb-3">
                <Alert tone="fail" icon="gpp_bad" title="These signatures cannot be relied on">
                  {sigs.data.chain.ok
                    ? "At least one signature does not verify under its signer's registered key."
                    : "The chain beneath them does not verify, so a valid signature would still " +
                      "be covering altered data."}
                </Alert>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {sigs.data.signatures.map((s) => (
                <li
                  key={s.signature}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-outline-variant/50 p-3"
                >
                  <Icon
                    name={s.verified ? "verified" : "gpp_bad"}
                    size={18}
                    className={s.verified ? "text-on-success" : "text-error"}
                  />
                  <span className="text-label-lg text-on-surface">{s.actorName}</span>
                  <Badge tone="neutral">{s.role}</Badge>
                  <span className="text-body-sm text-on-surface-variant">
                    record {s.eventVersion} · {formatDateTime(s.recordedAt)}
                  </span>
                  <Badge tone={s.verified ? "pass" : "fail"}>
                    {s.verified ? "verifies" : "does not verify"}
                  </Badge>
                  {s.reason && (
                    <span className="w-full text-body-sm text-error">{s.reason}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            icon="history"
            title="Every record, in order"
            description="Append-only. A correction is a new entry; the original stays."
          />
        </div>
        <TableWrap className="rounded-t-none border-x-0 border-b-0">
          <thead>
            <tr>
              <Th className="w-14">#</Th>
              <Th>Event</Th>
              <Th>Recorded by</Th>
              <Th>When</Th>
              <Th>Detail</Th>
              <Th align="right">Hash</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.version} className="align-top">
                <Td numeric className="text-on-surface-variant">{e.version}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <Icon
                      name={OBSERVATION_EVENTS.has(e.eventType) ? "science" : "arrow_forward"}
                      size={15}
                      className="text-on-surface-variant"
                    />
                    <span className="text-label-md text-on-surface">{humanizeEvent(e.eventType)}</span>
                  </span>
                  {OBSERVATION_EVENTS.has(e.eventType) && (
                    <Badge tone="info" className="mt-1">measurement record</Badge>
                  )}
                </Td>
                <Td className="font-mono text-body-sm">{e.actorId}</Td>
                <Td className="text-body-sm text-on-surface-variant whitespace-nowrap">
                  {formatDateTime(e.recordedAt)}
                </Td>
                <Td className="text-body-sm text-on-surface-variant">{summarize(e.payload)}</Td>
                <Td align="right">
                  <code className="font-mono text-label-sm text-on-surface-variant" title={e.hash}>
                    {e.hash.slice(0, 10)}…
                  </code>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader icon="policy" title="Why it is built this way" />
        <p className="text-body-md text-on-surface-variant">
          The log is the record and the report is derived from it, rather than the report being
          the record with an audit table alongside. A parallel audit table can drift from the
          data it describes; a projection cannot. It also means a bug in how results are derived
          can be fixed and history replayed — the observations themselves were never at risk.
        </p>
        <p className="text-body-md text-on-surface-variant mt-2.5">
          The database refuses <code className="font-mono text-body-sm">UPDATE</code> and{" "}
          <code className="font-mono text-body-sm">DELETE</code> on the log outright. The hash
          chain covers the case that rule cannot: someone with the file itself.
        </p>
      </Card>
    </div>
  );
}

/** One line describing an event, without dumping its whole payload. */
function summarize(payload: Record<string, unknown>): string {
  if (typeof payload["formId"] === "string") {
    const parts = [`form ${payload["formId"]}`];
    const obs = payload["observations"];
    if (Array.isArray(obs)) parts.push(`${obs.length} reading${obs.length === 1 ? "" : "s"}`);
    if (typeof payload["verdict"] === "string") parts.push(String(payload["verdict"]));
    return parts.join(" · ");
  }
  if (payload["profile"] && typeof payload["profile"] === "object") {
    const p = payload["profile"] as { model?: string; accuracyClass?: string };
    return [p.model, p.accuracyClass ? `class ${p.accuracyClass}` : null].filter(Boolean).join(" · ") || "profile recorded";
  }
  if (Array.isArray(payload["tests"])) return `${(payload["tests"] as unknown[]).length} forms resolved`;
  if (typeof payload["basis"] === "string") return payload["basis"];
  if (typeof payload["text"] === "string") return payload["text"];
  if (typeof payload["pdfSha256"] === "string") return `record copy ${String(payload["pdfSha256"]).slice(0, 12)}…`;
  return "—";
}
