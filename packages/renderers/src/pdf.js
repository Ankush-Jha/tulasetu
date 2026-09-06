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
import { createHash } from "node:crypto";
import { renderHtml } from "./html.js";
/**
 * Render to PDF. Requires Chromium (`npx playwright install chromium`).
 *
 * Playwright is imported dynamically so that merely importing this package — to use the HTML,
 * DOCX or JSON renderer — does not require a browser to be installed.
 */
export async function renderPdf(doc, opts = {}) {
    const html = renderHtml(doc, opts);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        // `domcontentloaded` rather than `networkidle`: the document embeds everything it needs
        // and must render identically on an air-gapped bench machine.
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: opts.timeoutMs ?? 30_000,
        });
        await page.emulateMedia({ media: "print" });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            displayHeaderFooter: opts.pageNumbers ?? true,
            headerTemplate: `<div style="font-size:7pt;color:#666;width:100%;padding:0 12mm;">
        <span>${escapeForTemplate(doc.identity.reportId)}</span></div>`,
            footerTemplate: `<div style="font-size:7pt;color:#666;width:100%;padding:0 12mm;
        display:flex;justify-content:space-between;">
        <span>${escapeForTemplate(doc.lab.name)}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
            margin: { top: "18mm", bottom: "16mm", left: "12mm", right: "12mm" },
        });
        return {
            pdf,
            sha256: createHash("sha256").update(pdf).digest("hex"),
            byteLength: pdf.byteLength,
            html,
        };
    }
    finally {
        await browser.close();
    }
}
/** Chromium's header/footer templates are raw HTML, so values must be escaped. */
function escapeForTemplate(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
export function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
