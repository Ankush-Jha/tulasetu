# Taraazu

Deterministic engine that generates **OIML R-76 type-evaluation test reports** for
Non-Automatic Weighing Instruments (NAWI). Built for **Smart India Hackathon 2026**,
Problem Statement **SIH26035** (Department of Consumer Affairs).

> **We compute the report; the 62-page form is just a rendering.**

## Start here (for humans and for Claude Code)
1. Read **`CLAUDE.md`** — the full project brief, design rules, and the 5-kernel engine spec.
2. Read **`PROMPT.md`** — the exact first message to give Claude Code, and setup steps.
3. Primary sources live in **`docs/`** — always prefer them over memory.

## Layout
```
CLAUDE.md              project brief (read every session)
PROMPT.md              first message + setup
docs/
  standards/           OIML R-76-1/-2, drafts -3/-4/-5, D31, B18  (+ README reading map)
  research/            Heading A extract, full research dossier
  certificates/        16-certificate analysis + the checksum audit + fields JSON
  PRD.md               product requirements (18 FRs mapped to the PS)
  PROGRESS.md          milestone tracker — keep updated
packages/
  engine/              pure TypeScript: kernels, mpe resolver, applicability, solvers  ← M1
  rulepacks/           versioned JSON standards (OIML_R76_2006.json to start)
apps/
  web/                 React wizard (later milestone)
```

## Quick start
```bash
npm install
npm run test        # engine golden tests (Vitest)
```

## The one rule that matters most
**No AI in the legally relevant calculation path.** The engine is deterministic and
unit-tested against the standards' own worked examples. That is the point.
