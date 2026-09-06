# Standards — reading map

The PDFs here are the primary sources. When implementing, read the PDF, don't trust memory.

| File | What it gives you |
|---|---|
| OIML_R76-1_2006_requirements.pdf | **The maths.** Table 3 (classification), Table 6 (mpe), §3.3 multi-interval + worked example, §3.5.3.2 rounding, §3.10.4 family (Table 8 example), Table 7 + Annex F (modules), Annexes A/B (test procedures), Annex G (software). |
| OIML_R76-2_2007_report_format.pdf | **The report layout.** 17 forms + checklist 17.1–17.4. Pixel reference for the PDF renderer. Formula chain + PASSED/FAILED/"– –" convention in the explanatory notes. |
| R76_Part1..5_CD.pdf | The **draft** 5-part split (future edition). Part 3 = test report format, Part 4 = type evaluation report format. Cross-references renumbered; new 12.3(c) surge test; checklist moved. Evidence for the versioned-rule-pack design. |
| OIML_D31_2019_software_requirements.pdf | Software risk levels — informs checklist 17.4 and the C-DAC facility boundary. |
| OIML_B18_2022_OIML-CS_rules.pdf | OIML-CS scheme (why the R-76 format is mandatory for export). |
| Australia_Comments_on_R76_draft.pdf | Real reviewer comments on the draft — useful context on what's changing. |

Golden-test anchors (implement tests from these first):
- Multi-interval mpe walk: R-76-1 §3.3 worked example (2/5/15 kg, class III).
- Family solver: R-76-1 §3.10.4 Table 8 (8 variants → test 1.2, 2.1, 2.4).
- Error calc: R-76-2 explanatory notes example (1 kg load, e=5g → E = +1 g, Ec = +0.5 g).
