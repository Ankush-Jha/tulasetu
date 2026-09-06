# R 76-2:2007 report format — structured data

This directory (and its sibling `../checklists/`) holds the OIML R 76-2:2007 "Type evaluation
report" layout as **data**, per CLAUDE.md design rule #2 ("the standard is data, not code").
Nothing here is executable — the engine, renderers and rule packs consume these files, but this
data extraction task did not touch `packages/engine/` or `packages/rulepacks/OIML_R76_2006.json`.

## Files

- `forms/R76-2_2007_forms.json` — one entry per R 76-2 form (36 entries: the 17 numbered forms,
  several of which split into lettered sub-forms — e.g. 12.2a/12.2b, 13a/13b/13c — because each
  lettered part is printed as its own page with its own Passed/Failed box). Captures, per form:
  clause reference(s), page number, a best-effort mapping to CLAUDE.md §5's 5 kernels, the
  environmental header (At start/At max/At end), the observation table's columns verbatim, the
  formulas printed on the form, and the acceptance criterion verbatim. Also carries the
  explanatory notes (p.5), the marking convention (PASSED / FAILED / "– –"), and the "Summary of
  type evaluation" table (p.9) as `summaryTable`.
- `checklists/R76-2_2007_checklist.json` — every item of the four §17 checklists (17.1–17.4),
  363 items total, each with its clause `ref`, verbatim `text`, an `answerType`
  (`yes-no-na`, `yes-no`, `existent-non-existent`, `type-selection`, or `measurement`), and a
  `section` label for the sub-heading it falls under.

## How this was derived

1. Read `docs/standards/extracted/OIML_R76-2_2007_report_format.txt` in full (all 62 pages,
   ~113k characters).
2. For pages with two-dimensional table layouts that a linear text extraction is prone to mangle
   (weighing performance, eccentricity, repeatability, stability of equilibrium, tilting, and the
   electrical-disturbance forms), the corresponding pages of
   `docs/standards/OIML_R76-2_2007_report_format.pdf` were rendered to images (via the Read tool's
   `pages` parameter, using `poppler`/`pdftoppm`) and visually compared against the extracted
   text to confirm column order and structure.
3. Column headers, formulas and acceptance criteria were transcribed verbatim (preserving ½, ×,
   −, ≤, Δ, ↓, ↑, etc.) — never paraphrased.
4. Anything that could not be confirmed with confidence was left in place but flagged with
   `"_uncertain": true` plus an explanatory note, rather than silently guessed. See the report
   delivered alongside this extraction for the full list of uncertain items and for places where
   the standard's own forms diverge from CLAUDE.md §5's 5-kernel table (Repeatability, Stability
   of equilibrium, Tilting and Span stability all have acceptance criteria that don't fit neatly
   into a single kernel as described in CLAUDE.md).

## How to regenerate

There is no automated pipeline — this was a manual, page-by-page transcription. To update:

1. Re-extract `OIML_R76-2_2007_report_format.pdf` to text if the source PDF changes.
2. Re-read the extract end to end (it's short enough, ~113k characters, to read in 2-3 tool calls).
3. Cross-check any page whose table layout looks suspicious against the rendered PDF page
   (`Read` tool, `pages` parameter — requires `poppler` installed for `pdftoppm`, e.g.
   `brew install poppler`).
4. Update the JSON by hand, preserving the verbatim-fidelity rule above.
5. Validate with:
   ```
   node -e "JSON.parse(require('fs').readFileSync('packages/rulepacks/forms/R76-2_2007_forms.json','utf8')); console.log('ok')"
   node -e "JSON.parse(require('fs').readFileSync('packages/rulepacks/checklists/R76-2_2007_checklist.json','utf8')); console.log('ok')"
   ```
