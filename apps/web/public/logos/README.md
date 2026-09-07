# Logos

Drop artwork here and it appears automatically — `AuthorityStrip` at the foot of the sign-in
page and `AuthorityBoard` on the briefing's "Under whose authority" tab both read this folder. Until a file is present, that organisation
renders as a clean monogram — which reads as deliberate rather than as a gap.

## Filenames

| File | Organisation |
|---|---|
| `doca.svg` | Department of Consumer Affairs |
| `legal-metrology.svg` | Legal Metrology Division |
| `rrsl.svg` | Regional Reference Standards Laboratories |
| `npl.svg` | CSIR–National Physical Laboratory |
| `oiml.svg` | International Organization of Legal Metrology |
| `bis.svg` | Bureau of Indian Standards |
| `iso.svg` | ISO/IEC |
| `sih.svg` | Smart India Hackathon |
| `digital-india.svg` | Digital India |
| `cdac.svg` | C-DAC |
| `emblem.svg` | State Emblem of India |

SVG preferred; PNG at 2× also works — change the extension in
`src/content/authorities.ts` to match.

## Before you add one

**Naming an authority is not the same as wearing its emblem.** Citing OIML R 76, or recording
that the Department of Consumer Affairs issued problem statement SIH26035, is ordinary
attribution and is what this application does everywhere. Putting official emblems into the
product chrome is a different act: it makes the software *look* like an official government
release, which a hackathon entry is not.

Two are worth singling out:

- **The State Emblem of India** is restricted by the State Emblem of India (Prohibition of
  Improper Use) Act, 2005. Use is confined to the authorities the Act names. Do not add
  `emblem.svg` unless the team has been told, by someone who can say so, that it is permitted.
- **Digital India, SIH and ministry marks** are generally fine on a submission that *is* an SIH
  entry — that is what they are for — but check the current SIH branding guidance for the
  edition you are entering, since it changes year to year.

Everything renders correctly with none of these files present. That is the intended default:
the application states which authorities and standards it works under, in words, and does not
imply endorsement by anyone.
