# India — Seventh Schedule Heading A, verified against the raw text

This is the line-by-line check `docs/VERIFIED.md` §8 asked for. `docs/research/heading-a-extract.md`
is a second-hand summary; every claim in it is checked here against
`docs/research/heading-a-raw.txt` (1461 lines, OCR of the Legal Metrology (General) Rules, 2011,
Seventh Schedule, Heading A, via Indian Kanoon). Line numbers below are line numbers in
`heading-a-raw.txt` unless stated otherwise; OIML line numbers refer to
`docs/standards/extracted/OIML_R76-1_2006_requirements.txt`.

Status legend (same as `docs/VERIFIED.md`): **✅ verified verbatim** · ⚠️ verified with a caveat ·
❓ could not verify.

---

## 1. Table 17 (classification) vs OIML Table 3

✅ **Verified verbatim — identical to OIML Table 3.** Table 17, lines 319–342:

```
Accuracy class   Verification scale interval   n = Max/e (min–max)   Minimum capacity
Special I        0.001 g ≤ e                   50000* – (none)       100 e
High II          0.001 g ≤ e ≤ 0.05 g          100 – 100000          20 e
High II          0.1 g ≤ e                     5000 – 100000         50 e
Medium III       0.1 g ≤ e ≤ 2 g               100 – 10000           20 e
Medium III       5 g ≤ e                       500 – 10000           20 e
Ordinary IV      5 g ≤ e                       100 – 1000            10 e
```

Every e-range, n-range and min-capacity multiple matches `OIML_R76_2006.json`'s
`classification` array exactly, row for row. Class I's n_max prints as "–" (line 326), which is
the same "unbounded" fact the OIML pack encodes as `n_max: null`.

Also verified: the class-I exception at line 377–378 — *"for an instrument of class I with d <
0.1 mg, n may be less than 50000"* — word-for-word the same condition as
`OIML_R76_2006.json`'s `classification_exceptions[0]` (OIML §3.4.4). India's own clause anchor is
paragraph 3, sub-paragraph (5), clause (v) (the clause sits, oddly, inside the "Auxiliary
indicating devices" sub-paragraph, not a "classification" one — that is where the raw text
places it, line 363 onward).

## 2. Table 20 (mpe) vs OIML Table 6

✅ **Verified verbatim — identical to OIML Table 6.** Table 20, lines 384–399:

| band | Class I | Class II | Class III | Class IV |
|---|---|---|---|---|
| ±0.5e | Min ≤ m ≤ 50000 | Min ≤ m ≤ 5000 | Min ≤ m ≤ 500 | Min ≤ m ≤ 50 |
| ±1e | 50000 < m ≤ 200000 | 5000 < m ≤ 20000 | 500 < m ≤ 2000 | 50 < m ≤ 200 |
| ±1.5e | 200000 < m | 20000 < m ≤ 100000 | 2000 < m ≤ 10000 | 200 < m ≤ 1000 |

Every boundary number matches OIML Table 6 exactly (`docs/VERIFIED.md` §1). The only textual
difference is cosmetic: India phrases the open lower end as "Min ≤ m" (Min = the instrument's own
minimum capacity) where OIML prints "0 ≤ m" for the same row — not a numeric difference, and
irrelevant to `resolveMpe`, which only ever tests the upper bound of each band.

## 3. In-service (inspection) mpe = 2×

✅ **Verified verbatim.** Line 400–401: *"Values of maximum permissible errors in
inspection — The maximum permissible errors during inspection shall be twice the maximum
permissible errors allowed on verification."* India calls the post-verification stage
"inspection" rather than "in-service" (confirmed again at line 204: *"MPE2 = maximum permissible
error in service (inspection)"* — the two terms are used as synonyms in the same document), but
the factor is the same 2×. Clause: Heading A §3(6)(ii).

## 4. Multi-interval rules vs OIML Table 4 / §3.3

✅ **Verified verbatim — identical to OIML Table 4.** India's Table 18, lines 359–361:

```
Class          I        II       III      IV
Max_i/e_{i+1} ≥ 50000  ≥ 5000   ≥ 500    ≥ 50
```

Matches `OIML_R76_2006.json`'s `multi_interval_boundary` exactly (`{I:50000, II:5000, III:500,
IIII:50}`). The surrounding definitions (partial range, e_i / Max_i / Min_i, n_i = Max_i/e_i) are
reproduced almost verbatim at lines 351–356, and multiple-range instruments get the identical
"each range treated as an instrument with one range" rule (line 347). One gap: line 355–356
references *"Table 40"* for the partial-range classification requirements ("e_i and n_i in each
partial weighing range... shall comply with the requirements given in Table 40") but **Table 40's
body is not present anywhere else in the 1461-line extract** — only the cross-reference survives
whatever OCR/extraction step produced this file. ❓ Could not verify Table 40's content directly;
by construction it must restate Table 17's per-class e/n bounds applied to each partial range, but
that is inference, not a checked quote.

## 5. The IV vs IIII inconsistency — real counts

The extract's claim ("IV ~11×, IIII ~7×") is **partly wrong**. Recounted directly:

- **`IIII`** (whole word): **7 occurrences** — lines 603, 1273, 1274, 1277, 1285, 1287, 1328.
  Extract's ~7 estimate ✅ correct.
- **`IV`** (whole word, accuracy-class sense): **13 occurrences**, not ~11 — lines 298, 342, 360,
  390, 447, 486, 766, 979, 981, 1017, 1055, 1088, 1184.

⚠️ **Correction to the extract**: IV appears 13 times, not "~11". All 13 are genuine accuracy-class
uses (Table 15's symbol column, Table 17/18/20, the tilting/sensitivity/repeatability/direct-sale
clauses) — none are a false match on a Roman numeral inside another word (`\bIV\b` with a preceding
or following `I`/`V`/`X` would not match, and manual inspection of all 13 lines confirms each is a
genuine class reference). `IIII` is used exclusively in the tilting (§11) and endurance (§9(15))
procedure text, plus one sensitivity-of-reading clause (line 603) — i.e. governing-body text
mirrors OIML's "IIII", while the classification tables (15, 17, 18, 20) and most prose use "IV".
The underlying finding — both spellings are used for the same class in the same document — is
confirmed; only the count was off.

## 6. Class II\* — verbatim definition

✅ **Verified verbatim.** Line 1264–1266: *"In the text that follows, class II instrument
intended for direct sales to the public are designated class II\* and class II Instrument not
intended for direct sale to the public are designated class II."*

What it actually changes (lines 1273–1287, the tilting sub-tests under §11(i)):

- **(a) Tilting at no-load — "class II\*, III and IIII"** (line 1274) only. Plain class II is
  **not** in this list.
- **(b) Tilting when loaded — "class II, II\*, III and IIII"** (line 1277) — both plain class II
  and class II\* get the loaded-tilting sub-test.
- (c) Class I has its own simpler rule (tilt check against the level-indicator limit only).
- (d) An instrument without a level indicator falls back to (a) and (b), tilted 5% instead of
  0.2% (line 1285–1287).

So the extract's characterization ("extra no-load tilting for class II\*") is ✅ correct and now
quoted precisely: class II\* gets both the no-load *and* loaded sub-tests; plain class II gets only
the loaded one.

## 7. India §9 test list ⇄ R 76-2 form mapping

✅ Confirmed against the raw text, "9. Test procedure during verification and inspection"
(heading at line 1194) through "(15) Endurance test" (line 1328), plus "Annex-A / Annexure A —
Additional Tests for Electronic instruments for Model Approval" (line 1339 onward).

| Heading A § | Title (raw text) | R 76-2 form(s) | Raw-text line |
|---|---|---|---|
| 9(1) | Evaluation of error | 1 (error formula, used by every K1 form) | 1196 |
| 9(2) | Weights (standard-weight tolerance) | — (equipment requirement, no form) | 1199 |
| 9(3) | Weighing tests | 1 | 1204 |
| 9(4) | Weighing test using substitution method | 1 (alternate method) | 1210 |
| 9(5) | Tare | 9 | 1222 |
| 9(6) | Eccentricity test | 3.1 / 3.2 (rolling load, (iv)) | 1225–1236 |
| 9(7) | Discrimination test | 4.1 | 1237 |
| 9(8) | Repeatability test | 5 | 1244 |
| 9(9) | Creep test | 6.2 | 1246 |
| 9(10) | Zero return test (+ embedded stability-of-equilibrium sub-test) | 6.1, and 7 | 1250, 1255 |
| 9(11) | Influence factors — tilting | 8 | 1259 |
| 9(12) | Warm-up time test | 10 | 1288 |
| 9(13) | Temperature tests | 2 (+ Annex-A §1 static temps) | 1294 |
| 9(14) | Voltage variation | 11 | 1318 |
| 9(15) | Endurance test | 15 | 1328 |
| Annex-A §1 | General EUT requirements | — (procedural precondition) | 1343 |
| Annex-A §2(1) | Static temperatures | 2 | 1363 |
| Annex-A §2(2) | Damp heat, steady state | 13 | 1368 |
| Annex-A §3(1) | Short-time power reductions | 12 (a "dips" sub-case) | 1381 |
| Annex-A §3(2) | Burst | 12 | 1392 |
| Annex-A §3(3) | Electrostatic discharge | 12 | 1399 |
| Annex-A §3(4) | Immunity to radiated EM fields | 12 | 1412 |
| Annex-A §4 | Span stability test | 14 | 1424 |

Confirms the extract's 15-item + Annexure-A structure. Two things the extract did not call out:

- Annexure A's disturbance section has **only 4 sub-tests** (power reductions, burst, ESD,
  radiated-EM immunity), matching how `OIML_R76_2006.json` already collapses OIML's finer-grained
  12.1–12.6 breakdown into one `"disturbances"` test (form "12"). Fine — no discrepancy against the
  *pack*, just against a literal 12.1/12.2/12.3/12.4 split.
  - It does **not** have anything corresponding to OIML form **12.7** (road-vehicle supply
    disturbances) — see §8 below.
- There is **no discrete "form 16" (examination of construction) or "§17" checklist section**
  anywhere in Heading A — see §8.

## 8. Where India differs from OIML (beyond the known IV/IIII and II\* quirks)

This is the substantive part of the brief ("if you find none beyond the known quirks, say so").
Four real differences were found:

### 8a. Discrimination — non-self-indicating extra load: no "0.4×" factor

OIML R 76-1 §3.8.1 (`docs/standards/extracted/OIML_R76-1_2006_requirements.txt` lines 1414–1417):
*"An extra load equivalent to **0.4 times** the absolute value of the maximum permissible error
for the applied load, but not less than 1 mg, ... shall produce a **visible displacement**."*

Heading A §3(8)(i) (line 435–438): *"Non-self indicating instrument — An extra load equivalent to
**the value of the maximum permissible error** for the applied load when gently placed or
withdrawn from the instrument at equilibrium shall produce movement **as required under
sub-paragraph (1) of paragraph 6**"* — i.e. it cross-references the minimum-sensitivity clause
(§6(1), the 1/2/5 mm displacement test) directly, using the **full** mpe as the extra load, not
0.4×mpe, and with no "not less than 1 mg" floor.

⚠️ Verified with caveat: the wording difference (missing "0.4 times", missing the 1 mg floor,
different pass criterion) is verbatim-confirmed; what it *means* for K2 requires interpreting the
cross-reference to §6(1), which is a reasonable but not 100%-certain reading. Encoded in
`IN_Sch7A_2011.json`'s `kernel_params.discrimination.non_self_extra_load_fraction` as `1.0` (not
OIML's `0.4`), with a note. This is a genuine, citable legal difference between the two profiles,
not a copy-paste oversight — do not "fix" it to match OIML without re-reading Heading A.

### 8b. Discrimination — no "d ≥ 5 mg" exemption for digital indication

OIML §3.8.2.2 (same file, lines 1424–1427): *"An additional load equal to 1.4 times the actual
scale interval... **This applies only to instruments with d ≥ 5 mg.**"*

Heading A's digital-indication clause, §3(8)(ii)(b) (line 442–444): *"An additional load equal to
1.4 times the actual scale interval, when gently placed on or withdrawn from the instrument at
equilibrium shall change the initial indication."* — full stop. The very next sentence starts a new
sub-paragraph, (9) ("Variation due to influence quantities and time"). **No "applies only to d ≥ 5
mg" sentence anywhere near it.**

✅ Verified verbatim (as an absence): the exemption sentence is not there. The 1.4× factor itself
is identical to OIML. `IN_Sch7A_2011.json`'s `discrimination` test therefore uses
`"applies": { "always": true }` — not OIML's `"not": { "digital_d_lt_5mg": true }` — because
Heading A gives no textual basis for exempting low-`d` digital instruments from this test.

### 8c. No family/EUT-selection provisions (OIML §3.10.4) and no Annex-F module-compatibility equations

Grepping the full 1461-line file for `family`, `variant`, `module` (metrological sense), and
`OIML`/`R-76`/`R 76` returns **zero matches** relevant to family testing or module apportionment
(the only "Module" hit, line 64, is a construction-vocabulary definition, and the only
"load cell"/"module" hits at lines 527/64 are incidental). Heading A also never mentions OIML or
R 76 by name anywhere — it is a free-standing text, not an incorporation-by-reference.

✅ Verified verbatim (as an absence). `IN_Sch7A_2011.json` therefore **omits** `family_solver` and
`module_error_fractions` entirely, with a `notes` field explaining why, rather than copying OIML's
§3.10.4 / Annex F constants under an Indian clause number that does not exist. In practice, a lab
testing a family of variants or a modular (indicator + load cell) instrument under the Indian
profile has no textual basis in Heading A for a reduced test set or an apportionment check — Rule
7(1)(a)'s "either profile" option is the route to use OIML's provisions for that determination.
This is a product-level decision the team should be aware of, not something this rule pack can
paper over.

### 8d. No R 76-2-style "form 16" / "§17 checklist" apparatus, and no form-12.7 equivalent

Heading A is essentially India's version of **R 76-1** (requirements) plus a short **test
procedure** section (§9) and an **Annex-A** (electronic-instrument tests) — it does not carry
anything shaped like R 76-2's *report format*, so:

- No "examination of the construction" as a discrete numbered form (OIML form 16) — construction
  requirements exist (scattered through Heading A §4), but not as a checklist item with its own
  number.
- **Zero occurrences of "software" or "17.1/17.2/17.3/17.4"** anywhere in the file — there is no
  checklist apparatus at all. Software/interface integrity requirements do exist substantively
  (§4(3)(vi), lines 930–939: interface must not allow falsifying results, changing adjustment, or
  falsifying the primary indication for direct sales), and direct-sales requirements exist
  substantively (§4(14)/(15) region, lines 765–864), but neither is packaged as a numbered
  "checklist". `IN_Sch7A_2011.json` therefore does **not** ship a `checklist_rules` block — adding
  one under invented Indian clause numbers would violate "never invent a clause number" more than
  it would help. A report under the India profile that needs checklist-style output should draw on
  the OIML profile's `checklist_rules` for that section (again via Rule 7(1)(a)).
- No form-12.7 equivalent (road-vehicle supply disturbances) — see §7 above. Omitted from the pack
  for the same reason as 8c: no textual basis to attach it to an Indian clause.

### Everything else checked and found identical

For completeness, every other numeric threshold this task's Task 2 needed was independently
re-derived from the raw text (not copied from the OIML pack) and found to match:

- Sensitivity (non-self-indicating) displacement: 1 mm (class I/II), 2 mm (class III/IV, Max ≤
  30 kg), 5 mm (class III/IV, Max > 30 kg) — Heading A §6(1), lines 972–981. Identical to OIML §6.1.
- Analogue-indication discrimination: extra load = mpe, displacement ≥ 0.7 × extra load — Heading A
  §3(8)(ii)(a), lines 438–441. Identical to OIML §3.8.2.1.
- Creep: terminate at 30 min if < 0.5e (first 30 min) and < 0.2e (between 15–30 min), else run 4 h
  against |mpe| — Heading A §3(9)(iv)(a), lines 494–500. Identical to OIML. (Note: the separate,
  narrative creep-test description at §9(9), line 1246–1250, prints *"the difference between 15
  and 30 minutes is less than 2°C"* — this is almost certainly OCR corruption of "0.2e" bleeding in
  the neighbouring "temperature should not vary more than 2°C" sentence; the numerically load-bearing
  version at §3(9)(iv)(a) is unambiguous and is what the rule pack uses.)
- Zero return: ≤ 0.5e; multi-interval ≤ 0.5e₁; multiple-range ≤ 0.5e₁ from Max₁, plus a secondary
  "≤ e₁ over the next 5 minutes" check after switching down to the lowest range — Heading A
  §3(9)(iv)(b), lines 501–506. Identical to OIML §3.9.4.2.
- Temperature drift at zero: ≤ 1e per 1°C for class I, ≤ 1e per 5°C for other classes — Heading A
  §3(9)(ii)(c), lines 486–489. Identical to OIML §3.9.2.3.
- Tilting angle and no-load threshold: 2/1000 tilt, 2e at no load (line 452, "except instruments of
  class II" — i.e. plain class II is excused even from the *loaded* 2e-style no-load check, which
  is consistent with §11(i)(a) excluding plain II from the no-load sub-test entirely). Identical to
  OIML §3.9.1.1.
- Span stability: variation ≤ half of e or half of |mpe(initial)|, whichever is greater — Heading A
  Annexure A §4, lines 1450–1453. Identical to OIML Annex B.4.
- Significant fault: "a fault greater than e", with the same four exclusions (simultaneous
  independent causes; impossible to measure; obviously wrong; transitory) — Heading A §5(5)(vi),
  lines 218–224. Identical to OIML.
- Endurance: applicable only to classes II, III, IIII with Max ≤ 100 kg, performed last — Heading A
  §9(15), lines 1328–1329, *more explicit than OIML on this point* (OIML's class restriction is in
  Annex A.6, not directly under its own §3.9.4.3 sentence). Identical outcome.
- Damp heat exemption (class I, or class II with e < 1 g) and span-stability exemption (class I) —
  Annexure A §2(2) (line 1368) and §4 (line 1426). Identical to OIML.
- Voltage variation severity: −15% to +10% of marked voltage — Heading A §3(9)(iii) (line 491–492)
  and Annex-A test-severity table (line 1323–1324). Identical to OIML.

### One item that could not be verified either way

- **"Eliminate rounding error only when d > 0.2e"** (OIML §3.5.3.2). Searched exhaustively
  (`0.2`, "rounding", "eliminat*", "actual scale interval") — Heading A never states this specific
  conditional rule. Its own worked "Evaluation of error" procedure (§9(1), line 1196–1199) gives
  the formula `P = I + ½e − ΔL`, `E = P − L = I + ½e − L − ΔL ≤ mpe` unconditionally, without the
  `d > 0.2e` gate OIML's report-format explanatory notes attach to it. ❓ Could not verify — neither
  confirmed nor contradicted. `IN_Sch7A_2011.json` keeps the same `0.2e` threshold (it is a
  reasonable metrological constant and the formula itself is identical) but the pack's
  `rounding_elimination_clause` says plainly that this specific conditional was not located in
  Heading A's own text, so nobody downstream mistakes it for a verified Indian citation.

---

## Summary for the team

Table 17, Table 20, in-service ×2, and the multi-interval Table 18 are **verified identical** to
OIML — one engine, one set of maths, confirmed at the primary-source level, not just asserted by
the extract. The IV/IIII split and class II\* tilting behaviour are real and now quoted verbatim
with the correct counts (IV: 13, not ~11). The genuine divergences that justify a *separate* rule
pack (rather than just a relabelled OIML pack) are: (a) the discrimination test's non-self-indicating
load factor and its missing "d ≥ 5 mg" carve-out, and (b) the complete absence of family/EUT
selection, Annex-F module compatibility, and any R 76-2-shaped checklist/form-16/form-12.7
apparatus in the Indian text. Those four points are where `IN_Sch7A_2011.json` legitimately
differs from `OIML_R76_2006.json` in structure, not just in citation text.
