# Certificate corpus analysis (16 real 2026 Certificates of Approval)

Source: `lm.doca.gov.in/ModelApproval/Certificates/2026/{n}.pdf`, sampled n = 1, 8, 50, 56, 100, 150, 200, 251, 259, 278, 289, 300, 320, 340, 349, 362.
Raw extracted fields: `certificates-fields.json` (use as engine fixtures / renderer reference).

## Headline structure (verified)
- **~69% are NAWI** (11 of 16). NAWI is the single biggest approval segment.
- Legal basis: **12/16 cite the Seventh Schedule** (domestic track); 1 cites a foreign **OIML certificate** (NMi, Netherlands, `R76-2006-A-NL1-25.21`) — the import track. → confirms the **dual-profile** design.
- **12/16 contain the family clause** ("...shall also cover... Max up to X, n in range A–B for e ≥ ...") — this is exactly what our family solver must generate.
- **12/16 name a load cell** — KELI, Tedea-Huntleigh, Zemic, CZL, ADI Artech, Flintec, LCT — each has a public OIML R-60 certificate → use for the **Annex-F compatibility demo**.
- Approval mark format (Rule 12): `IND / <lab-code> / <year> / <model-code>`. All sampled = **lab code 09** (Faridabad).
- Certificates are **bilingual (Hindi + English)** → renderer must support bilingual headers.
- Classes I → IIII all present; Max spans 600 g → 40 t.
- Class strings are inconsistent across certs: "Medium Accuracy (III)", "High Accuracy Class", "Class III" → **normalizer needed**.

## THE CHECKSUM AUDIT (our strongest original finding)

R-76-1 Annex G requires the **software identification** (version + checksum) to be "clearly assigned to the legally relevant software." In the real register, this field is entered inconsistently:

| Cert | checksum field | what it actually is |
|---|---|---|
| #008 | `34559a18232bc0c6c417` | correct — 20-char hex |
| #050 | `0B6A` | 4-char (short) |
| #100 | `8100kb` | **a file size, not a checksum** |
| #200 | `3A7F` | 4-char |
| #251 | `D300` | 4-char |
| #349 | `65536` | **the modulus (2¹⁶), not a value** |
| #259 & #300 | `e24a8d3c12b7f5a89e1b` (identical) | **two different manufacturers, same value** — copy-paste or unverified |
| #320, #340 | `is`, `Details` | field left as template filler (parser caught vagueness) |

**Product consequence:** our validation layer enforces a checksum **format** on this field (hex, min length, per Annex G) and flags file-sizes, moduli, and cross-certificate duplicates. No other team will have this — it comes from reading the register, not the standard.

> Caveat for the team: these were extracted from PDF text; before putting exact strings on a slide or in a report, re-open 2–3 certificates (e.g. #100, #349) on the portal to confirm the field didn't shift during extraction.
