# India — Seventh Schedule, Heading A (extract & notes)

Source: Legal Metrology (General) Rules, 2011 → Rule 13 → Seventh Schedule, Heading A
("Specifications for Non-Automatic Weighing Instruments"). Full raw text: `heading-a-raw.txt`.

## Key finding: India ≈ OIML R-76
India's Heading A is a near-verbatim adaptation of OIML R-76-1. Accuracy classes, e-forms
(1/2/5 ×10^k), the classification table (Table 17 = OIML Table 3), the MPE table
(Table 20 = OIML Table 6, ±0.5e/1e/1.5e with identical boundaries), multi-interval rules,
and in-service = 2× — all match. **=> one engine, one maths, two output profiles.**

## Quirks the engine must handle (India-specific)
1. **Class symbol IV vs IIII.** India's tables say "IV" for ordinary class, but its own test-
   procedure text says "IIII" — used interchangeably in the SAME document (IV appears ~11×,
   IIII ~7×). Normalize via rule-pack aliases.
2. **Class II\*** = class II instruments intended for DIRECT SALES TO THE PUBLIC. Not in OIML.
   Affects tilting applicability (extra no-load tilting). Add as an applicability branch.
3. Numbering differs from OIML (India: 9 test sections + Annexure A; OIML: Annexes A/B).
   Build a mapping table India §9(x) ⇄ R-76-2 form-number (see full-research.md §2.3).

## Test list (India §9) — maps to R-76-2 forms
(1) Evaluation of error  (2) Weights  (3) Weighing tests  (4) Substitution method
(5) Tare  (6) Eccentricity  (7) Discrimination  (8) Repeatability  (9) Creep
(10) Zero return  (11) Influence factors [tilting, temperature]  (12) Warm-up
(13) Temperature tests  (14) Voltage variation  (15) Endurance
Plus Annexure A: influence-factor performance tests, power voltage variations, span stability;
Table 43-A classifies damp heat & voltage as influence factors, and dips/bursts/ESD/EM as disturbances.

## Exact thresholds pulled (verify against raw before coding)
- Creep: terminate at 30 min if indication differs < 0.5e during first 30 min AND
  < 0.2e between 15 and 30 min; else run 4 h, ΔP ≤ |mpe|. Temp must not vary > 2°C.
- Zero return: deviation ≤ 0.5e (multi-interval: 0.5e₁; multiple-range: 0.5eᵢ from Maxᵢ,
  and after returning from > Max₁ to lowest range, near-zero must not vary > e₁ for 5 min).
- Classification (Table 17): I e≥0.001g n≥50000 Min=100e · II e 0.001–0.05g n 100–100000
  Min 20e; e≥0.1g n 5000–100000 Min 50e · III e 0.1–2g n 100–10000 Min 20e; e≥5g n 500–10000
  Min 20e · IV e≥5g n 100–1000 Min 10e.
