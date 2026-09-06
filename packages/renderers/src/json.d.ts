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
import type { ReportDocument } from "./model.js";
export declare const TULASETU_JSON_SCHEMA_VERSION = "1.0.0";
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
    pdf?: {
        bytes: Uint8Array;
        filename?: string;
    };
    /** Rendered DOCX, if the review copy should travel too. */
    docx?: {
        bytes: Uint8Array;
        filename?: string;
    };
    producer?: string;
}
export declare function renderJson(doc: ReportDocument, opts?: JsonOptions): ReportJson;
export declare function serializeJson(doc: ReportDocument, opts?: JsonOptions): string;
/**
 * Hash the report data under a canonical serialisation.
 *
 * `JSON.stringify` preserves insertion order, so two structurally identical reports built by
 * different code paths would otherwise hash differently. Sorting keys recursively makes the
 * hash a property of the content rather than of how the object happened to be assembled.
 */
export declare function canonicalHash(value: unknown): string;
