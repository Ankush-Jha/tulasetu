/**
 * Attachments (FR14).
 *
 * R 76-2's report carries figures — Figure 1 is the model photograph, Figure 2 the sealing
 * diagram — and an application carries drawings and scans besides. Two rules shape how they
 * are stored.
 *
 * **Rule 16(2): submitted models and drawings are not open to public inspection.** So every
 * attachment carries a confidentiality tier and reading one is an access decision, not a
 * static file served off a directory. Certificates are published under Rule 11(4); the report
 * and the drawings behind it are not.
 *
 * **Content-addressed storage.** A file is stored under the SHA-256 of its bytes, and that
 * hash goes into the append-only log. The same photograph attached to two reports is stored
 * once, a corrupted file is detectable, and "is this the drawing that was submitted" is
 * answerable by hashing rather than by trusting a filename.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { Db } from "../db/open.js";

/** What an attachment is for. Figures 1 and 2 have fixed slots on the R 76-2 report. */
export const ATTACHMENT_KINDS = [
  "model_photo",
  "sealing_diagram",
  "circuit_diagram",
  "descriptive_drawing",
  "test_certificate",
  "document",
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const KIND_LABEL: Record<AttachmentKind, string> = {
  model_photo: "Figure 1 — model photograph",
  sealing_diagram: "Figure 2 — sealing diagram",
  circuit_diagram: "Circuit diagram",
  descriptive_drawing: "Descriptive drawing",
  test_certificate: "Supporting certificate",
  document: "Document",
};

export type Confidentiality = "public" | "restricted" | "confidential";

/**
 * Accepted types.
 *
 * Deliberately narrow. The portal itself accepts pdf/jpg/png scans, and an allow-list is the
 * only defensible position for a store that will later serve those bytes back to a browser —
 * an SVG or an HTML file served from the same origin is a scripting vector, not a drawing.
 */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** 25 MB. Large enough for a scanned drawing, small enough to keep in SQLite's neighbourhood. */
export const MAX_BYTES = 25 * 1024 * 1024;

export interface AttachmentRow {
  id: string;
  report_id: string;
  kind: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  storage_path: string;
  confidentiality: string;
  uploaded_by: string;
  uploaded_at: string;
}

export class AttachmentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AttachmentError";
    this.code = code;
  }
}

export interface StoreInput {
  reportId: string;
  kind: AttachmentKind;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  confidentiality?: Confidentiality;
  uploadedBy: string;
  uploadedAt: string;
}

/**
 * Where the bytes live.
 *
 * Split by the first two hex characters of the hash, so no directory accumulates hundreds of
 * thousands of entries on a laboratory that has been running for years.
 */
export function storagePathFor(root: string, sha256: string, ext: string): string {
  return join(root, sha256.slice(0, 2), `${sha256}.${ext}`);
}

export function storeAttachment(db: Db, root: string, input: StoreInput): AttachmentRow {
  const ext = ALLOWED[input.mimeType];
  if (!ext) {
    throw new AttachmentError(
      "UNSUPPORTED_TYPE",
      `${input.mimeType} is not accepted. Attach a JPEG, PNG, WebP or PDF — the same formats ` +
        `the model approval portal takes.`,
    );
  }
  if (input.bytes.byteLength === 0) {
    throw new AttachmentError("EMPTY_FILE", "The file is empty.");
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new AttachmentError(
      "FILE_TOO_LARGE",
      `The file is ${(input.bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ` +
        `${MAX_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (!sniffMatches(input.mimeType, input.bytes)) {
    // The declared type and the actual bytes disagree. Refuse rather than store something
    // that will be served back under a type it is not.
    throw new AttachmentError(
      "TYPE_MISMATCH",
      `The file does not look like ${input.mimeType}. Check that the correct file was chosen.`,
    );
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const path = storagePathFor(root, sha256, ext);

  // Content-addressed: identical bytes are written once. Re-uploading the same drawing to a
  // second report costs nothing and still gets its own row.
  if (!existsSync(path)) {
    mkdirSync(join(root, sha256.slice(0, 2)), { recursive: true });
    writeFileSync(path, input.bytes);
  }

  const row: AttachmentRow = {
    id: randomUUID(),
    report_id: input.reportId,
    kind: input.kind,
    filename: sanitizeFilename(input.filename),
    mime_type: input.mimeType,
    byte_size: input.bytes.byteLength,
    sha256,
    storage_path: path,
    // Rule 16(2) is the default: a submitted drawing is not public unless someone says so.
    confidentiality: input.confidentiality ?? "restricted",
    uploaded_by: input.uploadedBy,
    uploaded_at: input.uploadedAt,
  };

  db.prepare(
    `INSERT INTO attachments
       (id, report_id, kind, filename, mime_type, byte_size, sha256, storage_path,
        confidentiality, uploaded_by, uploaded_at)
     VALUES (@id, @report_id, @kind, @filename, @mime_type, @byte_size, @sha256,
             @storage_path, @confidentiality, @uploaded_by, @uploaded_at)`,
  ).run(row as unknown as Record<string, unknown>);

  return row;
}

export function listAttachments(db: Db, reportId: string): AttachmentRow[] {
  return db
    .prepare("SELECT * FROM attachments WHERE report_id = ? ORDER BY uploaded_at")
    .all(reportId) as AttachmentRow[];
}

export function getAttachment(db: Db, reportId: string, id: string): AttachmentRow | null {
  return (
    (db
      .prepare("SELECT * FROM attachments WHERE id = ? AND report_id = ?")
      .get(id, reportId) as AttachmentRow | undefined) ?? null
  );
}

/**
 * Read the bytes back, verifying they are the bytes that were stored.
 *
 * The hash is checked on every read rather than only on upload. Disk corruption and a swapped
 * file look identical to a filename lookup; they do not survive a hash comparison.
 */
export function readAttachmentBytes(row: AttachmentRow): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(row.storage_path);
  } catch {
    throw new AttachmentError(
      "FILE_MISSING",
      `The stored file for ${row.filename} is missing from the attachment store.`,
    );
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== row.sha256) {
    throw new AttachmentError(
      "HASH_MISMATCH",
      `The stored file for ${row.filename} does not match its recorded hash. It has been ` +
        `altered or corrupted since it was attached.`,
    );
  }
  return bytes;
}

/** Strip anything that could escape a directory or confuse a Content-Disposition header. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "attachment";
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
  return cleaned || "attachment";
}

/**
 * Confirm the bytes begin the way the declared type requires.
 *
 * Not a full parse — a magic-number check. It catches the honest mistake (a .docx renamed to
 * .pdf) and the dishonest one (an HTML file declared as an image) at the same cost.
 */
function sniffMatches(mimeType: string, bytes: Uint8Array): boolean {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (mimeType) {
    case "application/pdf":
      return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp":
      // "RIFF" .... "WEBP"
      return (
        startsWith(0x52, 0x49, 0x46, 0x46) &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      );
    default:
      return false;
  }
}

export function isAllowedType(mimeType: string): boolean {
  return mimeType in ALLOWED;
}

export function allowedTypes(): string[] {
  return Object.keys(ALLOWED);
}
