# PROGRESS

State as of 2026-09-07. **272 tests passing**, `tsc` clean across all packages.

Run it: `npm test` · `npx tsx apps/cli/src/demo.ts` (writes `out/report.{html,pdf,docx,json}`).

---

## M1 — Engine (`packages/engine`)  [ DONE ]
- [x] `types.ts` — domain shapes only, no constants
- [x] `rulepack.ts` — pack contract, class normalization (IV↔IIII), band/capacity parsers, pack validation
- [x] mpe resolver, multi-interval aware + golden tests (R 76-1 §3.3's worked example, both sides of every boundary)
- [x] K1 error-vs-mpe — implements all three forms of `E`, keyed on `d > 0.2e`
- [x] K2 discrimination (digital / analog / non-self)
- [x] K3 sensitivity (displacement in mm)
- [x] K4 creep, zero return, temperature no-load, span stability
- [x] K5 significant fault, with the four §T.5.5.6 exclusions
- [x] applicability resolver — predicates evaluated from the pack, not hardcoded
- [x] `validate.ts` — profile, observations, and the Annex G software-identification checker
- [x] family/EUT solver + Table 8 golden test (8 variants → 1.2, 2.1, 2.4) + coverage-clause generation
- [x] Annex F module compatibility + Annex F.6.1's own worked example

Not implemented, deliberately, and recorded in `docs/VERIFIED.md` §14 / §13:
form 7 (stability of equilibrium — its acceptance fits no kernel); Annex F items (8)–(10).

## M2 — Rule packs (`packages/rulepacks`)  [ MOSTLY DONE ]
- [x] `OIML_R76_2006.json` **v1.1.0** — clause refs on every test, `kernel_params` for K2–K5,
      `checklist_rules`, family-solver constants. Fixes a real bug: endurance excluded class I.
- [x] `forms/R76-2_2007_forms.json` — 36 form pages transcribed from R 76-2
- [x] `checklists/R76-2_2007_checklist.json` — **363** items across 17.1–17.4
- [x] `rulepack-conformance.test.ts` — asserts the *shipped file*, not a transcription
- [ ] `IN_Sch7A_2011.json` + a real JSON Schema — **in progress**
- [ ] Draft 5-part edition pack (for the edition-toggle demo)

## M3 — Wizard UI (`apps/web`)  [ NOT STARTED — out of scope this session ]
Everything it needs exists: the engine is pure and importable, applicability returns
report-ready reasons, and `assembleReport` produces the render model.

## M4 — Renderers (`packages/renderers`)  [ DONE ]
- [x] `assemble.ts` — one document, three projections, so the outputs cannot disagree
- [x] `html.ts` — R 76-2 page furniture, bilingual, ↓/↑ sub-columns, computed cells shaded,
      "– –" for inapplicable forms, DRAFT watermark derived from lifecycle state
- [x] `pdf.ts` — Playwright, returns the SHA-256 that goes into the audit trail
- [x] `docx.ts` — review copy: watermarked, and names the record copy's hash
- [x] `json.ts` — DCC-style, PDF + DOCX embedded, content-addressed hash

## M5 — Repository (`apps/api`)  [ CORE DONE ]
- [x] schema — append-only log enforced by SQLite triggers, projections derived
- [x] `events.ts` — hash chain, `verifyChain`, optimistic concurrency
- [x] reducer + `rebuildAllProjections` (drop projections, lose nothing)
- [x] lifecycle state machine — includes the Director's remit-back (R.8) and the provisional
      branch (R.6(8)/R.8(7)), each transition naming its legal basis
- [x] RBAC — administrator holds no statutory power; a locked report is closed to everyone
- [x] Rule 4(9) annual return, dashboard counts, search with LIKE-escaping
- [ ] Fastify routes wiring the above to HTTP
- [ ] Attachment storage (schema exists, no handler)
- [ ] Digital signature integration (schema + hash chain ready; DSC/eSign not wired)

## Vertical-slice demo  [ WORKING ]
`apps/cli/src/demo.ts` runs profile → validation → applicability → K1 on two forms → family
solver → assemble → HTML + PDF + DOCX + JSON. Instrument is R 76-1 §3.3's own worked example,
so the mpe column in the output can be checked against the standard by eye.

---

## Notes / decisions

- **`docs/VERIFIED.md` is the verification log.** Every threshold traces to a page of the
  standard. Part 2 records nine places where the standard differs from CLAUDE.md §§5–7 —
  read it before quoting CLAUDE.md's kernel table at anyone.
- **Standards are extracted to text** at `docs/standards/extracted/*.txt` with page markers
  (`tools/extract-standards.py`). Grep them; do not work from memory.
- **The pack is pinned per report.** `reports.ruleset_id` + `ruleset_version` are recorded at
  creation so a later pack update cannot retroactively change an issued result.
- **Tests read the shipped rule pack**, not a copy. The kernel tests transcribe a pack inline
  for focus, which left a gap where the file could drift from what the tests assumed;
  `rulepack-conformance.test.ts` closes it.
- **Renderers never compute.** If a renderer needs a number that is not in the assembled
  document, the fix is upstream. That is what keeps the three outputs consistent.
- **DOCX is never the record copy.** It is editable, so whatever is typed into it sits outside
  the append-only log. It is watermarked and names the locked PDF's hash.
- Load-cell numbers in the Annex F tests are **illustrative**, marked as such in the file.
  Replace with real OIML R 60 certificate figures before they appear on a slide.
