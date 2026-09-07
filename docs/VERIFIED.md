# Verification log — every number, traced to its source

CLAUDE.md §10: *"Verify thresholds against `docs/standards/` before implementing — do not
trust a number from memory."* This file is the audit trail for that rule. Nothing enters a
rule pack or a golden test until it has a row here.

**How to check a row yourself:** the PDFs are extracted to `docs/standards/extracted/*.txt`
with `===== [PDF PAGE n] <name> =====` markers, so a page citation is greppable:

```bash
grep -n "Table 6" docs/standards/extracted/OIML_R76-1_2006_requirements.txt
```

Status legend: **✅ verified verbatim** · ⚠️ verified with a caveat · ❓ not yet checked.

---

## 1. Maximum permissible errors — R 76-1:2006 Table 6 (p. 30)

✅ Verified verbatim. Reproduced exactly as printed:

| mpe on initial verification | Class I | Class II | Class III | Class IIII |
|---|---|---|---|---|
| ± 0.5 e | 0 ≤ m ≤ 50 000 | 0 ≤ m ≤ 5 000 | 0 ≤ m ≤ 500 | 0 ≤ m ≤ 50 |
| ± 1.0 e | 50 000 < m ≤ 200 000 | 5 000 < m ≤ 20 000 | 500 < m ≤ 2 000 | 50 < m ≤ 200 |
| ± 1.5 e | 200 000 < m | 20 000 < m ≤ 100 000 | 2 000 < m ≤ 10 000 | 200 < m ≤ 1 000 |

where *m* is the load expressed in verification scale intervals *e*.

Two notes printed under the table, both load-bearing:
- *"The absolute value of the maximum permissible error is 0.5 e, 1.0 e or 1.5 e, i.e. it is
  the value of the maximum permissible error without the positive or negative sign."*
  → the engine compares `|Ec| ≤ mpe`, and `mpe` is stored unsigned.
- *"For multi-interval instruments, refer to 3.3 (including the example)."*

**Note the asymmetry**: class I's ±1.5e band is unbounded above (`200 000 < m`, no upper
limit), while classes II/III/IIII have a ceiling. `packages/rulepacks/OIML_R76_2006.json`
encodes this as `"I": null` in the 1.5e band — correct, and the mpe resolver must treat
`null` as unbounded, not as "missing".

**In-service mpe** — R 76-1 §3.5.2 (p. 30): *"The maximum permissible errors in service shall
be twice the maximum permissible errors on initial verification (see 8.4.2)."* ✅ The factor
of 2 in the rule pack is correct. This is what lets the same engine serve state verification.

## 2. Elimination of rounding error — R 76-1:2006 §3.5.3.2 (p. 30)

✅ Verified verbatim: *"The rounding error included in any digital indication shall be
eliminated if the actual scale interval is greater than 0.2 e."*

So the ΔL / ½e correction is applied **only when `d > 0.2 e`**. CLAUDE.md §5's phrasing
("eliminate rounding error only when d > 0.2e") matches the standard.

## 3. Multi-interval instruments — R 76-1:2006 §3.3 (pp. 27–28)

✅ Verified verbatim, and this is the project's central golden test.

**§3.3.1 partial weighing range.** Each partial range (i = 1, 2, …) is defined by its
verification scale interval `e_i` (with `e_{i+1} > e_i`), its maximum capacity `Max_i`, and
`Min_i = Max_{i−1}` (for i = 1, `Min_1 = Min`). `n_i = Max_i / e_i`.

**§3.3.3 / Table 4** — for every partial range except the last:

| Class | I | II | III | IIII |
|---|---|---|---|---|
| Max_i / e_{i+1} ≥ | 50 000 | 5 000 | 500 | 50 |

**The worked example (p. 28)** — reproduced verbatim, because the whole mpe resolver is
tested against it:

> Maximum capacity, Max = 2 / 5 / 15 kg, class III
> Verification scale interval, e = 1 / 2 / 10 g
> This instrument has one Max and one weighing range from Min = 20 g to Max = 15 kg.
> The partial weighing ranges are:
> - Min = 20 g, Max₁ = 2 kg, e₁ = 1 g, n₁ = 2 000
> - Min₂ = 2 kg, Max₂ = 5 kg, e₂ = 2 g, n₂ = 2 500
> - Min₃ = 5 kg, Max₃ = Max = 15 kg, e₃ = 10 g, n₃ = 1 500
>
> The maximum permissible errors on initial verification (mpe) are:
> - for m = 0 g to 500 g — mpe = ± 0.5 e₁ = ± 0.5 g
> - for m > 500 g to 2 000 g — mpe = ± 1 e₁ = ± 1 g
> - for m > 2 000 g to 4 000 g — mpe = ± 1 e₂ = ± 2 g
> - for m > 4 000 g to 5 000 g — mpe = ± 1.5 e₂ = ± 3 g
> - for m > 5 000 g to 15 000 g — mpe = ± 1 e₃ = ± 10 g

**Why this is the trap CLAUDE.md warns about.** Work through the fourth band. At a load of
4 001 g the instrument is in partial range 2, so `e = e₂ = 2 g`, so `m = 4001/2 ≈ 2 000.5`.
Class III's ±1.0e band ends at m ≤ 2 000, so the load falls into ±1.5e → ±3 g. The limit
*loosened by 50 % in the middle of a weighing range*, with no change in the displayed
resolution. A spreadsheet that computes `m = load / e` using a single instrument-wide `e`
gets every row past the first changeover wrong.

Two ordering consequences the resolver must respect, in this order:
1. **First** find the partial range the load falls in (this fixes `e_i`).
2. **Then** compute `m = load / e_i` and walk the Table 6 bands.

Doing it the other way round — one `e` for the instrument — is the failure mode.

**Boundary inclusivity**: `Max_i` belongs to range *i* (the example gives ±1.5e₂ = ±3 g at
exactly 5 000 g, and ±1e₃ = ±10 g only above it). Range *i* covers `Min_i < L ≤ Max_i`.

**Fractions of e near zero** — §3.3.3, final paragraph: *"Whenever the variation of the
indication due to certain influence factors is limited to a fraction or multiple of e, this
means, in a multi-interval instrument, that e is to be taken according to the load applied;
particularly at or near zero, load e = e₁."* This governs K4 (zero return, creep, temperature
drift) on multi-interval instruments — the tolerance follows the load, and at zero it is `e₁`.

## 4. Multiple-range instruments — R 76-1:2006 §3.2 (p. 27)

✅ *"On multiple range instruments, each range is treated as if it were an instrument with
one range."* → a **full form set per range**, which is what the applicability resolver must
emit. This is distinct from multi-interval (one Max, one weighing range, **one** form set).
Conflating the two is a real trap; the engine keeps them as separate `rangeKind` values.

Also noted: *"For special applications that are clearly marked on the instrument, an
instrument may have weighing ranges in classes I and II, or in classes II and III. The
instrument as a whole shall then comply with the more severe requirements of 3.9."*
Not yet modelled — see open questions.

## 5. Family / EUT selection — R 76-1:2006 §3.10.4 (pp. 37–40)

✅ Verified verbatim.

**§3.10.4.2 — variants that must be tested:** *"For any family, at least the variant with the
highest number of verification scale intervals (n) and the variant with the smallest
verification scale interval, e, shall be selected as EUTs. … If a variant has both
characteristics, one EUT may be sufficient."*

**§3.10.4.3 — variants acceptable without testing:** *"Variants other than the EUTs can be
accepted without testing, if one of the following bulleted provisions is fulfilled (for
comparable metrological characteristics):*
- *Their capacities, Max, fall between two tested capacities. The ratio between the tested
  capacities shall not exceed 10; or*
- *All of the following conditions a), b), and c) are fulfilled:*
  - *a) n ≤ n_test*
  - *b) e ≥ e_test*
  - *c) Max ≤ 5 × Max_test × (n_test / n)"*

with the note: *"Max_test, n_test, and e_test are the characteristics of the EUT."*

✅ CLAUDE.md §6's summary of this rule is accurate.

**Table 8 (p. 39) — the golden test.** Two families, eight variants; EUTs marked X:

| Variant | Max | e | d | n | EUT |
|---|---|---|---|---|---|
| 1.1 | 200 g | 0.01 g | 0.001 g | 20 000 | |
| 1.2 | 400 g | 0.01 g | 0.001 g | 40 000 | **X** |
| 1.3 | 2000 g | 0.05 g | 0.05 g | 40 000 | |
| 2.1 | 1.5 kg | 0.5 g | 0.5 g | 3 000 | **X** |
| 2.2 | 3 kg | 1 g | 1 g | 3 000 | |
| 2.3 | 5 kg | 2 g | 2 g | 2 500 | |
| 2.4 | 15 kg | 5 g | 5 g | 3 000 | **X** |
| 2.5 | 60 kg | 20 g | 20 g | 3 000 | |

Family 1 = class II, temperature range 10 °C / 30 °C. Family 2 = class III, −10 °C / 40 °C.

⚠️ **Caveat worth knowing before we pitch the solver.** The standard's own "Remarks on the
selection" (p. 40) excuse variant 1.1 as *"it has the same e and d as variant 1.2. Only the
value of Max is reduced to 200 g (see 3.10.4.3)"* — but that is not literally either bullet of
§3.10.4.3: 200 g does not fall *between* two tested capacities (it is below the only tested
one in its family). It is only reachable via bullet 2, and only if 1.1's own `n` (20 000) is
used in condition (c): 200 ≤ 5 × 400 × (40 000/20 000) = 4 000 ✓. So bullet 2 does cover it —
but the prose justifies it differently from the arithmetic. The solver should apply the
bullets as written and *report* which bullet excused each variant, rather than reproducing the
prose. Flagging because a judge who knows Table 8 may ask exactly this.

Also note 2.4 is required not by its own characteristics but *because of* 2.5: *"the ratio
between variant 2.5 and 2.1 is greater than 10"* (60/1.5 = 40 > 10). So the EUT set cannot be
chosen by looking at each variant in isolation — it depends on the coverage gaps the whole
family leaves. The solver must iterate to a fixed point, not do one pass.

## 6. The formula chain — R 76-2:2007 explanatory notes (p. ~9, extract line 178)

✅ Verified verbatim:

```
ΔL = Additional load to next changeover point
P  = I + ½ e – ΔL                        = Indication prior to rounding (digital indication)
E  = I – L   or   = P – L   or   = I + ½ e – ΔL – L   = Error
Ec = Corrected error
```

and on each form: `Ec = E – E0` with *"E0 = error calculated at or near zero"*.

⚠️ **A detail CLAUDE.md flattens.** The standard gives `E` **three** alternative
expressions, not one. `E = I − L` is the form used when the rounding error is *not*
eliminated (`d ≤ 0.2 e`); `E = I + ½e − ΔL − L` is the form used when it is. CLAUDE.md §5
quotes only the second. The engine implements the choice, keyed on §3.5.3.2, and records
which was used per row (`roundingEliminated`) so the report can show its working.

⚠️ Also form-dependent: form 3.1 (eccentricity) prints *"E0 = error calculated at or near
zero **determined prior to each measurement**"* (extract line 548), where form 1 (weighing
performance) prints only *"at or near zero"* (line 409). So `E0` is not a single per-report
constant — it is per-form and sometimes per-measurement. The engine must accept `E0` per
form, not per report.

## 7. R 76-2:2007 form inventory

✅ Verified against the contents page. 1 Weighing performance · 2 Temperature effect on
no-load indication · 3.1 Eccentricity using weights · 3.2 Eccentricity using a rolling load ·
4.1 Discrimination · 4.2 Sensitivity (non-self-indicating) · 5 Repeatability · 6.1 Zero
return · 6.2 Creep · 7 Stability of equilibrium · 8 Tilting · 9 Tare · 10 Warm-up time ·
11 Voltage variations · 12.1–12.7 Electrical disturbances · 13 Damp heat, steady state ·
14 Span stability · 15 Endurance · 16 Examination of the construction · 17 Checklist
(17.1–17.4).

Marking convention: PASSED / FAILED / "– –" for not applicable.

## 8. India — Seventh Schedule, Heading A

⚠️ Recorded from `docs/research/heading-a-extract.md`, which states it was verified against
`heading-a-raw.txt`. **I have not re-verified the Indian tables line by line against the raw
text myself.** The extract's claims — that India's Table 17 = OIML Table 3, Table 20 = OIML
Table 6 with identical boundaries, in-service = 2×, and the IV/IIII and class II* quirks —
are treated as second-hand until checked. See open questions.

---

# Part 2 — where the standard differs from CLAUDE.md's summary

CLAUDE.md §§5–7 were written from memory and say so. Reading the standard turned up nine
places where it says something different or more than the summary does. **In every case the
code follows the standard**, and each is covered by a test so it cannot silently regress.

These are worth knowing before the pitch: several are exactly the kind of detail a metrology
judge would probe.

## 9. Zero return is not a flat 0.5 e — R 76-1 §3.9.4.2

The single most consequential correction. CLAUDE.md §5 gives K4's zero-return rule as
"≤ 0.5e". The standard gives **three** rules, by range structure:

| Range structure | Limit |
|---|---|
| Single range | 0.5 × e |
| **Multi-interval** | **0.5 × e₁** — the *smallest* e, not the e at the applied load |
| Multiple range | 0.5 × eᵢ of the unloaded range |

and multiple-range instruments carry a **second, stricter check**: after returning to the
lowest range from a load above Max₁, the zero indication must not vary by more than a **full
e₁** (not 0.5 e₁) over the following five minutes.

The multi-interval case is the same trap as the mpe walk, in the opposite direction. For the
mpe, `e` follows the load. For zero return, it does not — it is pinned to `e₁`. The governing
sentence is §3.3.3's last paragraph (quoted in §3 above): *"…particularly at or near zero,
load e = e₁."* Using the local `e` at zero would give a limit of 5 g instead of 0.5 g on the
2/5/15 kg example — a tenfold over-tolerance, and a report that passes an instrument it
should fail.

## 10. Temperature effect on no-load indication also uses e₁ — R 76-1 §3.9.2.3

Same principle, and not mentioned in CLAUDE.md at all: on a multi-interval or multiple-range
instrument the drift limit is expressed in `e₁`, not the local `e`. The rates themselves
(1 e per 5 °C generally, 1 e per 1 °C for class I) are as CLAUDE.md states. ✅

## 11. Span stability is a compound check — R 76-1 Annex B.4 / §5.3.3

CLAUDE.md does not describe its acceptance. It has two parts:
- **(a)** each individual error near Max must satisfy `|E| ≤ |mpe_initial|`; **and**
- **(b)** the *variation* across all measurements — `max error − min error` — must not exceed
  `max(0.5 × e, 0.5 × |mpe_initial|)`.

The "0.1 e" figure that appears on the printed form is not the pass/fail threshold; it governs
only whether one reading or five are needed per measurement.

⚠️ Worse for our design rule: **R 76-2's printed form 14 has no mpe column at all.** Its
acceptance is a graphical check against fixed bands of ±0.5e / ±1e / ±1.5e ("Maximum allowable
variation"). The standard's own form hardcodes e-multiples here, which is a genuine exception
to CLAUDE.md rule #2 — the rule pack has to carry the fixed bands as data for this form rather
than deriving them from the mpe resolver.

## 12. A fault of exactly e is permitted — R 76-1 §5.1.1, §T.5.5.6

K5's threshold is **strictly greater than** e. A fault of exactly e is explicitly allowed.
And there are **four** exclusions that CLAUDE.md's one-line summary omits entirely: faults
arising from simultaneous and mutually independent causes; faults implying the impossibility
of performing a measurement; faults so serious they are bound to be noticed by anyone
interested in the result; and transitory faults. Any of these excuses a fault larger than e.

## 13. Annex F — three corrections, two missing checks

1. ⚠️ **It is temperature *containment*, not overlap.** CLAUDE.md §6 says "temperature-range
   overlap". Annex F.4 item (2) requires the instrument's declared range to sit **inside**
   each module's rated range: `Tmin_module ≤ Tmin_WI` and `Tmax_module ≥ Tmax_WI`. Ranges can
   overlap and still fail. A test constructs exactly that case.
2. **Error apportionment has a floor as well as a ceiling** — §3.10.2.1: `pᵢ ≥ 0.3` where more
   than one module contributes, and a *weighing* module may take `pᵢ = 1`. CLAUDE.md gives
   only the `≤ 0.8` ceiling and the digital-may-be-zero exemption.
3. **Two required checks were missing from the summary**: accuracy-class correspondence
   (F.2.1 / F.3.1, Tables 13–14) and the indicator's own `n_ind ≥ n` (F.3.4) — the sibling of
   the load cell's `n_LC ≥ n`. Both are implemented.

Annex F.6.1 carries its **own worked example**, which the tests reproduce including its
`Q = 1.867`. Not implemented, and flagged rather than dropped: F.4 items (8)–(10) — minimum
input voltage, indicator input impedance, and extension-cable length versus cross-section.

## 14. Four R 76-2 forms do not fit the five-kernel model

The forms transcription turned up genuine gaps in the "17 forms reduce to 5 kernels" framing.
It is still a good framing — but it is 5 kernels plus four special cases, and the pitch should
say so rather than be caught out:

| Form | What does not fit |
|---|---|
| **5 Repeatability** | Not assigned a kernel in CLAUDE.md. Uses K1's error formula, but adds a *spread* check across ten weighings — `Emax − Emin ≤ \|mpe\|` (§3.6.1) — which matches no kernel. |
| **7 Stability of equilibrium** | Tagged K4 ("time-delta") but nothing on it is time-based. It is a fixed `≤ 1e` check on raw printed or stored readings, plus a zero-setting check against a fixed **0.25 e** rather than the resolved mpe. **Now implemented as K6** — the reduction is 5 kernels + K6 + three special cases. |
| **8 Tilting** | Not assigned a kernel. K1-shaped, but the *unloaded* check uses a fixed **2 e**, not the mpe; only the loaded check uses mpe. |
| **14 Span stability** | See §11 — no mpe column at all. |

Forms 5, 7, 8 and 14's special cases are recorded as `note` fields on their rule-pack entries.
Form 7 is **not implemented**.

## 15. Endurance excludes class I — R 76-1 Annex A.6

⚠️ **This was a live bug in the rule pack, now fixed.** Annex A.6 verbatim: *"Applicable only
to instruments of classes II, III and IIII with Max ≤ 100 kg."* The pack encoded only the Max
condition, so a class I analytical balance — which is well under 100 kg — came out as
requiring an endurance test it is exempt from. Fixed in pack v1.1.0; there is a regression
test that fails against the old rule.

## 16. `E` has three forms, not one — R 76-2 explanatory notes

The standard prints `E = I – L` **or** `= P – L` **or** `= I + ½e – ΔL – L`. CLAUDE.md §5
quotes only the third. The first applies when the rounding error is *not* eliminated
(`d ≤ 0.2 e`); the third when it is. The engine implements the choice and records which was
used per row.

Also: `E₀` is **per form, sometimes per measurement**, not one constant per report. Form 3.1
prints *"E₀ = error calculated at or near zero determined prior to each measurement"*, where
form 1 prints only *"at or near zero"*.

## 17. Class II\* tilting — the India-specific rule

`heading-a-raw.txt` reads *"Titting at no-load (class II\*, III and IIII)"* [sic — the typo is
in the source]. So the extra no-load tilting applies to **II\*, III and IIII, but not to plain
class II**. CLAUDE.md §7 mentions only that II\* gets extra no-load tilting, which is true but
incomplete.

## 18. Corpus figures

R 76-2's 17 numbered forms print as **36 separate form pages**, because several carry lettered
sub-pages each with their own PASSED/FAILED box (12.2a/b, 12.3a/b, 12.4a/b, 12.7a/b, 13a/b/c,
15a/b/c) and 4.1 splits three ways by indication type.

The checklist is **363 items**, not the ~200 estimated in the PRD:

| Checklist | Items |
|---|---|
| 17.1 All types except non-self-indicating | 215 |
| 17.2 Direct sales / price computing / labeling | 82 |
| 17.3 Electronic weighing instruments | 12 |
| 17.4 Software-controlled digital devices | 54 |
| **Total** | **363** |

Six items are marked `_uncertain` in the JSON where PDF extraction was ambiguous — form 12.7b's
acceptance note (which appears to be a copy-paste artefact in the standard itself), form 14's
graph page, and five checklist items whose printed clause reference was separated from its
text by the extraction. Each is flagged in the file rather than guessed silently.

## 19. The draft five-part edition — what actually changes

✅ Verified against `docs/standards/extracted/R76_Part3_test_report_format_CD.txt` and
`R76_Part4_type_evaluation_report_CD.txt`, and packaged as
`packages/rulepacks/OIML_R76_DRAFT_5PART.json`.

**Form 12.3 gains a third sub-item.** The 2007 form carries only *a) AC mains power supply* and
*b) Any other kind of power supply*. The draft adds *c) Surges on signal, data and control
lines* (Part 3, line 1748).

**Every cross-reference is renumbered.** The annexes became numbered subclauses, so form 1
cites `(R 76-2, 5.4.1) (6.3.1)` where the 2007 form cites `(A.4.4) (A.5.3.1)`. Every form in
the draft pack was re-cited from Part 3's own contents page; no annex reference survives.

**Forms 16 and 17, and the Summary, leave the test report.** Part 3 ends at form 15
(Endurance). The construction examination, the checklist and the Summary of type evaluation are
in Part 4, which also carries the language making the format mandatory under OIML-CS.

**Nothing metrological moves.** Table 3, Table 4 and Table 6, the in-service factor of 2, the
`d > 0.2 e` rounding condition and §3.10.4's family rules are all carried over unchanged.

`packages/engine/tests/edition-toggle.test.ts` asserts both halves of that: the engine resolves
an *identical* permissible error at every load of the worked example under either pack, and the
form numbering, sub-items and citations differ exactly as listed above. That pair is the whole
claim behind CLAUDE.md design rule #2 — an edition change is a different file, not a different
program — and it is now tested rather than asserted.

Run it: `TULASETU_RULESET=draft npx tsx apps/api/src/server.ts`. The pack declares itself a
draft, the server logs a warning at boot, and the UI badges it — a report computed against a
committee draft is otherwise indistinguishable from one computed against the standard in force.

---

## Open questions / not yet verified

- ❓ India's Heading A tables, re-checked line by line against `heading-a-raw.txt`. *(In
  progress — see `docs/research/heading-a-verified.md` when it lands.)*
- ❓ Annex G's software-identification requirements were read well enough to build the checksum
  validator, but have not been transcribed here clause by clause.
- ❓ Instruments with weighing ranges in two accuracy classes (§3.2 final paragraph) — not
  modelled.
- ❓ R 76-1 §3.4.4: *"For an instrument of class I with d < 0.1 mg, n may be less than
  50 000."* Recorded in the pack as a `classification_exceptions` entry; the validator does
  not yet apply it.
- ✅ ~~The draft 5-part edition's differences~~ — **verified and packaged.** See §19.
- ✅ ~~Form 7 (stability of equilibrium) is not implemented~~ — **done.** Implemented as **K6**,
  a sixth kernel, because the form genuinely does not reduce: the printed value must not deviate
  more than 1 e from the readings over the 5 s after print-out (and §A.4.12 allows no more than
  two adjacent values, one being the printed one), and zero-setting or tare balancing is checked
  against a fixed **0.25 e** — not the resolved mpe. Five trials each.
- ✅ ~~Annex F items (8)–(10) are not implemented~~ — **done.** (8) minimum input voltage, both
  in general `U = C·U_exc·R·DL/(E_max·N) ≥ U_min` and per scale interval
  `u = C·U_exc·R·e/(E_max·N) ≥ Δu_min`; (9) impedance `R_Lmin ≤ R_LC/N ≤ R_Lmax`; (10) cable
  `L/A ≤ (L/A)_max`. All three are *skipped rather than failed* when the certificates do not
  state the figures — a check that could not be performed is not a check that was passed.
- ❓ The ½e term at an exact changeover reading. §3.3.3 says the term is ½eᵢ or ½eᵢ₊₁ according
  to the partial range in which the indication `I + e` appears. The engine uses the range of
  the applied load, which differs only at exact boundary changeover readings.
- ❓ Load-cell figures used in the Annex F tests are **illustrative, not from datasheets**. The
  brand names (KELI, Zemic) are real and come from the certificate corpus; the numeric ratings
  are synthetic and marked `ILLUSTRATIVE` in the test file. Replace them with figures from the
  real OIML R 60 certificates before any of this goes on a slide.
