# TulaSetu — NAWI Test Report Generation System
## Master Document: Research Findings + PRD + PPT Kit
**SIH 2026 · Problem Statement SIH26035 · Ministry of Consumer Affairs, Food & Public Distribution (DoCA)**

Product name: **TulaSetu** (tula = balance/scale, setu = bridge — the bridge between the test bench and the certificate). Alternates if needed: e-Tula, MAPR (Model Approval Report), DhruvTula.

---

# PART 1 — THE PROBLEM (every claim is evidence-backed)

## 1.1 What the PS asks (official text, condensed)
Develop a software application that automates test data recording, compliance evaluation and generation of standardized test reports for Non-Automatic Weighing Instruments (NAWI) as per OIML R 76, for the model approval process. Explicit asks: instrument details capture, lab/environmental conditions, observations entry for all R 76 tests, auto calculation of permissible errors and pass/fail, validation checks, standardized reports in **PDF + editable MS Word**, digital repository, **role-based access**, dashboard, search, photo/document attachment, digital signatures (optional), **support for future OIML revisions**, and technical documentation as a deliverable. Desktop and/or web. Category: Software. Dataset pointer: Legal Metrology Act + **Legal Metrology (General) Rules, 2011**.

## 1.2 The process today
- Application side is digital: the model approval portal (lm.doca.gov.in, now e-Maap) handles registration, application number, RRSL assignment, fee, and document upload (pdf/jpg/png scans).
- From "model received at RRSL" onward it is manual: bench testing → **report prepared in spreadsheets/document templates** → AD/DD manual re-verification → Director (LM) → certificate.
- The PS itself admits: reports are "largely prepared manually using spreadsheets or document templates, making the process time-consuming, prone to calculation errors and lacking uniformity."

## 1.3 The anchor statistic (official, DoCA Annual Report 2022-23)
> After services went online, model approval end-to-end time fell from **6–9 months to 3–4 months**.

Pitch frame: **digitizing the application produced the first halving; digitizing the report is the next halving.** The remaining 3–4 months contain bench testing + the paper report chain.

## 1.4 Scale and stakes (verified numbers)
| Fact | Value | Source |
|---|---|---|
| Certificates issued (run-rate) | Cert #362 issued by 24 Jul 2026 → **~645/year** | lm.doca.gov.in public certificates |
| NAWI share of approvals | ~69% (11 of 16 sampled certs) | Our 16-certificate corpus |
| Operational RRSLs | **6** (Ahmedabad, Bengaluru, Bhubaneswar, Faridabad, Guwahati — NABL accredited — plus Varanasi, inaugurated 23.12.2021) | DoCA AR 2022-23 |
| 7th RRSL | Nagpur, under construction (CPWD) | DoCA AR 2022-23 |
| Workload imbalance | Guwahati approves 3–8 models/yr; Varanasi 40–76/yr | DoCA AR performance tables |
| Testing fee | ₹10,000 mechanical / **₹25,000 digital-electronic** (2019 amendment) | AoM Rules, Rule 19 |
| Cost of a rejection | Resubmission of a disapproved model = **fresh application + fresh fees** (Rule 10) | AoM Rules 2011 |
| Private test centres | 40 GATC certificates issued to private entities | PIB, May 2026 |
| Legal gate | No state manufacturing/import licence without central model approval (Rule 20; Act s.22) | AoM Rules 2011 |

## 1.5 Why now (the timing slide)
1. **Sept 2023** — India became the **13th country** authorised to issue OIML pattern approval certificates. RRSL reports are now an international deliverable; the R 76 report format is **mandatory** under OIML-CS.
2. **20 May 2026** — **e-Maap** unified portal launched (covers model approvals); Software Testing Facilities built at RRSLs with **C-DAC**; Jan Vishwas reforms (decriminalisation, licence→registration).
3. **Oct 2025** — GATC Amendment Rules: RRSLs/NTH labs **deemed GATCs**; separate certificate per instrument mandated → multi-tenant software is a regulatory reality, not a design choice.
4. **OIML R 76 is being restructured** from 2 parts into **5 parts** (1.1 CD under review; report format splitting into Part 3 test report + Part 4 type evaluation report). Any hardcoded tool dies at the next edition.
5. **Oct 2026** — India hosts the **61st CIML meeting in New Delhi**. The world's legal metrology leadership arrives weeks after SIH.

---

# PART 2 — COMPLETE RESEARCH FINDINGS

## 2.1 Legal framework map (India)
| Instrument | What it does | Key provisions we use |
|---|---|---|
| Legal Metrology Act, 2009 | Parent act | **s.22** model approval mandatory; s.24/33 verification & penalties |
| LM (Approval of Models) Rules, 2011 | The model-approval process | R.4(3)(d) lab must have "adequate recording system"; R.4(3)(g) NABL required; **R.4(9) lab must report annually: models tested, fees, time taken per test**; R.5 application contents (= our General Info schema); R.6(8) provisional certificate if testing >3 months; R.7(1)(a) conformity to Indian rules **or OIML recommendations** (dual track is statutory); R.7(2) test procedure as prescribed by Director; R.8 report flow lab→Director→Central Govt (Director may remit back); R.8(7) provisional cert ≤1 year; R.10 resubmission = fresh fees; R.11 certificate contents; **R.11(4) certificates published on website** (2019 amendment — why our corpus exists); R.12 approval mark = IND + year + lab code + model code; R.13(1)(e) revocation if design/circuit altered; R.19 fees; R.20 state licence gated on central certificate |
| LM (General) Rules, 2011 | Technical specs | Rule 13 → **Seventh Schedule Heading A** = India's NAWI spec; Rule 27 re-verification: 24 months (weights, beam scales, counter machines etc.), 12 months (others) |
| LM (GATC) Rules, 2013 + Oct 2025 amendment | Private verification | RRSL/NTH deemed GATCs; ₹2 lakh/equipment/yr; separate certificate per instrument; Fifth Schedule verification fees ₹50–₹15,000 |
| IT Act, 2000 | Digital validity | **s.4** electronic records satisfy "written" requirements; **s.5** digital signatures = handwritten (secure asymmetric process) |

## 2.2 OIML R 76-1 (2006) — the math we encode
- **Accuracy classes**: I (special), II (high), III (medium), IIII (ordinary). India uses **IV** for ordinary — and India's own rules use IV (11×) and IIII (7×) interchangeably in the same document → our normalizer handles both.
- **e** form: 1×10^k, 2×10^k, 5×10^k. **n = Max/e**.
- **Classification (Table 3 = India Table 17, verified identical)**: I: e≥0.001g, n≥50000, Min=100e · II: e 0.001–0.05g n 100–100000 Min 20e; e≥0.1g n 5000–100000 Min 50e · III: e 0.1–2g n 100–10000 Min 20e; e≥5g n 500–10000 Min 20e · IIII/IV: e≥5g n 100–1000 Min 10e.
- **MPE (Table 6 = India Table 20, verified identical)**: ±0.5e for m ≤ 50000/5000/500/50 (I/II/III/IV); ±1.0e to 200000/20000/2000/200; ±1.5e beyond (caps 100000/10000/1000). **In-service MPE = 2× initial** (same engine scales to state verification).
- **Multi-interval**: e changes with load within one range; each partial range has e_i, Max_i, n_i; Max_i/e_(i+1) ≥ 50000/5000/500/50 by class. Worked example (2/5/15 kg class III) is our golden test.
- **Multiple range**: each range treated as a separate instrument → separate form set per range.
- **India-specific quirk**: **class II\*** = class II instruments intended for **direct sales to the public** (affects tilting applicability). Not in OIML.
- **Family (§3.10.4)** — deterministic solver: EUT set must include highest-n variant and smallest-e variant; a variant needs no test if its Max lies between two tested capacities whose ratio ≤ 10, OR n ≤ n_test AND e ≥ e_test AND Max ≤ 5 × Max_test × (n_test/n). Output = the certificate's "shall also cover…" clause (seen verbatim in 12/16 real certificates).
- **Modules (Table 7 + Annex F)**: error apportioned by fractions p_i (p_i ≤ 0.8; Σp_i² ≤ 1; purely digital module may take p=0). Annex F = compatibility checklist for indicator+load cell combos (n_LC ≥ n, capacity margins, v_min vs e·R/√N, temperature range overlap). 12/16 real certificates name load cells (Zemic HM9B, Flintec PC6, LCT LAK-40…) → **modular is mainstream**; both cells have public OIML R 60 certificates usable for a live demo.

## 2.3 OIML R 76-2 (2007) — the current 62-page report
- Structure: General information → test equipment → **Summary of type evaluation** → Tests 1–16 → **Checklist 17.1–17.4 (~200 yes/no items)**: 17.1 all instruments (except non-self-indicating), 17.2 direct sales/price computing, 17.3 electronic, 17.4 software-controlled.
- Marking convention: PASSED = X, FAILED = X, not applicable = "– –".
- Header on env-sensitive forms: temperature/humidity/pressure "at start / at max / at end".
- Formula chain (verbatim): P = I + ½e − ΔL; **E = I + ½e − ΔL − L**; **Ec = E − E₀**; rounding elimination only needed when d > 0.2e.
- **The 5 calculation kernels** (17 forms reduce to): K1 error-vs-mpe (weighing perf, eccentricity ×2, tare, warm-up, voltage, damp heat, endurance, span-variant); K2 difference-threshold (discrimination: digital 1.4d; analog 0.7·mpe visible; non-self 0.4·mpe); K3 displacement-mm (sensitivity 1/2/5 mm); K4 time-delta (creep ≤0.5e@30min & ≤0.2e in 15–30min; zero return ≤0.5e; temp-zero drift; stability); K5 significant-fault (fault > e during disturbance unless detected-and-reacted).
- Applicability highlights: class I → 1 °C zero rule + barometric pressure, no tilting, no span stability, no damp heat; class II damp-heat-exempt if e < 1 g; electronic-only: warm-up, voltage, disturbances, damp heat, span; 12.7 road-vehicle transients only if vehicle-powered; endurance only Max ≤ 100 kg and **last**; multi-range → full form set per range.

## 2.4 R 76 draft (1.1 CD) — what changes (our future-proofing evidence)
1. Split into **5 parts**: 1 requirements, 2 test procedures, **3 test report format, 4 type evaluation report format**, 5 verification & in-service inspection.
2. New report sections: **Identification of the instrument, Configuration for test, Adjustments or modifications**.
3. New sub-test: **12.3(c) surges on signal/data/control lines** (2007 had only a/b).
4. **Every cross-reference changed** (R76-1 annex refs → new R76-2 subclause refs).
5. **Checklist + Summary moved to Part 4**; Part 4 carries the "mandatory under OIML-CS" language.
→ Data model rule: keep *test forms* and *checklist+summary* as separate sections; edition = rendering config.

## 2.5 Certificate corpus (16 real, public certificates, 2026)
- Basis: 12/16 cite **Seventh Schedule**; 1 cites a foreign **OIML certificate (NMi R76-2006-A-NL1-25.21)** — both tracks live.
- 12/16 contain the **family clause**; 12/16 name **load cells**; classes I→IIII all present; Max spans 600 g → 40 t; certificates are **bilingual (Hindi+English)**; fields include **software version + checksum**; Figure 1 = model photo, Figure 2 = sealing diagram.
- Class strings are inconsistent ("Medium Accuracy (III)" / "High Accuracy Class" / "Class III") → normalization needed.
- Approval mark decoded via Rule 12: IND / lab-code / year / model-code (all sampled = lab code 09 — identity of 09: open item).

## 2.6 International landscape — creative solutions we borrow
| Where | Idea | What we take |
|---|---|---|
| Germany (Eichrecht + OCMF) | Measurement signed at source; public key on device; independent transparency software verifies bills | Sign observations at entry; ship a tiny verifier; tamper-evident reports |
| PTB DCC / D-CoC (+ PyDCC MIT, Inmetro tools) | Machine-readable certificate XML (LGPLv3) with **human PDF embedded inside** | One file = PDF for humans + JSON for machines |
| USA NTEP | Public certificate DB; **Publication 14** keeps checklists outside the standard with annual updates; VCAP (manufacturer tests, auditor verifies); Placed-in-Service report links serial→certificate | Public register; versioned rule pack; serial-level chain readiness |
| OIML-CS (2018) | Scheme A/B; **Manufacturer Test Laboratories allowed**; Scheme A rejection needs written justification | Multi-tenant: RRSL / GATC / MTL roles |
| WELMEC 7.2 + OIML D 31 | Software **risk classes** scale examination depth | Risk-tier suggestion per instrument use |
| China (2025) | Robotic remote R 76 testing + separate **Report Generation Module** (validated, Eₙ<1) | Engine as API, decoupled from capture |
| ISO 10012:2026 | Drift-based, data-driven calibration intervals | Our repository enables this for India (impossible today — no data) |
| PTB Metrology Cloud | National trust platform with plug-in e-certificate modules | Core + plug-in architecture for e-Maap |

## 2.7 Prior art & the gap
1998 NMI/APLMF shipped report sheets on a disk (blank forms, no logic). Commercial calibration suites (Beamex CMX, Fluke MET/CAL) cover *calibration* (4 basic tests), **not type evaluation** (17 tests + EMC + checklist + R 76-2 format). DCC ecosystem digitized *calibration certificates*; OIML's smart-document pilot targets R 60 (from Mar 2026), not R 76. China's system is robot-bound. **No software anywhere generates the R 76 type-evaluation report itself. No India tool found (tenders/GeM/C-DAC searched).** Why the gap persists: ≤13 issuing countries × a handful of labs each ≈ <100 buyers worldwide — too small for vendors, too important to stay manual.

## 2.8 Organization & judges intelligence
- IILM Ranchi trains ~200 Legal Metrology officers/year (4-month course) — the evaluators' shared vocabulary.
- Director (LM) is India's **CIML member**; division is ISO 9001; model approval is integrated with **National Single Window System (DPIIT)**.
- DoCA ran **6 problem statements in SIH 2025** (incl. e-commerce LM compliance checker; tampering detection in weighing instruments) with explainer videos → engaged, experienced SIH organization. SIH26035 is their first *internal-process* PS: **they intend to use the winner**.
- OIML DTG position: AI is not yet "court-proof" for legal metrology → we deliberately keep AI out of the legally relevant path.

---

# PART 3 — PRODUCT REQUIREMENTS DOCUMENT (PRD)

## 3.1 Product definition
**TulaSetu** — a rule-pack-driven test report generation system for NAWI type evaluation under OIML R 76 and the Legal Metrology (General) Rules 2011, producing legally faithful, bilingual, machine-readable reports with a full audit trail.

**Goals**: (G1) Eliminate calculation errors in type-evaluation reports. (G2) Cut report preparation/review time to hours. (G3) Uniform reports across all 6 RRSLs + 40 GATCs. (G4) Create India's first structured repository of test data. (G5) Survive OIML revisions without code changes.
**Non-goals**: controlling bench equipment; replacing officer judgment; measurement-uncertainty computation (roadmap only — not asked in PS); any AI in the legally relevant calculation path.

## 3.2 Personas & roles (from the official portal workflow)
| Role | Does | Permissions |
|---|---|---|
| Metrological Assistant (MA) | Enters instrument profile, observations, photos | Create/edit own draft reports |
| AD / DD | Reviews, records deficiencies, forwards | Review, annotate, return, approve-to-forward |
| Director (LM) | Final verification, certificate basis | Approve, sign, publish; admin |
| (Future) GATC operator / MTL | Same as MA in own tenancy | Tenant-scoped |

## 3.3 Report lifecycle (states — from AoM Rules)
Draft → Observations complete → Auto-validated → Submitted to AD/DD → (Deficiency → back to MA) → Recommended to Director → (Remit back for further tests | Provisional certificate path [R.6(8), ≤1 yr per R.8(7)]) → Final report locked → Certificate issued → Published.

## 3.4 Functional requirements (mapped 1:1 to the PS)
| ID | Requirement | PS ask | Notes |
|---|---|---|---|
| FR1 | Instrument profile & technical specs entry | ✔ | Fields = AoM Rule 5 list (identity, class, Max/Min/e/d, ranges, power, indication, load cell, software version+checksum, sealing, photos, circuit diagram ref) |
| FR2 | Lab & environmental conditions capture | ✔ | Temp/RH/pressure at start–max–end per env-sensitive form; class I forces pressure |
| FR3 | Applicability resolver → auto test list with reasons | implied | Rules in §2.3; "– –" auto-marking for N/A |
| FR4 | Observation entry for every applicable R 76 test | ✔ | Form-per-test; multi-range = form set per range |
| FR5 | Engine: E/Ec computation, mpe resolution, pass/fail | ✔ | 5 kernels + multi-interval-aware mpe resolver; d>0.2e rounding rule |
| FR6 | Input validation | ✔ | e ∈ {1,2,5}×10^k; n bounds by class; Min consistency; load monotonicity; unit sanity; mandatory fields |
| FR7 | Family/EUT solver | differentiator | §3.10.4 algorithm; emits certificate "shall also cover…" clause text |
| FR8 | Module compatibility checker (Annex F) | differentiator | Indicator+load cell checks; p_i apportionment |
| FR9 | Report generation: pixel-faithful R 76-2 PDF | ✔ | HTML→PDF; bilingual headers (certificates are bilingual) |
| FR10 | Editable **DOCX** export | ✔ | For AD/DD review cycle; watermark DRAFT until locked |
| FR11 | Machine-readable output | implied | JSON (DCC-inspired) with the human PDF embedded |
| FR12 | Repository + search + instrument-wise history | ✔ | Filter by class/manufacturer/status/date/lab |
| FR13 | Dashboard: in-process/completed/deficiency; **auto Rule 4(9) annual report** (models tested, fees, time per test) | ✔ | Legally mandated stats for free |
| FR14 | Attachments: photos (model, sealing), documents | ✔ | Flow into Figure 1/Figure 2 slots |
| FR15 | RBAC per §3.2 + append-only audit trail | ✔ | ISO/IEC 17025: original observations recorded at time made; amendments tracked with date+person; never edit-in-place |
| FR16 | Digital signature (optional) | ✔ (optional) | Hash-chain + officer key now; DSC/eSign integration path documented |
| FR17 | **Versioned rule packs**; dual profile (Sch 7-A / OIML); edition switch (2007 vs draft 5-part) | ✔ | Class symbol aliasing IV↔IIII; clause refs as data |
| FR18 | Technical documentation deliverable | ✔ | Architecture + calculation methodology + deployment |

## 3.5 Architecture
UI (React+TS wizard) → API (engine service) → Rule Pack store (versioned JSON + JSON Schema) → SQLite/Postgres → Renderers (PDF/DOCX/JSON). Engine = pure functions (no I/O) → 100% unit-testable; golden tests from R 76-1 worked examples (incl. the 2/5/15 kg multi-interval walk: ±0.5e₁→±1e₁→±1e₂→±1.5e₂→±1e₃). Desktop-first via Tauri (offline, SQLite), same codebase serves web. Engine exposed as API (China lesson): future automated benches or C-DAC STF can post data.

**Tech stack (recommended)**: React 18 + TypeScript + Vite + Tailwind; Tauri (desktop) / PWA (web); FastAPI (Python) or Node; SQLite→Postgres; PDF via Playwright/Puppeteer HTML print; DOCX via `docx` (npm) or python-docx; Zod/JSON-Schema validation; Vitest/pytest golden tests.

## 3.6 Security, compliance & deployment
IT Act s.4/s.5 give electronic records + digital signatures legal validity. Deployment path for the real world: NIC/MeghRaj hosting, CERT-In empanelled audit, GIGW 3.0 accessibility, DPDP Act care for manufacturer data (Rule 16(2): submitted models/drawings not open to public inspection → repository has confidentiality tiers; certificates public per R.11(4), reports not).

## 3.7 Risks & mitigations
| Risk | Mitigation |
|---|---|
| No real filled RRSL report to copy | Build from R 76-2 form structure (we have full text) + 16 public certificates + NTEP public certificates as layout references; RTI filed for the actual template |
| 62-page scope in 36 h | Vertical slice: profile → applicability → 3 forms (weighing perf, eccentricity, creep) → summary → PDF/DOCX/JSON. Rest = stubs with real structure |
| Judges expect "AI" | Lead with the OIML DTG "not court-proof" position; AI only in non-legal assistance (deficiency explanations) |
| Standard revision mid-life | Rule packs + section-split data model (§2.4) — demo the edition toggle |
| DOCX editing breaks integrity | DOCX watermarked DRAFT; final = locked PDF + hash in audit trail |

## 3.8 Roadmap
Hackathon (36 h): vertical slice + family solver + edition toggle + dashboard skeleton. V1 (3 mo): all 17 forms + checklist JSON + Annex F + eSign. V2: e-Maap/NSWS API integration; GATC tenancy; state verification mode (in-service = 2× MPE) → the same engine serves annual verification across states. V3: analytics (failure patterns by family; ISO 10012-style data-driven intervals).

**Team split (6)**: 1 engine+rule pack · 2 wizard UI · 3 renderers (PDF/DOCX/JSON) · 4 repository/dashboard/RBAC · 5 data (golden tests, certificates corpus, checklist JSON) · 6 pitch/deck/demo + documentation (FR18).

---

# PART 4 — PPT KIT

## 4.1 Slide-by-slide skeleton (12 slides)
1. **Title** — TulaSetu · SIH26035 · team. Tagline: "From the test bench to a legally valid certificate — one engine."
2. **The gate** — Model approval is market entry: Act s.22 + Rule 20 (no state licence without it). Fee ₹25,000 (digital). 6 RRSLs + 40 GATCs. ~645 certificates/year, ~69% NAWI.
3. **The paper wall** — Workflow diagram (digital application half vs manual report half). Quote the PS: "spreadsheets… time-consuming, prone to calculation errors, lacking uniformity." Guwahati 3–8 vs Varanasi 40–76 models/yr = non-uniformity in data.
4. **The number** — 6–9 months → 3–4 months after online applications (DoCA AR). "The report is the next halving." A rejection costs a fresh ₹25,000 + months (Rule 10).
5. **Why now** — 13th OIML issuing country (2023) · e-Maap launched May 2026 · CIML meets in New Delhi Oct 2026 · R 76 splitting 2→5 parts.
6. **TulaSetu** — product module map (login/roles → 3-step wizard → engine → three outputs).
7. **The engine** — 17 forms, 5 kernels. Show E = I + ½e − ΔL − L → Ec → mpe band; live red/green; multi-interval mpe jump (the moment judges lean in).
8. **Only-us features** — Family solver (output = the certificate's own "shall also cover…" clause); Annex F indicator+load-cell compatibility (with real Zemic/Flintec R 60 data); dual profile Seventh-Schedule/OIML (statutory per Rule 7(1)(a)); IV↔IIII normalizer (India's rules use both, 11× vs 7×).
9. **Future-proof & trustworthy** — versioned rule packs; live edition toggle 2007↔draft (new sections, new 12.3(c), moved checklist); append-only audit per ISO 17025; **deliberately no AI in the legal path** (OIML: AI not yet court-proof).
10. **Compliance & deployment** — IT Act s.4/5 validity; RBAC mirrors MA→AD/DD→Director; dashboard auto-generates the **Rule 4(9)** annual report; NIC/CERT-In/GIGW path.
11. **Demo** — screenshots or live (script below).
12. **Impact & roadmap** — hours not weeks per report; uniform across labs; first structured dataset; same engine → state verification (in-service MPE = 2×) → crores of instruments; exports via OIML-CS. Ask: pilot at one RRSL.

## 4.2 Stats card (memorize)
6–9 → 3–4 months · ₹25,000 per digital model test · ~645 certificates/yr · ~69% NAWI · 6 RRSLs (+Nagpur) · 40 GATCs · 13th OIML country (Sept 2023) · CIML Delhi Oct 2026 · 17 forms → 5 kernels · ~200 checklist items · MPE ±0.5/1/1.5e · in-service = 2× · family rule: Max ≤ 5·Max_T·(n_T/n) · IV used 11×, IIII 7× in India's own rules.

## 4.3 One-line differentiators
- "We don't fill the form; we compute it. The form is just a rendering."
- "Our dashboard files a legally mandated report — Rule 4(9) — automatically."
- "The standard is being rewritten right now; our rule pack is the only design that survives it."
- "We found India's rules call the same class IV and IIII on different pages. Our software is the first thing that reconciles them."
- "No AI in the legal path — because OIML itself says AI isn't court-proof yet. That's not a gap; that's the design."

## 4.4 90-second demo script (software-only)
1. Login as MA (role banner visible). 5s
2. New report → load sample: 2/5/15 kg, class III, multi-interval, electronic. 10s
3. Applicability screen: 11 tests active, 6 greyed with reasons ("Endurance — Max ≤ 100 kg ✓, scheduled last"; "12.7 — not vehicle-powered"). 10s
4. Weighing performance: type readings → live green ticks; enter one bad reading → instant red with "limit ±10 g, error 12 g". 20s
5. Cross a range boundary → mpe limit jumps automatically (call it out). 10s
6. Family solver: paste 8 variants → "test only 3" + generated certificate clause. 15s
7. Generate → bilingual PDF + DOCX + JSON (open JSON, show embedded PDF). 15s
8. Dashboard → Rule 4(9) annual stats, one click. Close: "Application digitization halved the timeline once. This halves it again." 15s

## 4.5 Judge Q&A prep
- **Uncertainty?** Not required by the PS (permissible errors + compliance only). Roadmap: GUM/EURAMET cg-18 module.
- **Where's your data?** Golden tests from R 76-1's own worked examples; 16 public certificates; NTEP public certificates as layout reference; RTI filed for the RRSL template.
- **Doesn't this exist?** No — searched tenders/GeM/C-DAC. e-Maap digitizes the application; the portal's own manual shows the report step is manual. C-DAC's facility tests instrument software (checklist 17.4) — we ingest that, not duplicate it.
- **Why no AI?** OIML DTG: AI not court-proof for legal metrology. Deterministic engine + optional AI assistant outside the legal path.
- **Standard changes?** Live toggle: 2007 edition ↔ 5-part draft (sections/cross-refs/12.3(c) differences are data).
- **Word export vs integrity?** DOCX = DRAFT-watermarked review artifact; final = locked, hashed PDF; audit trail append-only (ISO 17025).
- **Offline lab?** Desktop (Tauri+SQLite), sync when connected.
- **Who updates rule packs?** Director prescribes procedures (Rule 7(2)) — packs are versioned, signed config; we hand over an authoring guide (FR18 documentation).

---

# PART 5 — SOURCE REGISTER (all in team vault)
OIML: R 76-1:2006, R 76-2:2007, D 31:2019, B 18:2022 · R 76 1.1 CD Parts 1–5 + AU comments (consult.industry.gov.au) · India: LM Act 2009; General Rules 2011 (Seventh Schedule Heading A extracted); Approval of Models Rules 2011 (+2019 amendment); GATC Rules 2013 (+Oct 2025 amendment, via press); DoCA Annual Report 2022-23 (turnaround stat, RRSL tables); portal user manual; 16 certificates lm.doca.gov.in/ModelApproval/Certificates/2026/{1,8,50,56,100,150,200,251,259,278,289,300,320,340,349,362}.pdf · PIB releases (OIML 13th country; e-Maap/WMD-2026; SIH 2025 DoCA PS) · Reference: NMI R 76-1:2015; ASEAN NAWI guidelines; WELMEC 7.2; NCWM Pub 14/VCAP; NIST legal metrology; PTB DCC/Metrology Cloud; PyDCC; Eichrecht/OCMF sources; China R 76 remote testing paper; ISO 10012:2026 coverage.

*Open items: SIH SPOC contact · lab code "09" identity · RTI response · one human interview (consultant/manufacturer).*
