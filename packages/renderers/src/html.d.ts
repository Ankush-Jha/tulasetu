/**
 * HTML renderer — the layout everything else is built from.
 *
 * The PDF is this HTML printed by a browser, so this file is where R 76-2's page furniture
 * actually lives: A4 pages, a form per page, the "at start / at max / at end" environmental
 * header, computed cells shaded to distinguish them from entry cells, and the standard's
 * PASSED / FAILED / "– –" marking convention.
 *
 * Pure string building, no DOM, no browser. That means the layout is unit-testable without
 * launching Chromium — the PDF step only has to be trusted for pagination, not for content.
 */
import { type ReportDocument } from "./model.js";
export interface HtmlOptions {
    /** Print English + Devanagari furniture. Certificates on the register are bilingual. */
    bilingual?: boolean;
    /** Draw the DRAFT watermark. Defaults to `doc.draft`. */
    watermark?: boolean;
}
/** Escape for HTML text and attribute contexts. */
export declare function esc(s: unknown): string;
export declare function renderHtml(doc: ReportDocument, opts?: HtmlOptions): string;
