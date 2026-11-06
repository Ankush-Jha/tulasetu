# Civic & legal-integrity impact — not just faster, legally more defensible

- **Append-only audit trail** — ISO/IEC 17025 §7.8: original observations are recorded when made; a correction is a new event, never an edit-in-place. A dispute over a certificate can be traced to the exact reading and the exact person.
- **Digital signatures verified against the signing key**, not a static field on the user — so a rotated DSC (renewed yearly, as India's regime requires) doesn't silently invalidate a year-old, untouched report.
- **Confidentiality tiers** on attachments — Rule 16(2): submitted drawings and models are not open to public inspection, while the certificate itself is public under Rule 11(4). The repository enforces that split, not a shared folder.
- **Checksum-field validation** catches what a real audit of 16 public certificates found: the software-identification field entered inconsistently — a file size in one, a modulus in another — across the national register.
- **No AI in the legally relevant calculation path** — deliberately. OIML's own Digital Transformation position is that AI is not yet "court-proof" for legal metrology. Every verdict traces to a deterministic function with a golden test, not a model's inference.

## The standard is data, not code
R-76 is mid-rewrite — from 2 parts to 5. India's Seventh Schedule already differs subtly from OIML (the class symbol is **IV** in most of the Indian text and **IIII** in OIML's — India's own rules use both, 13 times and 7 times respectively, in the same document). TulaSetu normalizes this in the rule pack, not in a conditional buried in code — so the next OIML revision is a new JSON file, not a rewrite.
