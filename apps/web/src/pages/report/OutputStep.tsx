/**
 * Report output.
 *
 * Three formats from one computed document, so they cannot disagree: a PDF as the record copy,
 * a DOCX for the AD/DD review cycle, and JSON for machines with the PDF embedded inside it.
 *
 * The DOCX distinction is the one that matters. An editable file cannot be the record copy —
 * whatever is typed into it sits outside the append-only log, and therefore outside ISO/IEC
 * 17025 §7.8. So the DOCX is watermarked DRAFT and names the locked PDF's hash, and the PDF is
 * what gets signed.
 *
 * Locking renders and locks in a single call. Doing them separately would leave a window in
 * which the report could change between the two, and the hash recorded would then belong to a
 * document nobody holds.
 */

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  Icon,
  KeyValue,
  Stat,
  Verdict,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api } from "../../lib/api";
import { useMutation } from "../../lib/useApi";
import { formatDateTime } from "../../lib/format";
import { useReport } from "./ReportLayout";

type Format = "pdf" | "docx" | "json" | "html";

const OUTPUTS: { id: Format; icon: string; title: string; blurb: string; note: string }[] = [
  {
    id: "pdf",
    icon: "picture_as_pdf",
    title: "PDF — record copy",
    blurb:
      "Pixel-faithful to R 76-2: the same page furniture, the ↓/↑ sub-columns for the two directions of loading, computed cells shaded, and “– –” against every form that does not apply. Bilingual headers, as the certificates on the register are.",
    note: "Its SHA-256 is recorded in the audit trail when the report is locked.",
  },
  {
    id: "docx",
    icon: "description",
    title: "DOCX — review copy",
    blurb:
      "For the AD/DD cycle. Watermarked DRAFT and carries the record copy's hash on its first page, because an editable file sits outside the append-only log and must never be mistaken for the record.",
    note: "Never the record copy, by design.",
  },
  {
    id: "json",
    icon: "data_object",
    title: "JSON — machine-readable",
    blurb:
      "DCC-inspired: the data and the human-readable PDF in one file, each with its own hash, so a downstream system never has to re-key numbers out of a document.",
    note: "Content-addressed — identical reports hash identically.",
  },
];

export function OutputStep() {
  const { reportId, detail, instrument, reload } = useReport();
  const { report, forms } = detail;

  const [lastRender, setLastRender] = useState<{ format: Format; sha256: string } | null>(null);
  const download = useMutation(api.download);
  const lock = useMutation(api.lock);

  const applicable = forms.filter((f) => f.applicable === 1);
  const decided = applicable.filter((f) => f.verdict);
  const ready = applicable.length > 0 && decided.length === applicable.length;
  const locked = Boolean(report.locked_hash);

  // The Director may lock; the server decides for certain, and refusing here only avoids
  // offering a button that would be turned down.
  const canLock = detail.available.some((t) => t.to === "LOCKED");

  async function get(format: Format) {
    const result = await download.run(reportId, format);
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    setLastRender({ format, sha256: result.sha256 });
    // The render is recorded in the log, so the audit trail has changed.
    reload();
  }

  async function doLock() {
    const result = await lock.run(reportId);
    if (result) {
      setLastRender({ format: "pdf", sha256: result.sha256 });
      reload();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Forms recorded"
          value={`${decided.length} / ${applicable.length}`}
          icon="checklist"
          tone={ready ? "pass" : "neutral"}
        />
        <Stat
          label="Overall result"
          value={report.overall_verdict ?? "In progress"}
          icon="verified"
          tone={report.overall_verdict === "PASSED" ? "pass" : report.overall_verdict === "FAILED" ? "fail" : "neutral"}
        />
        <Stat
          label="Record copy"
          value={locked ? "Locked" : "Not locked"}
          icon={locked ? "lock" : "lock_open"}
          tone={locked ? "pass" : "neutral"}
        />
      </div>

      {!ready && (
        <Alert tone="warn" icon="pending" title="Not every applicable form has been recorded">
          {applicable.length - decided.length} form
          {applicable.length - decided.length === 1 ? "" : "s"} still need observations. A report
          generated now is marked as incomplete on its face — every unrecorded form prints
          “– –” with the reason — and the lifecycle will not let it be locked.
        </Alert>
      )}

      {download.error && <Alert tone="fail" title="Could not generate that file">{download.error}</Alert>}
      {lock.error && <Alert tone="fail" title="Could not lock the report">{lock.error}</Alert>}

      {lastRender && (
        <Alert tone="pass" icon="fingerprint" title={`${lastRender.format.toUpperCase()} generated`}>
          SHA-256 <code className="font-mono text-body-sm break-all">{lastRender.sha256}</code>
          <span className="mt-1 block text-body-sm text-on-surface-variant">
            The render is recorded in the audit trail, so this copy can be matched back to it later.
          </span>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {OUTPUTS.map((o) => (
          <Card key={o.id} className="flex flex-col">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
              <Icon name={o.icon} size={20} />
            </span>
            <h3 className="text-headline-sm text-on-surface">{o.title}</h3>
            <p className="text-body-md text-on-surface-variant mt-1.5 flex-1">{o.blurb}</p>
            <p className="text-body-sm text-on-surface-variant mt-2.5 italic">{o.note}</p>
            <div className="mt-4 flex gap-2">
              <Button
                variant={o.id === "pdf" ? "primary" : "secondary"}
                icon="download"
                loading={download.pending}
                onClick={() => get(o.id)}
                className="flex-1"
              >
                Download
              </Button>
              {o.id === "pdf" && (
                <Button
                  variant="secondary"
                  icon="open_in_new"
                  title="Preview the layout in a new tab"
                  onClick={() => window.open(api.renderUrl(reportId, "html", true), "_blank")}
                >
                  Preview
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Locking */}
      <Card elevation="raised">
        <CardHeader
          icon={locked ? "lock" : "lock_open"}
          title={locked ? "The record copy is locked" : "Lock the record copy"}
          description={
            locked
              ? "The report is closed to further editing. Its hash is in the audit trail."
              : "Renders the PDF and locks the report to it in one step, so the recorded hash always belongs to a document that exists."
          }
        />
        {locked ? (
          <div className="flex flex-col gap-2">
            <code className="rounded-lg bg-surface-container-low px-3 py-2 font-mono text-body-sm break-all text-on-surface">
              {report.locked_hash}
            </code>
            <p className="text-body-sm text-on-surface-variant">
              Anyone holding the PDF can hash it and compare. Verification needs no access to
              this system.
            </p>
          </div>
        ) : canLock ? (
          <Button variant="primary" icon="lock" loading={lock.pending} onClick={doLock}>
            Render and lock
          </Button>
        ) : (
          <p className="text-body-md text-on-surface-variant">
            Locking is the Director&rsquo;s step, and only once the report has been recommended
            with every applicable form recorded and no open deficiencies.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon="summarize" title="Summary of type evaluation" description="As it will print" />
          <div className="max-h-[360px] overflow-y-auto rounded-xl border border-outline-variant/50">
            <table className="w-full border-collapse">
              <tbody>
                {[...forms]
                  .sort((a, b) => a.form_id.localeCompare(b.form_id, undefined, { numeric: true }))
                  .map((f) => (
                    <tr key={`${f.form_id}-${f.range_index}`} className="border-b border-outline-variant/30 last:border-0">
                      <td className="px-3 py-2 font-mono text-body-sm text-on-surface-variant w-16">{f.form_id}</td>
                      <td className="px-3 py-2 text-body-md text-on-surface">
                        {f.test_id.replace(/_/g, " ")}
                        {f.na_reason && (
                          <span className="block text-body-sm text-on-surface-variant">{f.na_reason}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right"><Verdict value={f.verdict} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader icon="fingerprint" title="Report identity" />
          <dl>
            <KeyValue label="Report number"><span className="font-mono">{report.id}</span></KeyValue>
            <KeyValue label="Application">{report.application_no ?? "—"}</KeyValue>
            <KeyValue label="Conformity profile">
              {report.profile === "IN_Sch7A"
                ? "Seventh Schedule, Heading A — LM (General) Rules, 2011"
                : report.profile === "OIML_R76"
                  ? "OIML R 76"
                  : report.profile}
            </KeyValue>
            <KeyValue label="Rule pack">
              <span className="font-mono">{report.ruleset_id}</span>
              <span className="block text-body-sm text-on-surface-variant">
                Pinned when the report was created, so a later pack update cannot change an
                issued result.
              </span>
            </KeyValue>
            <KeyValue label="Instrument">
              {instrument
                ? `${instrument.manufacturer ?? "—"} ${instrument.model ?? ""} · class ${instrument.accuracyClass} · ${instrument.rangeKind}`
                : "Not recorded"}
            </KeyValue>
            <KeyValue label="Record copy hash">
              {report.locked_hash ? (
                <code className={cn("font-mono text-body-sm break-all")}>{report.locked_hash}</code>
              ) : (
                <span className="text-on-surface-variant">Not locked yet</span>
              )}
            </KeyValue>
            <KeyValue label="Last updated">{formatDateTime(report.updated_at)}</KeyValue>
          </dl>
          <div className="mt-3">
            <Badge tone="info" icon="gavel">
              IT Act 2000 §§4 and 5 — electronic records and digital signatures
            </Badge>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-2">
            Certificates are published under AoM Rule 11(4); the report and the drawings behind
            it are not open to public inspection. <Clause>Rule 16(2)</Clause>
          </p>
        </Card>
      </div>
    </div>
  );
}
