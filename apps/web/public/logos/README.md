# Logos

The marks rendered by `src/components/Authorities.tsx` — in the application header, at the foot
of every page, on the sign-in screen, and on the briefing's "Under whose authority" tab. Which
file belongs to which body is set in `src/content/authorities.ts`, not here.

## Where each came from

Each is the organisation's own official artwork, taken from its own site or from NIC's
Government of India logo repository at [uxdt.nic.in](https://www.uxdt.nic.in/documents/logos/).

| File | Organisation | Source |
|---|---|---|
| `doca.png` | Department of Consumer Affairs | consumeraffairs.gov.in |
| `sih.png` | Smart India Hackathon | uxdt.nic.in (NIC logo repository) |
| `digital-india.svg` | Digital India | uxdt.nic.in |
| `cdac.png` | C-DAC | uxdt.nic.in |
| `bis.png` | Bureau of Indian Standards | bis.gov.in |
| `npl.png` | CSIR–National Physical Laboratory | nplindia.in |
| `oiml.svg` | International Organization of Legal Metrology | oiml.org |
| `legal-metrology.svg` | Legal Metrology Division | drawn here — no published mark of its own |
| `rrsl.svg` | Regional Reference Standards Laboratories | drawn here — no published mark of its own |
| `iso.svg` | ISO/IEC 17025 | drawn here — ISO's own mark is trademark-restricted |

The raster files were trimmed of their white canvas and had near-white pixels made transparent,
so a logo supplied on a white JPEG background does not render as a white card in dark mode.
Nothing else about them was altered.

## Using them

**Sized by height, width left to the artwork.** These are lockups, not icons — the BIS mark is
nearly 5:1, the Department's 3.4:1, CSIR–NPL's square. `Mark` in Authorities.tsx sets a height
and lets width follow; forcing them into one square box letterboxes the wide ones and is the
single thing that most makes a logo strip look homemade.

**Attribution, not endorsement.** These bodies are named because this software implements their
standards or answers their problem statement. Two things in the interface keep that line visible
and should stay: the department's mark and TulaSetu's own identity are separated by a rule in the
header rather than merged into one lockup, and every page foot reads "a Smart India Hackathon
2026 prototype, not an official publication of any department or standards body named above".

Everything still renders if a file is missing — the organisation falls back to its monogram.
