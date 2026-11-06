# Before / after — the workflow itself

## Today — desk to desk (spreadsheet / document template, one copy, hand-carried)
1. MA benches the instrument, types results into a spreadsheet — formulas re-entered per lab, per officer.
2. File emailed or walked to AD/DD — no record of who has the current version.
3. AD/DD re-checks arithmetic by hand — the exact error class the Problem Statement names.
4. Corrections mailed back to MA, re-typed — original readings are not distinguishable from edits.
5. Director reviews a static document — no way to see the applicability logic that produced it.
6. Rule 4(9) annual return compiled by hand from every file, once a year.

## TulaSetu — direct to the person (one report record, role-gated actions, computed once)
1. MA enters readings; the engine computes E, Ec, mpe, verdict live — the same pure functions the golden tests exercise.
2. Submit routes the record itself to the AD/DD queue — no file leaves anyone's hands.
3. AD/DD reviews the computed verdict, not the arithmetic — deficiencies logged against the report, not a new copy.
4. A returned deficiency reopens the same record — original observation kept; correction is a new event.
5. Director sees applicability reasons, signatures, hash chain — Ed25519-signed, re-verified on every read.
6. Rule 4(9) annual return is one dashboard click, always current.

## The PS's own diagnosis (quote this directly on a slide)
> Reports are "largely prepared manually using spreadsheets or document templates, making the process time-consuming, prone to calculation errors and lacking uniformity."
— SIH26035, Department of Consumer Affairs

## Why "Jira, not desk-to-desk"
Nobody attaches a file to an email and hopes the latest version is the one being reviewed. The report is a single addressable record; a reviewer's action changes its *state*, not its content history. Every prior reading stays in the log even after a correction — ISO/IEC 17025 §7.8's own requirement, not a nicety.
