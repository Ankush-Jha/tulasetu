/**
 * The briefing content, in one place.
 *
 * A judge arriving at this prototype has perhaps ten minutes and no context. Everything they
 * need is here rather than scattered across pages, and every claim carries its source so it can
 * be checked rather than believed — the numbers come from `docs/PRD.md`, the thresholds from
 * `docs/VERIFIED.md`, the register findings from `docs/certificates/certificates-analysis.md`.
 *
 * Two rules for editing this file:
 *
 *  1. **Every figure names where it came from.** If a number has no source it does not belong
 *     here. CLAUDE.md §10: never invent a statistic for the pitch; if it is an estimate, say so.
 *  2. **Claims about the software are claims about *this* build.** "Implemented" means there is
 *     a test; "partial" and "not built" are used where they are true. A briefing that overstates
 *     is worse than no briefing, because the first thing a judge does is click through.
 */

export interface Sourced {
  claim: string;
  detail?: string;
  source: string;
}

// ---------------------------------------------------------------------------
// The problem
// ---------------------------------------------------------------------------

export const PROBLEM_STATEMENT = {
  id: "SIH26035",
  organisation: "Department of Consumer Affairs (DoCA), Ministry of Consumer Affairs, Food & Public Distribution",
  title:
    "Software application for automating test data recording, compliance evaluation and generation of " +
    "standardised test reports for Non-Automatic Weighing Instruments as per OIML R 76",
  category: "Software",
  /** The PS's own words about why it exists. */
  quotedGrievance:
    "Reports are largely prepared manually using spreadsheets or document templates, making the " +
    "process time-consuming, prone to calculation errors and lacking uniformity.",
  datasetPointer: "Legal Metrology Act, 2009 · Legal Metrology (General) Rules, 2011",
};

export const HOW_IT_WORKS_TODAY: { step: string; state: "digital" | "manual"; note: string }[] = [
  { step: "Application, fee, RRSL assignment", state: "digital", note: "Handled by the model approval portal, now e-Maap." },
  { step: "Model received at the laboratory", state: "digital", note: "Recorded on the portal." },
  { step: "Bench testing — around 17 R 76 tests", state: "manual", note: "Readings on paper at the bench." },
  { step: "Report prepared", state: "manual", note: "Spreadsheets or document templates. This is where the errors enter." },
  { step: "AD / DD re-verification", state: "manual", note: "Recalculating by hand what a spreadsheet already computed." },
  { step: "Director (LM) approval", state: "manual", note: "Paper chain to the Central Government." },
  { step: "Certificate issued and published", state: "digital", note: "Published under AoM Rule 11(4)." },
];

export const ANCHOR_STATISTIC: Sourced = {
  claim: "6–9 months → 3–4 months",
  detail:
    "End-to-end model approval time after the application side went online. Digitising the " +
    "application produced the first halving. The remaining 3–4 months is bench testing plus the " +
    "paper report chain — which is what this addresses.",
  source: "DoCA Annual Report 2022-23",
};

export const SCALE: Sourced[] = [
  { claim: "~645 certificates a year", detail: "Certificate #362 issued by 24 Jul 2026 — a run-rate, not a published figure.", source: "lm.doca.gov.in public certificates" },
  { claim: "~69% are NAWI", detail: "11 of 16 sampled certificates. The single biggest approval segment.", source: "Our 16-certificate corpus" },
  { claim: "6 operational RRSLs", detail: "Ahmedabad, Bengaluru, Bhubaneswar, Faridabad, Guwahati, Varanasi. A 7th at Nagpur under construction.", source: "DoCA Annual Report 2022-23" },
  { claim: "40 GATC certificates", detail: "Issued to private entities. Since Oct 2025 RRSLs and NTH labs are deemed GATCs — multi-tenancy is a regulatory fact.", source: "PIB, May 2026" },
  { claim: "₹25,000 per digital-electronic model", detail: "₹10,000 mechanical. A rejection means a fresh application and fresh fees under Rule 10.", source: "AoM Rules, Rule 19 (2019 amendment)" },
  { claim: "3–8 vs 40–76 models a year", detail: "Guwahati against Varanasi. The same report, prepared to different standards, in different places.", source: "DoCA AR performance tables" },
];

export const WHY_NOW: Sourced[] = [
  { claim: "India is the 13th country authorised to issue OIML certificates", detail: "Since September 2023. RRSL reports are now an international deliverable, and the R 76 report format is mandatory under OIML-CS.", source: "PIB" },
  { claim: "e-Maap launched 20 May 2026", detail: "The unified portal covering model approvals, with software testing facilities built at RRSLs with C-DAC.", source: "PIB / DoCA" },
  { claim: "The 61st CIML meeting is in New Delhi, Oct 2026", detail: "The world's legal metrology leadership arrives weeks after SIH.", source: "OIML / DoCA" },
  { claim: "R 76 is being rewritten from 2 parts into 5", detail: "Committee drafts under review. Any tool that hardcodes a threshold or a clause number dies at the next edition — which is why ours does neither.", source: "OIML R 76 Parts 1–5 CD, in docs/standards/" },
];

// ---------------------------------------------------------------------------
// The idea
// ---------------------------------------------------------------------------

export const THESIS = {
  headline: "We compute the report. The 62-page form is a rendering of it.",
  body:
    "Every cell of an R 76-2 report is a computed value, not free text. The error is " +
    "E = I + ½e − ΔL − L, corrected to Ec = E − E₀, and the instrument passes that row if " +
    "|Ec| ≤ mpe. Seventeen forms reduce to six calculation kernels. Once the maths is a tested " +
    "function, the report is a rendering and the reviewer's job stops being arithmetic.",
  analogy:
    "It is tax-filing software for weighing instruments: the readings are the inputs, the " +
    "permissible-error bands are the slab rates, and the R 76-2 report is the return.",
};

export const THE_TRAP = {
  title: "The error a spreadsheet makes",
  body:
    "On a multi-interval instrument the verification scale interval e changes with the load, so " +
    "the permissible-error band can widen part-way up a weighing range with no change in what " +
    "the display shows. On the standard's own worked example — Max 2 / 5 / 15 kg, e = 1 / 2 / 10 g, " +
    "class III — the limit walks ±0.5 g, ±1 g, ±2 g, ±3 g, ±10 g. The jump from ±2 g to ±3 g " +
    "happens at 4 kg, in the middle of a partial range. A spreadsheet using one e for the whole " +
    "instrument gets every row past the first changeover wrong.",
  source: "OIML R 76-1:2006 §3.3, worked example — docs/VERIFIED.md §3",
  seeItAt: "Record observations on a multi-interval instrument; the table announces the shoulder where it happens.",
};

/** What we found in the standard that a summary written from memory got wrong. */
export const CORRECTIONS: Sourced[] = [
  {
    claim: "Zero return is not a flat 0.5 e",
    detail:
      "On a multi-interval instrument the limit is 0.5 × e₁ — the smallest e, pinned, not the e " +
      "at the applied load. Using the local e would give 5 g instead of 0.5 g on the worked " +
      "example: a tenfold over-tolerance that passes an instrument it should fail.",
    source: "R 76-1 §3.9.4.2 — docs/VERIFIED.md §9",
  },
  {
    claim: "Annex F is temperature containment, not overlap",
    detail:
      "The instrument's declared range must sit inside each module's rated range. Two ranges can " +
      "overlap and still fail the check.",
    source: "R 76-1 Annex F.4 item (2) — docs/VERIFIED.md §13",
  },
  {
    claim: "A fault of exactly e is permitted",
    detail: "Only a fault greater than e is significant, and four exclusions excuse even a larger one.",
    source: "R 76-1 §5.1.1, §T.5.5.6 — docs/VERIFIED.md §12",
  },
  {
    claim: "Endurance excludes class I",
    detail:
      "Annex A.6 applies it only to classes II, III and IIII with Max ≤ 100 kg. Our own rule pack " +
      "had encoded just the Max condition, so a class I balance came out as needing a test it is " +
      "exempt from. Found and fixed; there is a regression test.",
    source: "R 76-1 Annex A.6 — docs/VERIFIED.md §15",
  },
  {
    claim: "Four forms do not reduce to five kernels",
    detail:
      "Repeatability adds a spread check; tilting uses a fixed 2 e unloaded; span stability is " +
      "checked against fixed bands with no mpe column on the printed form; and stability of " +
      "equilibrium is not time-based at all — it needed a sixth kernel.",
    source: "docs/VERIFIED.md §14",
  },
];

// ---------------------------------------------------------------------------
// What makes this different
// ---------------------------------------------------------------------------

export interface Differentiator {
  title: string;
  body: string;
  evidence: string;
  route?: string;
  routeLabel?: string;
}

export const DIFFERENTIATORS: Differentiator[] = [
  {
    title: "The family solver writes the certificate's own clause",
    body:
      "Given a family of variants, R 76-1 §3.10.4 decides the minimum set that must physically be " +
      "tested. It is an algorithm, not a judgement — and the output is the “shall also cover…” " +
      "paragraph that 12 of 16 sampled Indian certificates already carry. The selection cannot be " +
      "made variant by variant: in the standard's own Table 8, variant 2.4 is required only " +
      "because 2.5 cannot be reached from 2.1.",
    evidence: "Reproduces R 76-1 Table 8 exactly — 8 variants, test 1.2, 2.1 and 2.4.",
    route: "/tools/family",
    routeLabel: "Run the solver",
  },
  {
    title: "Annex F module compatibility, with real inequalities",
    body:
      "12 of 16 sampled certificates name a separately certified load cell, so modular is the " +
      "mainstream case. Every condition is evaluated with its clause, its required value and its " +
      "actual value, so the report shows the working rather than a verdict.",
    evidence: "Tested against Annex F.6.1's own worked example, reproducing its Q = 1.867.",
    route: "/tools/modules",
    routeLabel: "Check a combination",
  },
  {
    title: "The checksum audit — found by reading the register, not the standard",
    body:
      "R 76-1 Annex G requires the software identification to be clearly assigned to the legally " +
      "relevant software. In the live national register that field holds a file size (“8100kb”, " +
      "cert #100), a modulus (“65536”, #349), 4-character stubs, template filler (“is”, " +
      "“Details”), and one value shared by two different manufacturers (#259 and #300). Our " +
      "validation catches each class — and it has teeth: an error-severity finding stops the " +
      "report progressing past validation.",
    evidence: "docs/certificates/certificates-analysis.md · tested in apps/api/tests/render.test.ts",
  },
  {
    title: "Two conformity profiles, because the law allows either",
    body:
      "AoM Rule 7(1)(a) permits conformity to the Indian rules or to OIML recommendations. Both " +
      "rule packs ship. India's Seventh Schedule was checked line by line against the raw legal " +
      "text: Table 17, Table 20, the in-service doubling and the multi-interval table are verified " +
      "identical to OIML — one engine, two citations.",
    evidence: "docs/research/heading-a-verified.md",
    route: "/rulepack",
    routeLabel: "Read the rule pack",
  },
  {
    title: "IV and IIII, reconciled",
    body:
      "India's own Seventh Schedule writes the ordinary class as “IV” in its tables and “IIII” in " +
      "its test procedures — in the same document. We counted: IV appears 13 times, not the ~11 a " +
      "secondary summary claimed. Certificates add prose forms like “Medium Accuracy (III)”. The " +
      "normalizer resolves all of it.",
    evidence: "docs/research/heading-a-verified.md §5",
  },
  {
    title: "The standard is data, and that is tested",
    body:
      "R 76 is being restructured from two parts into five. We ship the committee-draft pack " +
      "alongside the 2007 one and test the pair that matters: the engine resolves an identical " +
      "permissible error at every load under either, while the form numbering, the new 12.3(c) " +
      "surge sub-item and every renumbered citation differ. An edition change is a different " +
      "file, not a different program.",
    evidence: "packages/engine/tests/edition-toggle.test.ts",
  },
  {
    title: "Deliberately no AI in the calculation path",
    body:
      "OIML's own Digital Transformation group position is that AI is not yet court-proof for " +
      "legal metrology. Every number this system produces comes from a deterministic function " +
      "tested against the standards' worked examples. That is not a gap in the design; it is the " +
      "design.",
    evidence: "CLAUDE.md design rule #1",
  },
];

// ---------------------------------------------------------------------------
// The 18 functional requirements, against what is actually built
// ---------------------------------------------------------------------------

export type FrState = "done" | "partial" | "planned";

export interface FunctionalRequirement {
  id: string;
  requirement: string;
  askedBy: "explicit" | "implied" | "differentiator";
  state: FrState;
  built: string;
  route?: string;
  routeLabel?: string;
}

export const FUNCTIONAL_REQUIREMENTS: FunctionalRequirement[] = [
  { id: "FR1", requirement: "Instrument profile and technical specification entry", askedBy: "explicit", state: "done",
    built: "Fields follow AoM Rule 5. Validated against Table 3 as it is typed; range structure is a first-class choice.",
    route: "/reports/new", routeLabel: "Start a report" },
  { id: "FR2", requirement: "Laboratory and environmental conditions", askedBy: "explicit", state: "partial",
    built: "Recorded per form and printed on the report's environmental header. Class I's barometric-pressure rule is resolved but the entry field is not yet on the form." },
  { id: "FR3", requirement: "Applicability resolver — which tests apply, and why not", askedBy: "implied", state: "done",
    built: "Derived from the profile against the rule pack. Every exclusion carries written prose and a clause, and prints as “– –”." },
  { id: "FR4", requirement: "Observation entry for every applicable test", askedBy: "explicit", state: "partial",
    built: "Full entry for the K1 weighing-type forms, with live permissible-error resolution. K2–K6 are implemented and tested in the engine but not yet given their own entry screens." },
  { id: "FR5", requirement: "Engine: error, mpe resolution, pass/fail", askedBy: "explicit", state: "done",
    built: "Six kernels and a multi-interval-aware resolver. 420 tests, built from the standards' own worked examples." },
  { id: "FR6", requirement: "Input validation", askedBy: "explicit", state: "done",
    built: "e in 1/2/5 × 10^k, Table 3 class limits, Table 4 boundaries, load range, and the Annex G software-identification audit." },
  { id: "FR7", requirement: "Family / EUT solver", askedBy: "differentiator", state: "done",
    built: "R 76-1 §3.10.4, reproducing Table 8, and generating the certificate's coverage clause.",
    route: "/tools/family", routeLabel: "Open" },
  { id: "FR8", requirement: "Module compatibility (Annex F)", askedBy: "differentiator", state: "done",
    built: "Every condition of the Annex F form including items (8)–(10), with clause, required and actual.",
    route: "/tools/modules", routeLabel: "Open" },
  { id: "FR9", requirement: "Report generation — R 76-2 PDF", askedBy: "explicit", state: "done",
    built: "Faithful to the printed form: ↓/↑ sub-columns, shaded computed cells, “– –” with reasons, bilingual furniture." },
  { id: "FR10", requirement: "Editable MS Word export", askedBy: "explicit", state: "done",
    built: "DOCX for the AD/DD cycle, watermarked DRAFT and carrying the record copy's hash — an editable file can never be the record." },
  { id: "FR11", requirement: "Machine-readable output", askedBy: "implied", state: "done",
    built: "DCC-inspired JSON with the PDF embedded, content-addressed so identical reports hash identically." },
  { id: "FR12", requirement: "Repository, search, instrument history", askedBy: "explicit", state: "done",
    built: "Server-side search by manufacturer, model, class, status and date.",
    route: "/reports", routeLabel: "Open" },
  { id: "FR13", requirement: "Dashboard, and the Rule 4(9) annual return", askedBy: "explicit", state: "done",
    built: "Models tested, fees realised and time per test — a query rather than a data-gathering exercise, shipped with the caveats that say how each figure was measured.",
    route: "/statistics", routeLabel: "Open" },
  { id: "FR14", requirement: "Attachments — photographs and documents", askedBy: "explicit", state: "done",
    built: "Figure 1 and Figure 2 slots. Content-addressed, hash-verified on every read, with Rule 16(2) confidentiality tiers." },
  { id: "FR15", requirement: "Role-based access and an append-only audit trail", askedBy: "explicit", state: "done",
    built: "MA → AD/DD → Director, enforced by capability and by lifecycle state. The log is the record; SQLite refuses UPDATE and DELETE on it.",
    route: "/settings", routeLabel: "See the chain" },
  { id: "FR16", requirement: "Digital signatures (optional in the PS)", askedBy: "explicit", state: "done",
    built: "Ed25519 over the head of the hash chain, so a signature commits its signer to the whole history. Re-verified on every read, and returned with the chain's own verdict." },
  { id: "FR17", requirement: "Versioned rule packs, dual profile, edition switch", askedBy: "explicit", state: "done",
    built: "Three packs ship: OIML 2007, India Seventh Schedule, and the five-part committee draft. The pack is pinned per report at creation.",
    route: "/rulepack", routeLabel: "Open" },
  { id: "FR18", requirement: "Technical documentation as a deliverable", askedBy: "explicit", state: "done",
    built: "docs/VERIFIED.md traces every threshold to a page of the standard; PROGRESS.md states what is not built as plainly as what is." },
];

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export interface Integration {
  name: string;
  where: string;
  what: string;
  status: "built" | "ready" | "roadmap";
  statusNote: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    name: "e-Maap / National Single Window",
    where: "India · DoCA",
    what:
      "The portal already holds the application, the fee, the RRSL assignment and the application " +
      "number. A report should open pre-filled from it and return its verdict, rather than an " +
      "officer re-keying the instrument's identity.",
    status: "ready",
    statusNote:
      "The report's identity fields follow AoM Rule 5, so they map one-to-one. The API is the " +
      "seam; no portal credentials exist to build against.",
  },
  {
    name: "C-DAC software testing facilities",
    where: "India · at the RRSLs",
    what:
      "C-DAC's facilities examine instrument software — which is exactly checklist 17.4 and " +
      "R 76-1 Annex G. Their finding should arrive as a result we ingest, not a test we duplicate.",
    status: "ready",
    statusNote:
      "The 17.4 checklist and the Annex G software-identification validator are built; the " +
      "ingestion endpoint is not.",
  },
  {
    name: "Automated test benches",
    where: "Robotic / instrumented rigs",
    what:
      "China's 2025 remote R 76 system separates capture from report generation. Ours is built " +
      "the same way: a bench can post observations to the same endpoints this UI uses.",
    status: "built",
    statusNote:
      "The engine is an HTTP API and the browser computes nothing — POST observations, receive " +
      "errors, bands and verdicts.",
  },
  {
    name: "OIML-CS",
    where: "International",
    what:
      "India has issued OIML certificates since 2023, and the R 76 report format is mandatory " +
      "under the scheme. A report that is already in the format is exportable as-is.",
    status: "built",
    statusNote: "The OIML profile and the R 76-2 form layout are what the renderer produces.",
  },
  {
    name: "Digital calibration certificates (PTB DCC style)",
    where: "Germany · PTB, and the DCC ecosystem",
    what:
      "One file that is both the human document and the machine data, so a downstream system " +
      "never re-keys numbers out of a PDF.",
    status: "built",
    statusNote:
      "The JSON output embeds the PDF with its own hash, and is content-addressed. The XML " +
      "schema mapping is not done.",
  },
  {
    name: "DSC / eSign",
    where: "India · IT Act 2000 §§4–5",
    what:
      "An officer's signature on the record, with the standing of a handwritten one.",
    status: "ready",
    statusNote:
      "Signing and verification are built over Ed25519; verification takes a detached signature " +
      "and a public key and does not care what produced them. A DSC token drops in where the " +
      "demonstration key sits.",
  },
  {
    name: "Public certificate register",
    where: "India · lm.doca.gov.in, Rule 11(4)",
    what:
      "Certificates are published; the reports and drawings behind them are not (Rule 16(2)). " +
      "Publication should be a step in the lifecycle, not a separate upload.",
    status: "built",
    statusNote:
      "PUBLISHED is a lifecycle state with the Director as the only actor, and attachments carry " +
      "confidentiality tiers.",
  },
  {
    name: "State verification systems",
    where: "India · in-service inspection",
    what:
      "In-service permissible error is exactly twice the initial-verification value, so the same " +
      "engine serves annual re-verification across the states — a far larger population of " +
      "instruments than type approval.",
    status: "built",
    statusNote: "The engine takes an in-service stage that doubles every band; tested.",
  },
];

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EVIDENCE: { file: string; what: string }[] = [
  { file: "docs/VERIFIED.md", what: "Every threshold traced to a page of the standard, plus nine places where the standard differs from a summary written from memory." },
  { file: "docs/research/heading-a-verified.md", what: "India's Seventh Schedule checked line by line against the raw legal text, with line numbers." },
  { file: "docs/certificates/certificates-analysis.md", what: "16 real 2026 certificates, and the checksum-field audit." },
  { file: "docs/PRD.md", what: "The full research dossier: legal framework, scale, international practice, prior art." },
  { file: "docs/PROGRESS.md", what: "What is built, and — as plainly — what is not." },
  { file: "docs/standards/extracted/", what: "Every standards PDF as greppable text with page markers, so any citation can be checked." },
];

export const HONEST_LIMITS: string[] = [
  "Authentication is a demonstration stub: the browser sends a user id and the server trusts it. The API refuses to start in production while that is true.",
  "Observation entry screens exist for the weighing-type forms. K2–K6 are implemented and tested in the engine but do not yet have their own entry UI.",
  "The load-cell figures on the module page are illustrative. The brand names are real, from the certificate corpus; the numbers are not.",
  "Repeatability's spread check and the fixed thresholds on forms 8 and 14 are documented in the rule pack but not yet computed.",
  "Measurement uncertainty is not computed. The problem statement asks for permissible errors and compliance, not uncertainty; it is a roadmap item.",
];
