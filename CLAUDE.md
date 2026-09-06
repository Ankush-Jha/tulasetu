# CLAUDE.md — TulaSetu

> **Read this first, every session.** It is the single source of truth for what we are building and why. When in doubt, prefer the primary sources in `docs/` over your own memory — this is a regulated-metrology domain and small details are legally load-bearing.

---

## 1. What this is

**TulaSetu** is a software application that generates **type-evaluation test reports for Non-Automatic Weighing Instruments (NAWI)** as per **OIML Recommendation R-76** and India's **Legal Metrology (General) Rules, 2011 (Seventh Schedule, Heading A)**.

It is our entry for **Smart India Hackathon 2026, Problem Statement SIH26035**, from the **Department of Consumer Affairs (DoCA)**.

The one-line thesis: **we compute the report; the 62-page form is just a rendering.** Today, government labs (RRSLs) fill this report by hand in spreadsheets — the PS itself calls it "time-consuming, prone to calculation errors, lacking uniformity." We replace that with a deterministic engine.

## 2. The mental model (read before touching code)

A weighing instrument (a shop scale, a weighbridge) must get **model approval** before it can be sold in India — this is the legal gate (LM Act s.22, Rule 20). Approval requires a lab to run ~17 tests from OIML R-76 and record them in a standardized report (OIML R-76-2). Each cell in that report is a **computed value**, not free text:

- `E = I + ½e − ΔL − L`  (error), then `Ec = E − E₀`  (corrected error)
- Pass if `|Ec| ≤ mpe`, where **mpe** (maximum permissible error) depends on the load band and accuracy class.

The whole legal core reduces to **5 calculation kernels** (see §5). Everything else — UI, PDF, repository — is scaffolding around that engine.

**Analogy:** it's ITR filing software for weighing scales. Inputs = test readings; slab rates = mpe bands; the ITR form = the R-76 report.

## 3. Non-negotiable design rules

1. **No AI / ML in the legally relevant calculation path.** OIML's own position is that AI is not yet "court-proof" for legal metrology. The engine is deterministic and unit-tested. AI may only ever assist in *non-legal* ways (e.g. explaining a deficiency in plain language) and must be clearly separated.
2. **The standard is data, not code.** Accuracy classes, mpe bands, applicability rules, clause references — all live in versioned **rule packs** (JSON). Never hardcode a threshold or a clause number. Reason: R-76 is being rewritten from 2 parts into 5 parts (2007 edition → draft), and India's Seventh Schedule differs subtly from OIML. We must support both profiles and both editions by swapping a rule pack, not editing code.
3. **Engine = pure functions.** No I/O, no DB, no UI, no randomness inside the engine. Input: observations + rule pack. Output: per-row errors, mpe, verdicts. This is what makes it 100% unit-testable.
4. **Append-only audit, never edit-in-place.** ISO/IEC 17025 §7.8: original observations must be recorded when made; amendments must be tracked with date + person, keeping the original. Model reports as immutable event logs, not mutable rows.
5. **Two output profiles from one dataset.** India's Seventh Schedule report AND the OIML R-76 report. Rule 7(1)(a) explicitly allows conformity to either.
6. **Class symbol normalization.** India uses `IV` for the ordinary class; OIML uses `IIII`. India's own rules use both in the same document. Normalize via aliases in the rule pack.

## 4. Architecture

```
apps/web            React + TypeScript wizard (profile → test list → observations)
packages/engine     Pure TypeScript: kernels, mpe resolver, applicability, family/Annex-F solvers
packages/rulepacks  Versioned JSON: OIML_R76_2006, IN_Sch7A_2011 (+ draft edition later)
                    Each validated by a JSON Schema.
(renderers)         PDF (Playwright HTML→PDF), DOCX (docx npm), JSON (DCC-style, PDF embedded)
(later) desktop     Tauri wrapper for offline lab use (SQLite); web is a PWA
```

Engine is exposed as an API so a future automated bench or C-DAC's software-testing facility can post data — capture and report generation are decoupled (this is how China's R-76 remote system is structured).

## 5. The 5 calculation kernels (the heart)

All 17 R-76-2 forms reduce to these. Implement them first, test them against R-76-1's own worked examples.

| Kernel | Logic | Used by |
|---|---|---|
| **K1** error vs mpe | `E = I + ½e − ΔL − L`; `Ec = E − E₀`; pass if `|Ec| ≤ mpe` | weighing performance, eccentricity ×2, tare, warm-up, voltage, damp heat, endurance |
| **K2** difference threshold | digital: add 1.4d, need `I2−I1 ≥ d`; analog: add \|mpe\|, need displacement ≥ 0.7×load; non-self: 0.4×\|mpe\| visible move | discrimination |
| **K3** displacement mm | permanent displacement ≥ 1 / 2 / 5 mm (by class & Max) | sensitivity |
| **K4** time-delta | creep: ΔP ≤ 0.5e @30min AND ≤ 0.2e between 15–30min, else \|mpe\| over 4h; zero-return ≤ 0.5e; temp zero-drift ≤ 1e per 5°C (1°C for class I) | zero return, creep, temp-no-load, stability |
| **K5** significant fault | during a disturbance, fault > e is significant unless detected-and-reacted | 12.1–12.7 disturbances |

**mpe resolver** (shared): given class + load, return the band. Bands (initial verification):
`±0.5e / ±1.0e / ±1.5e` with class-dependent boundaries (see rule pack). **In-service mpe = 2× initial.**
**Critical:** on a multi-interval instrument, `e` changes with load — the band boundary can jump *mid-range*. This is the #1 thing manual Excel gets wrong. The resolver must pick `eᵢ` by the partial range the load falls in. R-76-1's worked example (Max 2/5/15 kg, e 1/2/10 g, class III) is the golden test: bands walk ±0.5e₁ → ±1e₁ → ±1e₂ → ±1.5e₂ → ±1e₃.

Also: **eliminate rounding error only when `d > 0.2e`** (R-76-1 §3.5.3.2).

## 6. Two solvers (our differentiators)

- **Family/EUT solver** (R-76-1 §3.10.4): given a family of variants, output the minimum set to physically test. Rule: EUT set must include the highest-n variant and the smallest-e variant; a variant needs no test if its Max lies between two tested capacities whose ratio ≤ 10, OR if `n ≤ n_test AND e ≥ e_test AND Max ≤ 5 × Max_test × (n_test/n)`. **The output text is the certificate's own "shall also cover…" clause** — we generate it. Golden test: R-76-1's Table 8 (8 variants → test only 3: 1.2, 2.1, 2.4).
- **Annex-F module compatibility** (indicator + load cell): checks like `n_LC ≥ n`, capacity margin `Emax ≥ Q·Max·R/N`, `vmin ≤ e·R/√N`, temperature-range overlap, error apportionment `Σpᵢ² ≤ 1` (pᵢ ≤ 0.8; purely digital module may be 0). Demo with real load cells named in the certificates (KELI, Zemic, Flintec) — each has a public OIML R-60 certificate.

## 7. Applicability resolver (which forms apply)

Auto-generate the test list from the instrument profile; mark inapplicable forms "– –" with a reason. Rules:
- class I → 1°C zero rule + barometric pressure; **no tilting test**; no span stability; no damp heat
- class II → damp-heat-exempt if e < 1 g
- **class II\*** (India-specific: class II intended for direct sales to public) → extra no-load tilting
- electronic-only: warm-up, voltage, disturbances (12.x), damp heat, span stability
- 12.7 road-vehicle transients → only if vehicle-powered
- endurance → only if Max ≤ 100 kg, and always **last**
- sensitivity + non-self discrimination → only non-self-indicating
- multi-range → a full form set **per range**
- direct-sales checklist (17.2) / software checklist (17.4) → only if applicable

## 8. Milestones

- **M1 (do this first): the engine.** `packages/engine` — the 5 kernels + mpe resolver + applicability resolver + family solver, as pure functions, with a golden-test suite built from R-76-1's worked examples. When M1's tests pass, the hard part is done.
- **M2:** rule packs (`OIML_R76_2006`, `IN_Sch7A_2011`) as validated JSON + a loader.
- **M3:** the 3-step wizard UI (profile → auto test list → observation entry with live pass/fail).
- **M4:** renderers — PDF (pixel-faithful to R-76-2, bilingual), DOCX (DRAFT-watermarked review copy), JSON (DCC-style, PDF embedded).
- **M5:** repository + dashboard (search, history, auto Rule 4(9) annual stats, RBAC: MA → AD/DD → Director), append-only audit.
- **Vertical-slice demo:** profile → applicability → **3 fully working forms** (weighing performance, eccentricity, creep) → summary → all three outputs. Other forms as structured stubs.

## 9. Where the truth lives (`docs/`)

- `docs/standards/` — OIML R-76-1 (2006), R-76-2 (2007), R-76-3 & R-76-4 drafts. The report layout is R-76-2/§; the maths and tables are R-76-1.
- `docs/research/heading-a-extract.md` — India's Seventh Schedule Heading A (verified near-identical to OIML, with the IV/IIII quirk and class II\*).
- `docs/certificates/certificates-analysis.md` — what 16 real 2026 certificates contain, incl. the **checksum-field audit** (the software-identification field is entered inconsistently across the national register — a file size, a modulus, duplicate values — which our validation layer catches per R-76-1 Annex G).
- `docs/PRD.md` — full product requirements (18 FRs mapped 1:1 to the PS), personas, lifecycle, risks.
- `docs/research/full-research.md` — the complete research dossier (legal framework, global practice, prior art, the gap).

## 10. Guardrails for you, Claude Code

- Verify thresholds against `docs/standards/` before implementing — do not trust a number from memory.
- Never invent statistics for the pitch. If a number isn't in `docs/`, mark it an estimate.
- Keep the engine dependency-free and pure. Renderers and DB stay outside it.
- Write the golden tests **from the standards' worked examples first**, then make them pass. TDD here is not optional — it's how we prove correctness to a metrology judge.
- Commit in small, reviewable steps. Update `docs/PROGRESS.md` as milestones complete.
