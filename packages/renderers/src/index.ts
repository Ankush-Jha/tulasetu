/**
 * @tulasetu/renderers — the three outputs.
 *
 * One assembled `ReportDocument` in; a pixel-faithful R 76-2 PDF (the record copy), a
 * DRAFT-watermarked DOCX (the AD/DD review copy), and a machine-readable JSON with the PDF
 * embedded, out. Renderers never compute — see `model.ts` for why that separation matters.
 */
export * from "./model.js";
export * from "./assemble.js";
export * from "./html.js";
export * from "./pdf.js";
export * from "./docx.js";
export * from "./json.js";
