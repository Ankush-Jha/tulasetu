# Taraazu — pitch video script (SIH26035)

**Format:** one presenter, face-cam over a screen recording of https://taraazu.vercel.app · **Length:** 5:00 (~597 spoken words) · **Language:** English · **Interactive:** four pause-and-guess challenges · **Demo:** a report built live, then the signed `TS-DEMO-0001`

The PDF copy is `docs/PITCH_VIDEO_SCRIPT.pdf`; both are built from one source.

## Before you hit record

1. Record the morning after a nightly reset (02:00 IST), so the demo reports are clean.
2. Browser at 125% zoom and 1920×1080; bookmarks bar hidden; notifications off.
3. Tab 1: sign-in page. Tab 2 (second browser profile): the Director on /reports/TS-DEMO-0001/overview.
4. Do one dry run of segments 02–05 and confirm the “26 apply · 8 excused” count.
5. Face-cam bottom-right at about 20% of the frame. Look into the lens on every challenge card.
6. Replace [Name] and Team [Name] before recording.

---

## 00 · Sign-in: the hook  (0:00 – 0:30)

**[SCREEN]** Tab 1 on the sign-in page. Speak first, then click A. Assistant (MA) at the end.  
**[CALLOUT]** Title card: Taraazu · SIH26035 · Department of Consumer Affairs

> Every weighing scale sold in India, from your kirana shop to a forty-tonne weighbridge, needs model approval from the Department of Consumer Affairs first. That approval rests on a sixty-two-page test report under OIML R 76. It's full of calculations, and government labs still fill it in by hand, in spreadsheets.
>
> I'm [Name], and this is Taraazu. We don't fill that report. We compute it.
>
> Three officers, three roles, as the Rules lay out: the Assistant records, the Assistant Director reviews, the Director approves. I'll sign in as the Assistant.

---

## 01 · Dashboard  (0:30 – 0:45)

**[SCREEN]** Hover over the four counters, then the annual-return tiles.  
**[CALLOUT]** Box around: Models tested · Fees realised · Median turnaround

> Here are the reports in process, completed, and sent back. And these tiles are the annual return that Rule 4(9) already requires: models tested, fees and time taken, all computed, never typed.

---

## 02 · New report  (0:45 – 0:55)

**[SCREEN]** Sidebar → New report. Open Conformity profile, pick the Seventh Schedule, fee 25000, create.  
**[CALLOUT]** Highlight the dropdown: Seventh Schedule (India) · OIML R 76

> Every report starts by choosing its rulebook: India's Seventh Schedule or OIML R 76. The law allows either.

---

## 03 · Instrument profile  (0:55 – 1:35)

**[SCREEN]** Class III, multi-interval, Max 2 / 5 / 15 kg, e 1 / 2 / 10 g, electronic, self-indicating. Type 8100kb in Checksum and save.  
**[CALLOUT]** Zoom in on the finding under “Worth checking”.

> This is the standard's own worked example: a class III scale with partial ranges up to 2, 5 and 15 kilos, where the scale interval grows with the load.

🟡 **CHALLENGE**. Card: *Is “8100kb” a valid software checksum?*
> I've typed “8100kb” as the software checksum. Pause the video: is that valid? *(2-second beat)*
**[CALLOUT]** Zoom on the red finding
> It's a file size, not a checksum. We found values like this on real certificates in the public register. Taraazu catches it the moment it's typed. *[Fix it to a hex value, save, Next.]*

---

## 04 · Tests: the automatic test list  (1:35 – 1:55)

**[SCREEN]** Scroll past the applicable forms and stop on one marked “– –”.  
**[CALLOUT]** Big number: 26 apply · 8 excused, with an arrow to one excuse reason.

> Taraazu decides which tests apply. Here twenty-six forms apply and eight are excused, and each one carries the clause that excuses it. No two labs can disagree on what had to be tested.

---

## 05 · Observations: the engine  (1:55 – 2:55)

**[SCREEN]** Weighing performance form. Type correct readings at 500, 2000, 4000, 4200, 10000 g. The verdicts turn green.  
**[CALLOUT]** Formula strip: E = I + ½e − ΔL − L · Ec = E − E₀ · pass if |Ec| ≤ mpe

> This is where the spreadsheet used to be. I type what the scale showed, and the error, the permissible limit and the verdict are computed live with the standard's own formula.

🟡 **CHALLENGE**. Card: *Same scale: 4,000 g vs 4,200 g. Is the permissible error the same?*
> Four thousand grams against four thousand two hundred, on the same scale and in the same partial range. Is the allowed error the same? Pause. *(2-second beat)*
**[CALLOUT]** Zoom on the mpe column: ±2 g → ±3 g
> No. Plus or minus two grams becomes plus or minus three, while nothing changes on the display. That's the row a spreadsheet gets wrong. *[Type ~12 g over at 5,000 g. It turns red.]* A bad reading fails immediately, with the limit it broke. And there's no AI in this calculation, on purpose: OIML says AI isn't court-proof for legal metrology yet.

---

## 06 · The finished report  (2:55 – 3:15)

**[SCREEN]** Switch to Tab 2 (Director, TS-DEMO-0001). Overview, then quickly scroll Checklist and Attachments.  
**[CALLOUT]** Status pill: PUBLISHED · three signatures ✓

> This report went the whole way: recorded, reviewed, signed by all three officers, locked and published. The 363-item checklist, the model photo and the sealing diagram are all part of it.

---

## 07 · Audit trail and outputs  (3:15 – 3:55)

**[SCREEN]** Click Report. Scroll to “The chain verifies” and the signatures, then up to Download → PDF.  
**[CALLOUT]** Three labels: PDF, the record · DOCX, watermarked review copy · JSON, for machines

🟡 **CHALLENGE**. Card: *Someone edits one reading after the Director signs. Would anyone know?*
> If someone changed one reading after the Director signed, would anyone know? Pause. *(2-second beat)*
**[CALLOUT]** Highlight “The chain verifies”
> Yes. Every entry is hash-linked to the one before it, and every signature covers the whole chain. Change one number and the chain stops verifying. A correction is a new entry, and the original stays. *[Open the PDF.]* Then the report itself, in the R 76 layout, bilingual in Hindi and English. The PDF is the record, the Word file is a watermarked review copy, and the JSON is for machines. They all come from one computed document, so they can't disagree.

---

## 08 · Family solver  (3:55 – 4:20)

**[SCREEN]** Sidebar → Family solver. Table 8 is preloaded. Ask the question first, then press Solve.  
**[CALLOUT]** Zoom: 1.2 · 2.1 · 2.4 and the generated coverage clause

🟡 **CHALLENGE**. Card: *8 variants of one scale. How many must be physically tested?*
> A manufacturer submits eight variants of one design. How many must the lab physically test? Pause. *(2-second beat)*
**[CALLOUT]** Press Solve
> Three. That's exactly the answer in the standard's own table, and it writes the certificate's “shall also cover” clause too.

---

## 09 · Quick tour  (4:20 – 4:40)

**[SCREEN]** Modules → Rule pack (point at the mpe table) → Statistics. About 6 s each.  
**[CALLOUT]** Caption on Rule pack: The standard is data, not code

> Modules checks an indicator and a load cell before any testing. The rule pack is the standard as data, so when R 76 is rewritten from two parts into five, we swap this file, not the code. And Statistics files the annual return.

---

## 10 · Close  (4:40 – 5:00)

**[SCREEN]** Back to the dashboard. Face-cam full screen for the last line (optional).  
**[CALLOUT]** End card: taraazu.vercel.app · SIH26035 · Team [Name]

> Putting applications online halved approval time, from six to nine months down to three or four. Taraazu digitises the half that's still on paper. Every lab gets the same rulebook, a tamper-evident record, and not one hand calculation. Try the challenges yourself at taraazu.vercel.app. Thank you.

---

## YouTube description

```
Taraazu computes the OIML R 76 type-evaluation test report for non-automatic weighing instruments (NAWI), the report behind every model approval of a weighing scale in India. Built for Smart India Hackathon 2026, problem statement SIH26035 (Department of Consumer Affairs, Legal Metrology).

Try it: https://taraazu.vercel.app

0:00 The problem, and signing in
0:30 Dashboard and the Rule 4(9) annual return
0:45 New report: Indian or OIML rulebook
0:55 Instrument profile (Challenge 1)
1:35 Automatic test list
1:55 The calculation engine (Challenge 2)
2:55 A fully signed report
3:15 Audit trail and outputs (Challenge 3)
3:55 Family solver (Challenge 4)
4:20 Modules, rule pack, statistics
4:40 Close

A Smart India Hackathon 2026 prototype, not an official publication of any department.
```
