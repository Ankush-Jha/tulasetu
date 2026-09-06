/**
 * The report document — the single structure every renderer consumes.
 *
 * There are three output formats (PDF for the record copy, DOCX for the AD/DD review cycle,
 * JSON for machines) and they must never disagree about content. So the engine's results are
 * assembled into this shape once, and each renderer is a pure projection of it. A renderer
 * never computes a verdict, never resolves an mpe, and never decides applicability — if a
 * renderer needs a number that is not in this document, the fix belongs upstream.
 *
 * The layout of each form comes from `packages/rulepacks/forms/R76-2_2007_forms.json`, which
 * was transcribed from R 76-2:2007 itself. That separation is the same rule as everywhere
 * else in TulaSetu: the standard is data. Switching to the draft 5-part edition means loading
 * a different forms file, not editing a renderer.
 */
/** The R 76-2 marking convention: not-applicable prints as an en-dash pair, not as blank. */
export const NOT_APPLICABLE_MARK = "– –";
/**
 * Report furniture in both languages. The sampled certificates on the national register are
 * bilingual, so a report that feeds them should be too.
 *
 * Only fixed furniture is translated. Test data, instrument identity and the standard's own
 * clause text stay as recorded — machine-translating a legal threshold would be exactly the
 * kind of thing CLAUDE.md's "no AI in the legally relevant path" rule exists to prevent.
 */
export const LABELS = {
    reportTitle: {
        en: "Type Evaluation Test Report — Non-Automatic Weighing Instrument",
        hi: "प्ररूप मूल्यांकन परीक्षण रिपोर्ट — अस्वचालित तौल यंत्र",
    },
    generalInformation: { en: "General information", hi: "सामान्य जानकारी" },
    laboratory: { en: "Laboratory", hi: "प्रयोगशाला" },
    manufacturer: { en: "Manufacturer", hi: "विनिर्माता" },
    model: { en: "Model", hi: "मॉडल" },
    serialNumber: { en: "Serial number", hi: "क्रम संख्या" },
    accuracyClass: { en: "Accuracy class", hi: "यथार्थता वर्ग" },
    maxCapacity: { en: "Maximum capacity, Max", hi: "अधिकतम क्षमता" },
    minCapacity: { en: "Minimum capacity, Min", hi: "न्यूनतम क्षमता" },
    scaleInterval: { en: "Verification scale interval, e", hi: "सत्यापन पैमाना अंतराल" },
    summaryOfTypeEvaluation: { en: "Summary of type evaluation", hi: "प्ररूप मूल्यांकन का सारांश" },
    test: { en: "Test", hi: "परीक्षण" },
    result: { en: "Result", hi: "परिणाम" },
    passed: { en: "PASSED", hi: "उत्तीर्ण" },
    failed: { en: "FAILED", hi: "अनुत्तीर्ण" },
    notApplicable: { en: "Not applicable", hi: "लागू नहीं" },
    checklist: { en: "Checklist", hi: "जाँच सूची" },
    signatures: { en: "Signatures", hi: "हस्ताक्षर" },
    draft: { en: "DRAFT", hi: "प्रारूप" },
    auditTrail: { en: "Audit trail", hi: "अंकेक्षण अभिलेख" },
    familyCoverage: { en: "Family coverage", hi: "श्रेणी कवरेज" },
    moduleCompatibility: { en: "Module compatibility", hi: "मॉड्यूल संगतता" },
};
export function label(key, bilingual) {
    const l = LABELS[key];
    if (!l)
        return key;
    return bilingual && l.hi ? `${l.en} / ${l.hi}` : l.en;
}
