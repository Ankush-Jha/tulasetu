/**
 * PDF renderer — the record copy.
 *
 * The PDF is `html.ts` printed by headless Chromium. Nothing is laid out twice: if the HTML
 * is right, the PDF is right, and the HTML is unit-testable without a browser.
 *
 * The returned hash matters as much as the bytes. A locked report's SHA-256 goes into the
 * append-only event log, so "is this the PDF the Director signed?" is answerable later by
 * anyone holding the file — no access to our database required.
 */
import type { ReportDocument } from "./model.js";
import { type HtmlOptions } from "./html.js";
export interface PdfOptions extends HtmlOptions {
    /** Print the browser's own header/footer band with page numbers. */
    pageNumbers?: boolean;
    /** Milliseconds to wait for fonts and layout to settle. */
    timeoutMs?: number;
}
export interface PdfResult {
    pdf: Uint8Array;
    sha256: string;
    byteLength: number;
    /** The exact HTML that produced it — kept so a rendering can be reproduced and diffed. */
    html: string;
}
/**
 * Render to PDF. Requires Chromium (`npx playwright install chromium`).
 *
 * Playwright is imported dynamically so that merely importing this package — to use the HTML,
 * DOCX or JSON renderer — does not require a browser to be installed.
 */
export declare function renderPdf(doc: ReportDocument, opts?: PdfOptions): Promise<PdfResult>;
export declare function sha256(bytes: Uint8Array): string;
