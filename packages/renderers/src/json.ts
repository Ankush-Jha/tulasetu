/**
 * Machine-readable output (FR11).
 *
 * Modelled on PTB's Digital Calibration Certificate idea: one file that is both the
 * human-readable document and the machine-readable data, so a downstream system never has to
 * re-key numbers out of a PDF. The DCC ecosystem does this for *calibration* certificates;
 * nothing does it for an R 76 *type-evaluation* report, which is the gap TulaSetu sits in.
 *
 * Three deliberate choices:
 *
 *  - **The PDF is embedded, base64, with its own hash beside it.** A consumer can verify the
 *    document it was handed without asking us for anything.
 *  - **The rule pack is identified, not inlined.** The report says which pack and version
 *    computed it; the pack itself is fetched separately. Inlining would double the file for
 *    every report while making the pack look like per-report data, which is exactly the
 *    confusion the versioned-pack design exists to avoid.
 *  - **Caveats travel with the data.** Anything the engine could not determine is stated in
 *    the file rather than dropped, so a machine consumer sees the same qualifications a human
 *    reader would.
 */

import { createHash } from "node:crypto";
import type { ReportDocument } from "./model.js";

export const TULASETU_JSON_SCHEMA_VERSION = "1.0.0";

export interface EmbeddedDocument {
  mimeType: string;
  filename: string;
  /** base64. */
  content: string;
  sha256: string;
  byteLength: number;
}

export interface ReportJson {
  schema: string;
  schemaVersion: string;
  generatedAt: string;
  /** Present once the PDF has been rendered — the human-readable copy, carried inside. */
  embedded?: EmbeddedDocument[];
  report: ReportDocument;
  /** Hash of `report`, canonicalised, so the data half is verifiable independently. */
  dataSha256: string;
  provenance: {
    producer: string;
    rulesetId: string;
    rulesetVersion?: string;
    edition: string;
    /** Explicit, because a metrology reader will ask. */
    determinism: string;
  };
}

export interface JsonOptions {
  /** The rendered PDF to embed. */
  pdf?: { bytes: Uint8Array; filename?: string };
  /** Rendered DOCX, if the review copy should travel too. */
  docx?: { bytes: Uint8Array; filename?: string };
  producer?: string;
}

export function renderJson(doc: ReportDocument, opts: JsonOptions = {}): ReportJson {
  const embedded: EmbeddedDocument[] = [];

  if (opts.pdf) {
    embedded.push(
      embed(opts.pdf.bytes, opts.pdf.filename ?? `${doc.identity.reportId}.pdf`, "application/pdf"),
    );
  }
  if (opts.docx) {
    embedded.push(
      embed(
        opts.docx.bytes,
        opts.docx.filename ?? `${doc.identity.reportId}.docx`,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    );
  }

  return {
    schema: "https://tulasetu.gov.in/schema/nawi-type-evaluation-report",
    schemaVersion: TULASETU_JSON_SCHEMA_VERSION,
    generatedAt: doc.generatedAt,
    ...(embedded.length ? { embedded } : {}),
    report: doc,
    dataSha256: canonicalHash(doc),
    provenance: {
      producer: opts.producer ?? "TulaSetu",
      rulesetId: doc.identity.rulesetId,
      ...(doc.identity.rulesetVersion ? { rulesetVersion: doc.identity.rulesetVersion } : {}),
      edition: doc.identity.edition,
      determinism:
        "Every value in this report was produced by deterministic, unit-tested computation " +
        "from the recorded observations and the identified rule pack. No machine-learning " +
        "model participates in the calculation path.",
    },
  };
}

export function serializeJson(doc: ReportDocument, opts: JsonOptions = {}): string {
  return JSON.stringify(renderJson(doc, opts), null, 2);
}

function embed(bytes: Uint8Array, filename: string, mimeType: string): EmbeddedDocument {
  return {
    mimeType,
    filename,
    content: Buffer.from(bytes).toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
  };
}

/**
 * Hash the report data under a canonical serialisation.
 *
 * `JSON.stringify` preserves insertion order, so two structurally identical reports built by
 * different code paths would otherwise hash differently. Sorting keys recursively makes the
 * hash a property of the content rather than of how the object happened to be assembled.
 */
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalise(value)).digest("hex");
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}
