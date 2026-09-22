# First message to paste into Claude Code

Open this folder in Claude Code, then paste the message below as your first prompt.
(Claude Code auto-reads `CLAUDE.md`, but this message tells it exactly where to start.)

---

```
Read CLAUDE.md and docs/ before doing anything — this is a regulated legal-metrology
domain and the details are load-bearing.

We're building Taraazu (SIH 2026, PS SIH26035): a deterministic engine that generates
OIML R-76 type-evaluation test reports for Non-Automatic Weighing Instruments.

Start with Milestone M1: packages/engine.

Do it in this order, test-first:

1. Read docs/standards/oiml-r76-1.md (or the PDF) sections on Table 3 (classification),
   Table 6 (mpe), §3.3 (multi-interval), §3.5.3.2 (rounding elimination), and the worked
   example for the 2/5/15 kg class III instrument. Also read docs/research/heading-a-extract.md
   for how India's Seventh Schedule differs.

2. Define the core types in packages/engine/src/types.ts: AccuracyClass, ScaleInterval,
   InstrumentProfile (Max, Min, e, d, n, class, ranges, indicating-type, power, electronic?),
   Observation, Verdict.

3. Implement the mpe resolver (packages/engine/src/mpe.ts) — multi-interval aware. This is
   the trickiest and most important piece. Then write golden tests in
   packages/engine/tests/mpe.test.ts using R-76-1's worked example (bands must walk
   ±0.5e₁ → ±1e₁ → ±1e₂ → ±1.5e₂ → ±1e₃). Make them pass before moving on.

4. Implement kernel K1 (error vs mpe) in packages/engine/src/kernels/k1.ts with tests.
   Then K2, K3, K4, K5. Each with golden tests derived from the standard.

5. Implement the family/EUT solver (packages/engine/src/family.ts) and test it against
   R-76-1's Table 8 (8 variants → test only 1.2, 2.1, 2.4).

Keep the engine pure (no I/O, no DB, no UI). Use Vitest. Set up the monorepo with a simple
npm workspace. Update docs/PROGRESS.md as you go.

Show me the mpe resolver and its passing tests first, then continue.
```

---

## Setup (one time, before the prompt)

If starting fresh from this bundle:

```bash
cd taraazu
npm install          # installs workspace deps
npm run test         # should run engine tests (will be empty until M1 starts)
```

If Node isn't set up yet, Claude Code can scaffold `package.json`, `tsconfig.json`, and
Vitest config for you — just ask it to "set up the monorepo tooling" as step 0.
