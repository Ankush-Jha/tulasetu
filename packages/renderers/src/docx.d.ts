/**
 * DOCX renderer — the review copy, and only ever the review copy.
 *
 * The PS asks for an editable Word export, and the AD/DD review cycle genuinely needs one.
 * But an editable report cannot also be the record copy: whatever an officer types into it is
 * outside the append-only log, and so outside ISO/IEC 17025 §7.8's guarantee.
 *
 * This renderer resolves that by making the distinction impossible to miss rather than by
 * refusing the format. Every DOCX carries a DRAFT watermark and a first-page banner naming
 * the record copy's hash, so a printed Word file cannot be mistaken for the signed report.
 * The record copy is the locked PDF; its SHA-256 lives in the event log.
 */
import type { ReportDocument } from "./model.js";
export interface DocxOptions {
    /** Force the DRAFT banner off. Only meaningful for an already-locked report. */
    watermark?: boolean;
    /** The locked PDF's hash, printed in the banner so the record copy is identifiable. */
    recordCopySha256?: string;
}
export declare function renderDocx(doc: ReportDocument, opts?: DocxOptions): Promise<Uint8Array>;
