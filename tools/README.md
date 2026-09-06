# tools/

## `extract-standards.py`
Extracts every PDF in `docs/standards/` to searchable plain text in
`docs/standards/extracted/`, one `.txt` per PDF, with `===== [PDF PAGE n] name =====`
delimiters so a page number in a citation can be located by grep.

Why this exists: CLAUDE.md §10 requires verifying every threshold against the primary
source. Grepping text is how that is done cheaply and repeatably — the extracted text,
not memory, is the working source for the engine's golden tests.

```bash
python3 -m venv .venv && .venv/bin/pip install pypdf
.venv/bin/python tools/extract-standards.py     # run from the repo root
```

The extracted text is committed so that a fresh checkout can grep the standards without
re-running the extraction. It is *derived*; the PDFs in `docs/standards/` remain the
authority, and any table that the extractor mangles must be read from the PDF itself.
