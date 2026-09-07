/**
 * Attachments (FR14).
 *
 * R 76-2's report carries figures — Figure 1 is the model photograph, Figure 2 the sealing
 * diagram — and an application carries drawings besides. Two things about how they are handled
 * are worth surfacing on the screen rather than hiding in the server.
 *
 * **Confidentiality is a choice with a legal basis.** AoM Rule 16(2) says submitted models and
 * drawings are not open to public inspection, so `restricted` is the default and a
 * `confidential` file needs a reviewing role to read back — even for the officer who uploaded
 * it. The form says so where the choice is made.
 *
 * **Every file is content-addressed.** Its SHA-256 goes into the append-only log and is checked
 * again on every read, so a drawing swapped on disk is caught rather than served.
 */

import { useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  LoadingState,
  Select,
  TableWrap,
  Td,
  Th,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, type Attachment } from "../../lib/api";
import { useApi, useMutation } from "../../lib/useApi";
import { formatDateTime } from "../../lib/format";
import { useReport } from "./ReportLayout";

const KINDS: { id: string; label: string; hint: string }[] = [
  { id: "model_photo", label: "Figure 1 — model photograph", hint: "Printed on the report" },
  { id: "sealing_diagram", label: "Figure 2 — sealing diagram", hint: "Printed on the report" },
  { id: "circuit_diagram", label: "Circuit diagram", hint: "Rule 13(1)(e): alteration revokes approval" },
  { id: "descriptive_drawing", label: "Descriptive drawing", hint: "Submitted with the application" },
  { id: "test_certificate", label: "Supporting certificate", hint: "OIML R 60 load-cell certificate, etc." },
  { id: "document", label: "Document", hint: "Anything else" },
];

const CONFIDENTIALITY = [
  { id: "restricted", label: "Restricted — default", hint: "Readable within the laboratory" },
  { id: "confidential", label: "Confidential", hint: "Reviewing roles only (Rule 16(2))" },
  { id: "public", label: "Public", hint: "May accompany a published certificate" },
];

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "picture_as_pdf";
  return "draft";
}

export function AttachmentsStep() {
  const { reportId, detail } = useReport();
  const list = useApi((s) => api.attachments(reportId, s), [reportId]);
  const upload = useMutation(api.uploadAttachment);

  const [kind, setKind] = useState("model_photo");
  const [confidentiality, setConfidentiality] = useState("restricted");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const locked = ["LOCKED", "CERTIFICATE_ISSUED", "PUBLISHED", "WITHDRAWN"].includes(
    detail.report.status,
  );

  async function send(file: File) {
    const result = await upload.run(reportId, file, kind, confidentiality);
    if (result) list.reload();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void send(file);
  }

  const figure1 = list.data?.find((a) => a.kind === "model_photo");
  const figure2 = list.data?.find((a) => a.kind === "sealing_diagram");

  return (
    <div className="flex flex-col gap-5">
      {/* Figure slots — the two the report actually prints */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { slot: figure1, label: "Figure 1 — model photograph" },
          { slot: figure2, label: "Figure 2 — sealing diagram" },
        ].map(({ slot, label }) => (
          <Card key={label} elevation="flat" className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                slot ? "bg-success-container text-on-success" : "bg-surface-container-low text-on-surface-variant",
              )}
            >
              <Icon name={slot ? "check_circle" : "add_photo_alternate"} size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-label-lg text-on-surface">{label}</p>
              <p className="text-body-sm text-on-surface-variant truncate">
                {slot ? `${slot.filename} · ${humanSize(slot.byte_size)}` : "Not attached"}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {upload.error && <Alert tone="fail" title="Upload failed">{upload.error}</Alert>}

      {locked ? (
        <Alert tone="neutral" icon="lock" title="This report is closed">
          Attachments cannot be added once the record copy is locked.
        </Alert>
      ) : (
        <Card>
          <CardHeader
            icon="upload_file"
            title="Attach a file"
            description="JPEG, PNG, WebP or PDF — the formats the model approval portal accepts. Up to 25 MB."
          />

          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <Field label="What it is" required>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Confidentiality"
              required
              hint={CONFIDENTIALITY.find((c) => c.id === confidentiality)?.hint}
            >
              <Select value={confidentiality} onChange={(e) => setConfidentiality(e.target.value)}>
                {CONFIDENTIALITY.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border px-6 py-10 text-center transition-colors",
              dragging
                ? "border-primary bg-primary-fixed/40"
                : "border-outline-variant/60 bg-surface-container-low/40",
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-lowest text-on-surface-variant">
              <Icon name="cloud_upload" size={24} />
            </span>
            <p className="text-body-md text-on-surface">Drop a file here, or choose one</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void send(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="primary"
              icon="attach_file"
              loading={upload.pending}
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </Button>
          </div>

          <p className="mt-3 text-body-sm text-on-surface-variant">
            The file is stored under the SHA-256 of its bytes, and that hash goes into the audit
            trail. The hash is checked again on every read, so a file altered on disk is caught
            rather than served. <Clause>AoM Rule 16(2)</Clause>
          </p>
        </Card>
      )}

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            icon="folder"
            title="Attached"
            description={`${list.data?.length ?? 0} file${list.data?.length === 1 ? "" : "s"}`}
          />
        </div>
        {list.error ? (
          <div className="p-5"><ErrorState error={list.error} onRetry={list.reload} /></div>
        ) : list.loading ? (
          <LoadingState />
        ) : !list.data?.length ? (
          <div className="p-5">
            <EmptyState
              icon="attachment"
              title="Nothing attached yet"
              description="The report prints Figure 1 (the model photograph) and Figure 2 (the sealing diagram); both come from here."
            />
          </div>
        ) : (
          <TableWrap className="rounded-t-none border-x-0 border-b-0">
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Slot</Th>
                <Th align="right">Size</Th>
                <Th>Confidentiality</Th>
                <Th>Attached</Th>
                <Th align="right">SHA-256</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((a: Attachment) => (
                <tr key={a.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Icon name={iconFor(a.mime_type)} size={18} className="text-on-surface-variant" />
                      <span className="truncate">{a.filename}</span>
                    </span>
                  </Td>
                  <Td className="text-body-sm text-on-surface-variant">
                    {KINDS.find((k) => k.id === a.kind)?.label ?? a.kind}
                  </Td>
                  <Td align="right" numeric className="text-body-sm">{humanSize(a.byte_size)}</Td>
                  <Td>
                    <Badge tone={a.confidentiality === "confidential" ? "fail" : a.confidentiality === "public" ? "pass" : "neutral"}>
                      {a.confidentiality}
                    </Badge>
                  </Td>
                  <Td className="text-body-sm text-on-surface-variant whitespace-nowrap">
                    {formatDateTime(a.uploaded_at)}
                  </Td>
                  <Td align="right">
                    <code className="font-mono text-label-sm text-on-surface-variant" title={a.sha256}>
                      {a.sha256.slice(0, 10)}…
                    </code>
                  </Td>
                  <Td align="right">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="download"
                      onClick={() => window.open(api.attachmentUrl(reportId, a.id), "_blank")}
                    >
                      Open
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
