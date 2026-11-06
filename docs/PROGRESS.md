# PROGRESS

State as of 2026-09-07. **428 tests passing**, `tsc` clean across all packages.

```bash
npm test                        # 428 tests
npm run typecheck
npm run demo                    # engine -> out/report.{html,pdf,docx,json}

# the application, in two terminals
npx tsx apps/api/src/server.ts  # API on :3000
npm run dev:web                 # UI on :5173, proxying /api

# the same engine against a different edition of the standard
TARAAZU_RULESET=draft npx tsx apps/api/src/server.ts   # oiml | india | draft
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

- [x] **K6** — R 76-2 form 7 (stability of equilibrium). A sixth kernel, because the form
      genuinely does not reduce: two checks against fixed multiples of e that never consult a
      resolved mpe band. See `docs/VERIFIED.md` §14.
- [x] Annex F items (8)–(10) — input voltage, impedance, cable length

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
- [x] `OIML_R76_DRAFT_5PART.json` — the committee drafts, verified against Parts 3 and 4
- [x] `edition-toggle.test.ts` — proves the pair that matters: the engine resolves an
      *identical* permissible error at every load under either pack, while the form numbering,
      the new 12.3(c) surge sub-item and every renumbered citation differ. An edition change is
      a different file, not a different program.

## Onboarding — for anyone opening this cold  [ DONE ]
- [x] `/brief` — the judge's briefing. Five tabs: the problem (with the process split into what
      is already digital and what is not), what we built, the 18 functional requirements against
      what actually exists, the integrations, and where every figure came from.
- [x] A first-run introduction that narrates the *metrology*, not the interface — the problem,
      the formula, the multi-interval trap, the approval chain, and how to check any of it.
      Skippable, remembered, and reachable again from "New here?" in the header.
- [x] `POST /admin/demo-data` and a button on the empty dashboard: five reports across all four
      accuracy classes, one passing, one failing, one blocked by the checksum audit. Seeded
      through the real service calls, so nothing on screen reached the repository by a path the
      application does not support.

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
- [x] Report download (PDF / DOCX / JSON / HTML) and render-and-lock in one step
- [x] Checklist answers written to the append-only log
- [x] Attachments — Figure 1, Figure 2, drawings; drag-and-drop, confidentiality tiers
- [x] Digital signatures on the audit page, re-verified on every read
- [x] The permissible-error envelope chart, and the range-boundary callout inside the table

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
- [x] Attachments — content-addressed, hash-verified on read, Rule 16(2) confidentiality
- [x] Rendering over HTTP, logged with the hash of the bytes produced
- [x] Digital signatures (Ed25519 over the chain head), returned with the chain's own verdict

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
const db = openDb("taraazu.db");
const T = new Date().toISOString();
db.prepare("INSERT OR IGNORE INTO labs (id,name,kind,lab_code,nabl_accredited,created_at) VALUES (?,?,?,?,?,?)")
  .run("lab-fbd", "Regional Reference Standards Laboratory, Faridabad", "RRSL", "09", 1, T);
const u = db.prepare("INSERT OR IGNORE INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)");
u.run("u-ma",  "lab-fbd", "MA",       "A. Assistant", "ma@example.gov.in",  T);
u.run("u-ad",  "lab-fbd", "AD",       "B. Deputy",    "ad@example.gov.in",  T);
u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director",  "dir@example.gov.in", T);
```

## What changed in the form-driven pass

Every R 76-2 form is now run by the kernel the rule pack names for it, and every column on the
entry screen comes from the form's own printed layout.

- **The rule pack emits the forms R 76-2 actually prints.** 20 test rules became 34: form 4.1
  split into 4.1.1 / 4.1.2 / 4.1.3 by mode of indication, form 12 into the nine forms 12.1
  through 12.6 plus 12.7a/b, 13 into 13a/b/c and 15 into 15a and 15c. Before this, five of the
  twenty rules emitted a form id (`4.1`, `12`, `12.7`, `13`, `15`) that had no printed layout,
  so those forms had no columns to render.
- **`packages/engine/src/forms.ts`** is the join between the rule pack and the forms file: it
  reads rows keyed by a form's printed column keys, dispatches to K1–K6, and writes the computed
  values back under the same keys. `packages/engine/tests/forms.test.ts` covers it.
- **Nine of the twenty tests were computing the wrong thing.** The API ran `k1ErrorVsMpe` on
  every form, so creep, zero return, discrimination, sensitivity, the disturbance forms, span
  stability and stability of equilibrium all returned an error-against-mpe verdict — a
  real-looking answer to a question those forms do not ask. Posting weighing rows into a
  non-K1 form is now refused rather than silently computed.
- **The two data files disagreed on kernels for forms 7 and 14** (`K1` in the forms file, `K6`
  and `K4` in the rule pack). The forms file's `kernel` was the transcriber's guess and its own
  `_kernelNote` said so; the rule pack is now the authority and the files are reconciled.
- **Laboratory and environmental conditions are captured.** The API accepted them and the
  renderer printed the header, but nothing collected the values, so it printed empty. Barometric
  pressure is asked for only where R 76-2 owes it — class I instruments and span stability.
- **Form 7 renders its three sub-tables** (printing/storage, zero-setting, tare balancing) and
  form 16 is recorded as an examination — a verdict and remarks — rather than as a measurement
  with a Compute button over nothing.
- **`FormSpec` is declared once**, in the engine, and re-exported by the renderers. There were
  two copies, typed differently, which is how they drifted.

## The demonstration set

`POST /admin/demo-data` seeds eight reports spread across the approval chain, every one through
the same service calls and role checks an officer's clicks reach — the MA records, the AD
recommends, the Director locks. A report is never written into a state one person could reach.

| Report | Instrument | State | Verdict |
|---|---|---|---|
| TS-DEMO-0001 | Class III multi-interval, 2/5/15 kg | PUBLISHED | PASSED |
| TS-DEMO-0002 | The same, over-reading by 3 e | DEFICIENCY | FAILED |
| TS-DEMO-0003 | Class II\* retail, defective checksum | DRAFT | FAILED |
| TS-DEMO-0004 | Class IIII 500 kg platform | DRAFT (6 of 26 forms) | — |
| TS-DEMO-0005 | Class I analytical balance | SUBMITTED | PASSED |
| TS-DEMO-0006 | Non-self-indicating beam scale | RECOMMENDED | PASSED |
| TS-DEMO-0007 | Class III counter scale | REMITTED | PASSED |
| TS-DEMO-0008 | The same, rev C | RECOMMENDED | PASSED |

TS-DEMO-0001 carries all 26 of its applicable forms, signed by the MA, the AD and the Director,
with a 66-event hash chain behind it. Before the form runner it could only ever reach FAILED or
DRAFT, because the seeder could fill only the weighing-shaped forms.

Two things the observation fixtures had to get right, and which are worth knowing if they are
ever edited:

- **Loads come from the instrument, not from a constant.** A 6 kg counter scale cannot be
  weighed at 15 kg, and the mpe resolver rightly refuses a load past Max.
- **A failing instrument reads wrong; it does not have a negative ΔL.** The seeded error runs
  through ΔL, which is what actually varies at the bench, but the *bias* that makes a report
  fail moves the indication. Pushing ΔL negative would seed an observation no bench could
  produce, and the validator refuses it.

## Persisting the hosted demonstration (Supabase)

The Vercel deployment keeps its database in memory, because a serverless function's filesystem
is ephemeral and not shared between instances. Configure Supabase and the whole SQLite file is
restored on cold start and written back after every write, so a demonstration survives being
left alone.

1. In a Supabase project, create a **private** Storage bucket named `taraazu`.
2. Set two environment variables on the Vercel project:
   - `SUPABASE_URL` — `https://<project>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — the service-role key, **not** the anon key. It bypasses row
     level security, so it belongs only in the server's environment; it must never reach the
     browser bundle.
   - Optional: `SUPABASE_DB_BUCKET` (default `taraazu`), `SUPABASE_DB_OBJECT` (default
     `taraazu.db`).
3. Redeploy. `GET /api/health` reports `storage.kind` — `supabase-storage` when it is on,
   `memory` when it is not, with `storage.error` carrying the reason if an upload failed.

With neither variable set, nothing changes: the server behaves exactly as it did, and the bench
install and the test suite never touch any of this.

**What this is not.** It is a demonstration convenience, and `apps/api/src/db/persistence.ts`
says so at the top. Two instances writing at once each upload their own whole file and the later
upload wins, losing the other's events — a single officer clicking through a demonstration never
hits that; a laboratory would. The durable, hash-chained append-only log that ISO/IEC 17025 §7.8
asks for wants a real filesystem (CLAUDE.md §4's bench install, against a real SQLite file) or a
real Postgres behind an async data layer. The second is a genuine migration rather than a swap:
all 23 service functions here are synchronous by design, over 64 statement sites and four
transactions, and converting them would touch every route and every test.

## A report opens on what it is, not on a form

A report used to open on the instrument wizard whatever its state. So TS-DEMO-0001 — recorded,
validated, submitted, reviewed, signed by three officers, locked, certificated and published —
opened on an editable form with a "Save and resolve tests" button, an action the server would
have refused on a document that is the record copy under ISO/IEC 17025 §7.8.

`GET /reports/:id` now answers `writable` (with the server's own reason), the signatures and the
deficiencies, and the report opens on an **Overview**: where it is, what that state means, who it
is waiting on, the verdict with the failing forms as links, who signed and whether those
signatures verify, the deficiencies and their answers, and the moves this officer's role can
actually take. Where a report is closed, the entry screens print the record instead of offering
boxes, and say once at the top why.

The demonstration set also seeds itself on the first boot of a hosted deployment, rather than
waiting for someone to press a button — an empty dashboard and an instruction is a poor answer
to "does this work". `TARAAZU_NO_AUTOSEED=1` turns it off; a bench install never runs it.

### A signature is verified against the key that made it

Found while reading the seeded reports: two of three signatures showed "does not verify" on a
report nobody had touched. Verification looked the signer's key up on the *user row*, so an
officer who rotated their key silently invalidated every signature they had ever made — and
under the Indian DSC regime a key is renewed every year or two. The report would then read as
tampered when nothing had changed.

The signer's public key is now recorded in the `REPORT_SIGNED` event, and verification uses it.
Rotation is reported separately, as `keyRotated`, because it is worth knowing and is not a
failure — revocation is a different question from verification, and answering it by silently
failing arithmetic conflates the two.

## Phase-2 lifecycle-integrity fixes (post-audit)

A role-based UX audit found that a report already reviewed and signed could still be edited.
Fixed, in order:

- **F1 — the freeze point.** `canWriteReport` (`apps/api/src/domain/rbac.ts`) only closed
  LOCKED and beyond to writes, so an AD could edit a RECOMMENDED report's instrument profile,
  and an MA's POST to `/observations` on a RECOMMENDED report returned 200 and silently flipped
  its verdict. Every state from SUBMITTED onward is now closed to report-data writes (profile,
  observations, checklist answers, attachment upload) for every role — a correction happens
  only by moving the report back down the chain (deficiency → DRAFT, remit → DRAFT). All four
  write routes already funnelled through this one guard, so the fix is in one place, with a
  human-readable, state-specific reason ("Submitted to the AD/DD — read-only...") in place of
  the capability name a role lacked. Deficiency resolution no longer goes through this guard
  (it is a lifecycle action, not a data write, and needs to work mid-loop while SUBMITTED).
- **F3 — discrimination's N/A reason was wrong.** The shared `discrimination` reason_group
  returned one "d ≥ 5 mg" sentence for all three of forms 4.1.1/4.1.2/4.1.3 (R 76-1 §3.8.1/
  .2.1/.2.2 are different tests with different exemptions); a digital self-indicating
  instrument's N/A rows for 4.1.2/4.1.3 printed a reason unrelated to why they were actually
  inapplicable. Each rule now gets its own reason. The same "one sentence, several rules"
  pattern was also silently mismatching on `damp_heat_a/_b/_c` and
  `disturbances_road_vehicle_a/_b` (checked `rule.id === "damp_heat"`, which never matches a
  suffixed id) — fixed by switching those checks to the `reason_group` key.
- **F9 — a rejected observation was still logged, under the wrong code.** An out-of-range load
  (777 g on a 220 g Max) was appended to the append-only log before the engine's own
  computation rejected it, and was logged as `E_NON_FINITE_VALUE` for a value that is very
  much finite — because the value arrived as the string `"777"` and validation ran before
  coercion. Fixed: numeric-looking strings are coerced before validation, and the observation
  is now validated and computed *before* anything is appended — a blocking finding is refused
  cleanly with its own code, and nothing lands in the log.
- **MA-05 — a negative testing fee was accepted.** `createReport` now refuses `feePaidInr < 0`.
  Checked AoM Rule 19 (docs/PRD.md) before adding anything stricter: the rule names two
  amounts (mechanical/digital-electronic) but the instrument's kind isn't known until the
  profile is set, later, and GATC verification fees add a third schedule — so ≥ 0 is the
  defensible bound, not an exact-amount check.

See `docs/VERIFIED.md` and the golden tests added alongside each fix for the standards
citations.

## Known gaps, stated plainly

- **Authentication is a stub on both sides.** The browser sends `X-User-Id` and the server
  trusts it. The API refuses to start under `NODE_ENV=production` while that is true. Real
  deployment means NIC SSO or a DSC-backed session; IT Act 2000 §§4–5 give those standing.
  The signing code is already arranged for it: verification takes a detached signature and a
  public key and does not care what produced them.
- **Load-cell figures in the Annex F tests and on the modules page are illustrative**, not from
  datasheets. The brand names are real, from the certificate corpus; the numbers are not.
  Replace them with values off the cells' own OIML R 60 certificates before they reach a slide.
- **Repeatability's spread check** (`Emax − Emin ≤ |mpe|`, §3.6.1) is recorded in the rule pack
  as an `extra` note but is not computed — the per-row check is.
- **Form 8's fixed threshold** (tilting's 2 e when unloaded) is documented in the pack but the
  kernel applies the mpe-shaped check. Form 14 now runs K4's compound span check — every
  measurement against |mpe| plus the variation against max(0.5 e, 0.5 |mpe|) — rather than a
  per-row K1 check, which is what R 76-1 §5.3.3 / Annex B.4 actually asks for.
- **The disturbance forms' applicability is not conditioned on the kind of power supply.**
  R 76-2 prints 12.1, 12.2a and 12.3a for AC-mains instruments and 12.3b for any other supply;
  all nine are currently offered to any electronic instrument. Splitting them further needs the
  supply type on the profile, which the form does not yet collect.
- **Snapshot persistence is last-write-wins.** See above. It keeps the hosted demonstration's
  data between visits; it is not a concurrency-safe system of record.
- **The draft five-part pack is a committee draft**, not the standard in force. It says so, the
  server warns at boot, and the UI badges it.

## Nightly reset of the hosted demonstration

Any visitor can sign in as any officer, so the public demonstration drifts — reports locked,
withdrawn or scribbled over — and an evaluator could open it on someone else's mess. Vercel
Cron now calls `GET /api/cron/reset-demo` at 20:30 UTC (02:00 IST), which builds a fresh
database, reseeds the demonstration set and replaces the stored snapshot. It replaces the whole
demonstration database rather than editing events inside one, and the route exists only in the
serverless handler (`api/_src/handler.ts`) — a bench install has no way to reach it.

- **Set `CRON_SECRET`** in the Vercel project's environment. Vercel sends it as a bearer token;
  without it the route refuses every caller, including the scheduled job.
- The old snapshot writer is retired on reset, so a queued upload cannot put the old repository
  back. Another warm instance still holds the old data until it recycles — the same
  last-write-wins limit the persistence section above already states.
