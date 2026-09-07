/**
 * The authorities and standards this work sits under.
 *
 * Two things this file is careful about.
 *
 * **Attribution is not endorsement.** Naming the Department of Consumer Affairs as the body
 * that issued problem statement SIH26035, or OIML as the author of R 76, is accurate and
 * ordinary — the same act as citing a standard. Dressing the application in official emblems so
 * that it *looks* like a government product is a different thing, and not one a hackathon entry
 * is entitled to do. The State Emblem of India in particular is restricted by the State Emblem
 * of India (Prohibition of Improper Use) Act, 2005.
 *
 * So: every organisation here is named in words, with what it actually contributes. Where the
 * team holds a mark it is entitled to display — the Smart India Hackathon lockup, a laboratory's
 * own logo — dropping the file into `public/logos/` with the filename below makes it appear.
 * Until then each shows a clean monogram, which reads as deliberate rather than as a gap.
 */

export interface Authority {
  /** Short form, used as the monogram when no artwork is present. */
  initials: string;
  name: string;
  /** What this body actually is. */
  role: string;
  /** Why it appears here — the specific contribution, not a generic association. */
  relevance: string;
  /** Drop a file at `public/logos/<file>` to replace the monogram. */
  file: string;
  href?: string;
  /** Groups the strip so a reader can tell a ministry from a standards body. */
  group: "government" | "laboratory" | "standards" | "programme";
}

export const AUTHORITIES: Authority[] = [
  {
    initials: "DoCA",
    name: "Department of Consumer Affairs",
    role: "Ministry of Consumer Affairs, Food & Public Distribution, Government of India",
    relevance: "Issued problem statement SIH26035, and administers model approval through the Legal Metrology Division.",
    file: "doca.svg",
    href: "https://consumeraffairs.nic.in/",
    group: "government",
  },
  {
    initials: "LMD",
    name: "Legal Metrology Division",
    role: "Directorate of Legal Metrology",
    relevance:
      "The Director (LM) approves models and is India's CIML member. The approval chain this " +
      "application enforces ends at that office.",
    file: "legal-metrology.svg",
    group: "government",
  },
  {
    initials: "RRSL",
    name: "Regional Reference Standards Laboratories",
    role: "Six laboratories, NABL accredited, plus a seventh under construction at Nagpur",
    relevance:
      "The laboratories that actually run the R 76 tests and prepare the report this replaces. " +
      "Approval marks carry a lab code — 09 is Faridabad.",
    file: "rrsl.svg",
    group: "laboratory",
  },
  {
    initials: "NPL",
    name: "CSIR–National Physical Laboratory",
    role: "India's national metrology institute",
    relevance: "Holds the national standards to which a laboratory's working weights are traceable.",
    file: "npl.svg",
    href: "https://www.nplindia.org/",
    group: "laboratory",
  },
  {
    initials: "OIML",
    name: "International Organization of Legal Metrology",
    role: "Author of Recommendation R 76 and of the OIML-CS certification scheme",
    relevance:
      "R 76-1 supplies the mathematics and R 76-2 the report format. India has been authorised " +
      "to issue OIML certificates since 2023, which makes the format an export requirement.",
    file: "oiml.svg",
    href: "https://www.oiml.org/",
    group: "standards",
  },
  {
    initials: "BIS",
    name: "Bureau of Indian Standards",
    role: "India's national standards body",
    relevance: "The national counterpart in the standards landscape these instruments sit within.",
    file: "bis.svg",
    href: "https://www.bis.gov.in/",
    group: "standards",
  },
  {
    initials: "ISO",
    name: "ISO/IEC 17025",
    role: "General requirements for the competence of testing and calibration laboratories",
    relevance:
      "§7.8 is why the record is an append-only log: original observations recorded when made, " +
      "amendments tracked with date and person, the original retained.",
    file: "iso.svg",
    group: "standards",
  },
  {
    initials: "SIH",
    name: "Smart India Hackathon 2026",
    role: "Ministry of Education, Government of India",
    relevance: "The programme under which this entry was built.",
    file: "sih.svg",
    href: "https://www.sih.gov.in/",
    group: "programme",
  },
  {
    initials: "DI",
    name: "Digital India",
    role: "Ministry of Electronics and Information Technology",
    relevance:
      "The programme whose goal this work serves directly: a paper-and-spreadsheet approval " +
      "process becoming an electronic record with standing under IT Act §§4 and 5.",
    file: "digital-india.svg",
    href: "https://www.digitalindia.gov.in/",
    group: "programme",
  },
  {
    initials: "CDAC",
    name: "C-DAC",
    role: "Centre for Development of Advanced Computing",
    relevance:
      "Runs the software-testing facility a software-controlled instrument is referred to. The " +
      "engine is exposed as an API so a bench there can post observations directly.",
    file: "cdac.svg",
    href: "https://www.cdac.in/",
    group: "programme",
  },
];

/** The legal instruments the software actually implements, as distinct from bodies. */
export const LEGAL_INSTRUMENTS: { title: string; provision: string; usedFor: string }[] = [
  {
    title: "Legal Metrology Act, 2009",
    provision: "§22",
    usedFor: "Model approval is mandatory — the legal gate this whole process exists to pass.",
  },
  {
    title: "LM (Approval of Models) Rules, 2011",
    provision: "R.4(9), R.7(1)(a), R.8, R.11(4), R.16(2), R.19",
    usedFor:
      "The annual return, the dual conformity track, the approval chain including the Director's " +
      "power to remit, publication, confidentiality of drawings, and the fee.",
  },
  {
    title: "LM (General) Rules, 2011",
    provision: "Rule 13 → Seventh Schedule, Heading A",
    usedFor: "India's NAWI specification — the second rule pack, verified against the raw text.",
  },
  {
    title: "OIML R 76-1 : 2006 and R 76-2 : 2007",
    provision: "Tables 3, 4, 6 · §3.3 · §3.10.4 · Annexes F and G",
    usedFor: "The classification, the permissible-error bands, the family solver, module compatibility and software identification.",
  },
  {
    title: "Information Technology Act, 2000",
    provision: "§§4 and 5",
    usedFor: "Electronic records satisfy a writing requirement; a secure digital signature has the standing of a handwritten one.",
  },
  {
    title: "ISO/IEC 17025 : 2017",
    provision: "§7.8",
    usedFor: "Why observations are append-only and hash-chained rather than editable rows.",
  },
];
