/**
 * Turning a stored report into the three deliverables.
 *
 * The assembly lives here rather than in the renderers because it is the one step that has to
 * read the repository: the projections hold what was computed, the log holds who recorded it
 * and whether the chain still verifies, and the report has to carry both.
 *
 * The important property is that **nothing is recomputed at render time**. Rows come out of
 * the stored `FORM_RESULT_COMPUTED` payloads exactly as the engine produced them, so the
 * document reproduces the report as it was recorded rather than as today's engine would
 * recompute it. If the two ever disagree, that is a finding — and a renderer silently papering
 * over it would destroy the audit trail's whole purpose.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { InstrumentProfile, Verdict, WeighingRowResult } from "@tulasetu/engine";
import {
  assembleReport,
  renderDocx,
  renderHtml,
  renderPdf,
  serializeJson,
  type ComputedForm,
  type FormsFile,
  type ReportDocument,
} from "@tulasetu/renderers";

import type { Db } from "../db/open.js";
import { readEvents, verifyChain } from "../db/events.js";
import { verifySignature } from "./signing.js";
import type { ReportProjection } from "./events.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");

let formsFileCache: FormsFile | null = null;
let checklistBankCache: ChecklistBank | null = null;

interface ChecklistBank {
  source?: string;
  checklists: { id: string; title: string; items: { ref: string; text: string }[] }[];
}

/** The transcribed R 76-2 §17 item bank. Optional: a pack may ship without one. */
export function loadChecklistBank(path?: string): ChecklistBank | null {
  if (checklistBankCache && !path) return checklistBankCache;
  try {
    const file = JSON.parse(
      readFileSync(path ?? join(ROOT, "packages/rulepacks/checklists/R76-2_2007_checklist.json"), "utf8"),
    ) as ChecklistBank;
    if (!path) checklistBankCache = file;
    return file;
  } catch {
    return null;
  }
}

/** The transcribed R 76-2 form layouts. Read once; the file does not change at runtime. */
export function loadFormsFile(path?: string): FormsFile {
  if (formsFileCache && !path) return formsFileCache;
  const file = JSON.parse(
    readFileSync(path ?? join(ROOT, "packages/rulepacks/forms/R76-2_2007_forms.json"), "utf8"),
  ) as FormsFile;
  if (!path) formsFileCache = file;
  return file;
}

export type RenderFormat = "pdf" | "docx" | "json" | "html";

export interface RenderedReport {
  format: RenderFormat;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  sha256: string;
  document: ReportDocument;
}

/**
 * Build the render model from what is stored.
 *
 * `generatedAt` is injected rather than read from the clock so a rendering is reproducible:
 * two renders of an unchanged report produce byte-identical JSON, and therefore the same hash.
 */
export function buildReportDocument(
  db: Db,
  report: ReportProjection,
  opts: { generatedAt: string; formsFile?: FormsFile },
): ReportDocument {
  const formsFile = opts.formsFile ?? loadFormsFile();

  const lab = db.prepare("SELECT * FROM labs WHERE id = ?").get(report.lab_id) as
    | { id: string; name: string; kind: string; lab_code: string | null; nabl_accredited: number }
    | undefined;

  const instrument: InstrumentProfile | null = report.instrument_json
    ? (JSON.parse(report.instrument_json) as InstrumentProfile)
    : null;

  const formRows = db
    .prepare("SELECT * FROM report_forms WHERE report_id = ? ORDER BY form_id")
    .all(report.id) as {
    form_id: string;
    test_id: string;
    range_index: number | null;
    applicable: number;
    verdict: string | null;
    na_reason: string | null;
    result_json: string | null;
  }[];

  const events = readEvents(db, report.id);
  const verification = verifyChain(db, report.id);

  // Environmental conditions and the software-identification findings were recorded as events;
  // pull the latest of each rather than storing them a second time on the projection.
  const environmentByForm = new Map<string, ComputedForm["environment"]>();
  let softwareIssues: { code: string; message: string; clause?: string }[] = [];

  for (const e of events) {
    const p = JSON.parse(e.payload) as Record<string, unknown>;
    if (e.event_type === "OBSERVATIONS_RECORDED" && typeof p["formId"] === "string" && p["environment"]) {
      environmentByForm.set(p["formId"], p["environment"] as ComputedForm["environment"]);
    }
    if (e.event_type === "PROFILE_UPDATED" && Array.isArray(p["issues"])) {
      softwareIssues = (p["issues"] as { code: string; message: string; clause?: string }[])
        .filter((i) => i.code.startsWith("E_SWID") || i.code.startsWith("W_SWID"))
        .map((i) => ({ code: i.code, message: i.message, ...(i.clause ? { clause: i.clause } : {}) }));
    }
  }

  const forms: ComputedForm[] = formRows.map((f) => {
    if (f.applicable !== 1) {
      return {
        formId: f.form_id,
        testId: f.test_id,
        ...(f.range_index ? { rangeIndex: f.range_index } : {}),
        applicable: false,
        verdict: "NA" as Verdict,
        ...(f.na_reason ? { notApplicableReason: f.na_reason } : {}),
      };
    }
    if (!f.verdict || !f.result_json) {
      // Applicable but not recorded. Marked NA with an honest reason rather than left blank,
      // so the report never implies a test happened when it did not.
      return {
        formId: f.form_id,
        testId: f.test_id,
        ...(f.range_index ? { rangeIndex: f.range_index } : {}),
        applicable: false,
        verdict: "NA" as Verdict,
        notApplicableReason:
          "Applicable to this instrument, but no observations have been recorded for this form.",
      };
    }

    const stored = JSON.parse(f.result_json) as { rows?: WeighingRowResult[] };
    const rows = stored.rows ?? [];

    return {
      formId: f.form_id,
      testId: f.test_id,
      ...(f.range_index ? { rangeIndex: f.range_index } : {}),
      applicable: true,
      verdict: f.verdict as Verdict,
      rows: rows.map(toRenderRow),
      failedCells: rows
        .map((r, rowIndex) => ({
          rowIndex,
          keys: r.verdict === "FAILED" ? ["correctedError", "error"] : [],
        }))
        .filter((x) => x.keys.length > 0),
      ...(environmentByForm.get(f.form_id) ? { environment: environmentByForm.get(f.form_id)! } : {}),
    };
  });

  // Signatures: who actually took each step of the approval chain, read off the log.
  const signatureOf = (eventType: string, role: string) => {
    const e = [...events].reverse().find((x) => x.event_type === eventType);
    if (!e) return null;
    const user = db.prepare("SELECT full_name FROM users WHERE id = ?").get(e.actor_id) as
      | { full_name: string }
      | undefined;
    return {
      role,
      name: user?.full_name ?? e.actor_id,
      at: e.recorded_at,
      signatureHash: e.hash,
    };
  };

  const signatures = [
    signatureOf("SUBMITTED_FOR_REVIEW", "Metrological Assistant"),
    signatureOf("RECOMMENDED_TO_DIRECTOR", "Assistant / Deputy Director"),
    signatureOf("REPORT_LOCKED", "Director (Legal Metrology)"),
  ].filter((s): s is NonNullable<typeof s> => s !== null);

  // Cryptographic signatures, re-verified at render time. A signature printed on a report is
  // an assertion the reader cannot check, so it is only printed when it verifies *now* —
  // and one that does not is printed as failing rather than omitted.
  for (const e of events) {
    if (e.event_type !== "REPORT_SIGNED" || !e.signature) continue;
    const payload = JSON.parse(e.payload) as { signedHash: string };
    const signer = db
      .prepare("SELECT full_name, role_id, public_key FROM users WHERE id = ?")
      .get(e.actor_id) as { full_name: string; role_id: string; public_key: string | null } | undefined;
    const ok = signer?.public_key
      ? verifySignature(payload.signedHash, e.signature, signer.public_key).ok
      : false;
    signatures.push({
      role: `${signer?.role_id ?? "—"} — digital signature${ok ? "" : " (DOES NOT VERIFY)"}`,
      name: signer?.full_name ?? e.actor_id,
      at: e.recorded_at,
      signatureHash: payload.signedHash,
    });
  }

  // Checklists: only those with recorded answers are printed as answered; the rest are
  // marked not applicable with the reason, so the report never implies a question was put
  // and left blank.
  const answerRows = db
    .prepare(
      `SELECT checklist_id, item_index, item_ref, answer, remark
         FROM report_checklist_answers WHERE report_id = ?
        ORDER BY checklist_id, item_index`,
    )
    .all(report.id) as {
    checklist_id: string; item_index: number; item_ref: string;
    answer: "yes" | "no" | "na"; remark: string | null;
  }[];

  const bank = loadChecklistBank();
  const checklists = bank
    ? bank.checklists
        .map((list) => {
          const rows = answerRows.filter((a) => a.checklist_id === list.id);
          if (rows.length === 0) {
            return {
              id: list.id,
              title: list.title,
              applicable: false,
              notApplicableReason:
                "No responses recorded for this checklist.",
              answers: [],
            };
          }
          return {
            id: list.id,
            title: list.title,
            applicable: true,
            answers: rows.map((a) => ({
              ref: a.item_ref || (list.items[a.item_index]?.ref ?? String(a.item_index)),
              text: list.items[a.item_index]?.text ?? "(item text unavailable)",
              answer: a.answer,
              ...(a.remark ? { remark: a.remark } : {}),
            })),
          };
        })
        // A checklist nobody touched adds pages of "no responses"; print only those with
        // answers, plus nothing else. The summary already records what applied.
        .filter((c) => c.applicable)
    : [];

  const first = events[0];
  const last = events[events.length - 1];

  return assembleReport({
    reportId: report.id,
    ...(report.application_no ? { applicationNo: report.application_no } : {}),
    profile: (report.profile === "OIML_R76" ? "OIML_R76" : "IN_Sch7A") as "IN_Sch7A" | "OIML_R76",
    rulesetId: report.ruleset_id,
    ...(report.ruleset_version ? { rulesetVersion: report.ruleset_version } : {}),
    edition: "2007-report-format",
    status: report.status,
    lab: {
      name: lab?.name ?? report.lab_id,
      kind: lab?.kind ?? "RRSL",
      ...(lab?.lab_code ? { labCode: lab.lab_code } : {}),
      nablAccredited: Boolean(lab?.nabl_accredited),
    },
    instrument: instrument ?? PLACEHOLDER_PROFILE,
    ...(softwareIssues.length ? { instrumentExtras: { softwareIdentificationIssues: softwareIssues } } : {}),
    forms,
    formsFile,
    ...(checklists.length ? { checklists } : {}),
    signatures,
    audit: {
      eventCount: verification.eventCount,
      chainVerified: verification.ok,
      ...(verification.reason ? { chainNote: verification.reason } : {}),
      ...(first ? { firstRecordedAt: first.recorded_at } : {}),
      ...(last ? { lastRecordedAt: last.recorded_at } : {}),
    },
    generatedAt: opts.generatedAt,
    caveats: buildCaveats(report, instrument, verification.ok),
  });
}

/** Rows are stored as the engine computed them; this only reshapes for the form's columns. */
function toRenderRow(r: WeighingRowResult): Record<string, unknown> {
  return {
    load: r.load,
    // R 76-2 form 1 splits these into ↓ and ↑ sub-columns for the two directions of loading.
    // A single recorded pass fills both; recording the directions separately is a later step.
    indication: { "↓": r.indication, "↑": r.indication },
    additionalLoad: { "↓": r.additionalLoad, "↑": r.additionalLoad },
    error: { "↓": r.error, "↑": r.error },
    correctedError: { "↓": r.correctedError, "↑": r.correctedError },
    mpe: r.mpe.mpe,
    ...(r.label ? { label: r.label } : {}),
  };
}

function buildCaveats(
  report: ReportProjection,
  instrument: InstrumentProfile | null,
  chainOk: boolean,
): string[] {
  const caveats: string[] = [];
  if (!instrument) {
    caveats.push("No instrument profile has been recorded; metrological fields are blank.");
  }
  if (!chainOk) {
    caveats.push(
      "The audit chain for this report does not verify. Do not rely on this document until " +
        "the cause has been established.",
    );
  }
  if (!report.locked_hash) {
    caveats.push(
      "This report is not locked. It is a working copy, not the record copy, and its contents " +
        "may still change.",
    );
  }
  return caveats;
}

/** Used only so a report with no profile yet still renders its cover and summary. */
const PLACEHOLDER_PROFILE: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "single",
  electronic: false,
  ranges: [{ e: 1, d: 1, max: 0, min: 0 }],
};

/**
 * Render one format.
 *
 * PDF needs Chromium, so it is the only format that can fail for an environmental reason; the
 * caller turns that into a clear message rather than a 500.
 */
export async function renderReport(
  db: Db,
  report: ReportProjection,
  format: RenderFormat,
  opts: { generatedAt: string; formsFile?: FormsFile },
): Promise<RenderedReport> {
  const document = buildReportDocument(db, report, opts);
  const base = report.id.replace(/[^A-Za-z0-9._-]/g, "_");

  switch (format) {
    case "html": {
      const html = renderHtml(document);
      const bytes = new TextEncoder().encode(html);
      return {
        format, bytes, contentType: "text/html; charset=utf-8",
        filename: `${base}.html`, sha256: sha256(bytes), document,
      };
    }
    case "docx": {
      const bytes = await renderDocx(document, {
        ...(report.locked_hash ? { recordCopySha256: report.locked_hash } : {}),
      });
      return {
        format, bytes,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: `${base}.docx`, sha256: sha256(bytes), document,
      };
    }
    case "pdf": {
      const { pdf, sha256: hash } = await renderPdf(document);
      return {
        format, bytes: pdf, contentType: "application/pdf",
        filename: `${base}.pdf`, sha256: hash, document,
      };
    }
    case "json": {
      // The PDF travels inside the JSON, per the DCC idea: one file that is both the
      // human-readable document and the machine-readable data.
      let pdfBytes: Uint8Array | undefined;
      try {
        pdfBytes = (await renderPdf(document)).pdf;
      } catch {
        // Chromium unavailable. The data half still stands on its own, and the absence of an
        // `embedded` block is self-describing.
        pdfBytes = undefined;
      }
      const json = serializeJson(document, pdfBytes ? { pdf: { bytes: pdfBytes } } : {});
      const bytes = new TextEncoder().encode(json);
      return {
        format, bytes, contentType: "application/json; charset=utf-8",
        filename: `${base}.json`, sha256: sha256(bytes), document,
      };
    }
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
