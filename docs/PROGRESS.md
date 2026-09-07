# PROGRESS

State as of 2026-09-07. **327 tests passing**, `tsc` clean across all packages.

```bash
npm test                        # 327 tests
npm run typecheck
npm run demo                    # engine -> out/report.{html,pdf,docx,json}

# the application, in two terminals
npx tsx apps/api/src/server.ts  # API on :3000
npm run dev:web                 # UI on :5173, proxying /api
```

The UI needs seeded users to sign in — see "Seeding" at the foot of this file.

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
- [x] `IN_Sch7A_2011.json` + an extended JSON Schema, with 25 conformance tests
- [x] `docs/research/heading-a-verified.md` — India's Heading A checked line by line against
      the raw legal text. Table 17, Table 20, in-service ×2 and the multi-interval table are
      **verified identical** to OIML at the primary-source level. Corrects the extract's
      IV/IIII counts (IV appears 13 times, not ~11).
- [ ] Draft 5-part edition pack (for the edition-toggle demo)

## M3 — Web UI (`apps/web`)  [ WORKING ]
React 19 + Vite + Tailwind 4. Every verdict, permissible error and applicability decision on
screen comes from the API — the browser computes nothing, so what an officer sees is what the
report will carry.

- [x] `components/ui` — the primitive layer. Pages compose it and never state a colour,
      radius, border or shadow of their own. One elevation scale: hairline for a surface
      inside a surface, shadow for one above the canvas, never both.
- [x] One navigation source, filtered by capability (the header and sidebar used to disagree,
      and five of six sidebar routes did not exist)
- [x] Real session — identity and capabilities from `GET /me`, not literal text
- [x] Dashboard · Reports repository · New report
- [x] Report shell with six steps: profile → tests → observations → checklist → audit → output
- [x] Family solver, live against the engine, reproducing Table 8
- [x] Module compatibility (Annex F) · Statistics (Rule 4(9)) · Rule pack · Profile · 404
- [ ] Report generation buttons are inert — the renderers exist and are tested, but no
      download endpoint is wired yet (`npm run demo` produces all three outputs)
- [ ] Checklist answers are held in the browser and not yet posted to the log; the page says so

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
- [x] Fastify routes, with 25 HTTP tests that walk the whole approval chain
- [x] Standalone `/tools/family` and `/tools/modules` — both pure, so neither needs a report
- [x] `/checklists` serves the 363-item bank
- [ ] Attachment storage (schema exists, no handler)
- [ ] Report rendering endpoint (renderers built; not yet exposed over HTTP)
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

---

## Seeding

The API has no user-creation endpoint yet, so a fresh database needs three rows to sign in
against. The demonstration accounts are `u-ma` (Metrological Assistant), `u-ad` (Assistant
Director) and `u-dir` (Director) — three of them, because the point is that no single account
can walk a report from bench to certificate.

```js
// seed.mjs — npx tsx seed.mjs
import { openDb } from "./apps/api/src/db/open.ts";
const db = openDb("tulasetu.db");
const T = new Date().toISOString();
db.prepare("INSERT OR IGNORE INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)")
  .run("lab-fbd", "Regional Reference Standards Laboratory, Faridabad", "RRSL", "09", 1, T);
const u = db.prepare("INSERT OR IGNORE INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)");
u.run("u-ma",  "lab-fbd", "MA",       "A. Assistant", "ma@example.gov.in",  T);
u.run("u-ad",  "lab-fbd", "AD",       "B. Deputy",    "ad@example.gov.in",  T);
u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director",  "dir@example.gov.in", T);
```

## Known gaps, stated plainly

- **Authentication is a stub on both sides.** The browser sends `X-User-Id` and the server
  trusts it. The API refuses to start under `NODE_ENV=production` while that is true. Real
  deployment means NIC SSO or a DSC-backed session; IT Act 2000 §§4–5 give those standing.
- **Form 7 (stability of equilibrium) is not implemented** — its acceptance fits no kernel.
- **Annex F items (8)–(10) are not implemented** — indicator electrical specifications.
- **Load-cell figures in the Annex F tests and on the modules page are illustrative**, not from
  datasheets. Replace them with real OIML R 60 certificate values before they reach a slide.
- **Checklist answers are not yet recorded** to the append-only log.
