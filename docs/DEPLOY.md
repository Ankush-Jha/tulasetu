# Deploying TulaSetu (Vercel)

This is the operator's checklist for the hosted demonstration: the two things Vercel's own
free-tier Node function cannot do on its own — render a PDF, and remember anything between
requests — and the exact steps to switch both on. Nothing here is needed to run TulaSetu as it
is actually meant to run in a laboratory: `apps/api/src/server.ts` against a real SQLite file on
a real disk (CLAUDE.md §4). This document is only for the public, judge-facing deployment.

Two rules for whoever runs these steps:

- **Never commit or paste a Supabase key into this repository, a commit message, or a chat.**
  It only ever goes into Vercel's own environment variable store (step 3 below).
- Everything here is additive. Leaving both environment variables unset is a fully supported
  configuration — `/api/health` says so, and the application behaves exactly as it always did
  (in-memory, forgets everything when the function goes cold).

---

## 1. Why any of this is needed

A Vercel serverless function has two properties that don't match what the design in
`CLAUDE.md` §3.4 assumes:

1. **Its filesystem is thrown away between invocations**, so a SQLite file written to disk does
   not survive. `apps/api/db/persistence.ts` works around this for the demo by keeping the whole
   database *in memory* and mirroring it to a Supabase **Storage** object after every write, so a
   cold start restores it rather than starting empty. This is Part 2 below.
2. **It has no Chromium binary**, so `packages/renderers/src/pdf.ts`'s ordinary `playwright`
   path (which drives a locally installed browser) cannot run there. It now detects Vercel and
   drives `@sparticuz/chromium` + `playwright-core` instead — a Chromium build packaged for
   exactly this constraint. This is Part 3 below, and unlike Part 2 it needs **no action from
   you**: it is already wired into `vercel.json` and `packages/renderers/package.json`. Part 3
   is here only so you can verify it actually worked post-deploy.

Skip Part 2 and the site still works — it just forgets its data whenever the function recycles,
which `/api/health` and the seed button both say plainly rather than hiding.

---

## 2. Durable storage (Supabase Storage)

### What this is *not*

This is **not** a Postgres migration. TulaSetu's schema, including the append-only triggers that
make `report_events` un-editable and un-deletable (ISO/IEC 17025 §7.8), lives entirely in
`apps/api/src/db/schema.sql` and is applied by `better-sqlite3` itself, in the function's memory,
on every cold start — including one that just restored a snapshot (`migrate()` in
`apps/api/src/db/open.ts` runs unconditionally; every statement in `schema.sql` is
`IF NOT EXISTS`, so re-applying it to an already-migrated database is a no-op). **You never run
any SQL against Supabase.** Supabase here is used purely as a place to park one binary file — the
serialised SQLite database — between cold starts, via its Storage product, not its Postgres
database. There is no `CREATE TABLE` to run in the Supabase SQL editor, and no Supabase Postgres
connection string anywhere in this application.

### Steps

1. **Create a Supabase project.** [supabase.com/dashboard](https://supabase.com/dashboard) →
   "New project". The free tier is enough for a demonstration. Wait for it to finish
   provisioning.

2. **Create a Storage bucket named `tulasetu`.** In the new project, open **Storage** in the left
   sidebar → **New bucket** → name it exactly `tulasetu` → leave it **Private** (there is no
   reason for this object to be public; the app always authenticates with the service-role key
   below, which bypasses bucket policy entirely) → **Create bucket**.
   - If you'd rather use a different bucket name, set the `SUPABASE_DB_BUCKET` environment
     variable (step 3) to match — `tulasetu` is only the default `apps/api/src/db/persistence.ts`
     falls back to when it's unset.
   - Nothing else about the bucket needs configuring. The first successful write creates the
     `tulasetu.db` object inside it automatically.

3. **Copy two values from Supabase, and set them in Vercel.** In the Supabase project, go to
   **Project Settings → API**:
   - **Project URL** (looks like `https://<ref>.supabase.co`) → this is `SUPABASE_URL`.
   - **`service_role` secret**, under "Project API keys" — **not** the `anon`/`public` key. The
     service-role key bypasses row-level security, which is exactly why it must never reach a
     browser; it belongs only in a server environment variable, never in `apps/web`.

   In the Vercel dashboard, open this project → **Settings → Environment Variables**, and add
   both, scoped at least to **Production** (add **Preview** too if you want preview deployments
   to persist data as well):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from above |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` secret from above |

   Leave `SUPABASE_DB_BUCKET` and `SUPABASE_DB_OBJECT` unset unless you deliberately chose a
   bucket name other than `tulasetu`, or want more than one independent demo database in the
   same project.

4. **Redeploy.** Environment variable changes only take effect on a new deployment — from the
   Vercel dashboard's **Deployments** tab, use **Redeploy** on the latest one (no code change is
   required), or push any commit.

5. **Verify.**
   - `GET https://<your-domain>/api/health` — look at the `storage` field. Configured correctly,
     it reads:
     ```json
     "storage": { "kind": "supabase-storage", "durable": true, "note": "...", "error": null }
     ```
     If `kind` is still `"memory"`, the two environment variables are not both set on this
     deployment (check for typos, and that you redeployed *after* adding them). If `kind` is
     `"supabase-storage"` but `error` is non-null, the URL or key is set but wrong, or the bucket
     doesn't exist yet — the error text is Supabase's own response and says which.
   - Open the site, let it seed demonstration data (it does this automatically on an empty
     database — see `api/_src/handler.ts`), then in the Supabase dashboard's **Storage** browser
     confirm a `tulasetu.db` object now exists in the bucket with a non-zero size.
   - Force a cold start (wait a few minutes with no traffic, or redeploy again) and reload the
     site. The same demonstration reports should still be there — that's the whole point proven
     end to end.

### What this still does not do

Read the note `/api/health` itself reports, and the header of
`apps/api/src/db/persistence.ts`: two function instances that both write will each upload their
own whole file and the later upload wins, silently losing the other's events. A single visitor
clicking through a demonstration never triggers this; a real laboratory, with concurrent
officers, would — which is exactly why this is documented as a demo convenience, not the
compliance story, and why a real deployment is `apps/api/src/server.ts` against a real file (or a
genuine async Postgres migration, which CLAUDE.md §4 already flags as a real migration, not a
config change).

---

## 3. PDF rendering on Vercel (verification only — already wired up)

`packages/renderers/src/pdf.ts` already drives `@sparticuz/chromium` + `playwright-core` when
`process.env.VERCEL === "1"` (Vercel sets this itself), and `vercel.json` already bundles the
Chromium binary (`functions["api/*.mjs"].includeFiles`) and gives the function enough time to
unpack and launch it on a cold start (`maxDuration: 60`). There is nothing to configure — this
section is here so you can confirm it actually worked on your deployment, since it cannot be
proven from a developer's Mac (the bundled Chromium build is Linux-only; see `pdf.ts`'s own
`launchChromium` for how this was verified locally short of that).

**One setting worth checking, not required by default:** Function memory on Vercel now lives in
the dashboard rather than `vercel.json` (Fluid compute). The Hobby default (2 GB) is already
comfortably above Sparticuz's own recommendation (≥ 512 MB, "1600 MB or more" preferred for a
fast cold-start unpack of the ~64 MB compressed binary), so no change should be necessary — but
if a Lock ever times out on a cold start, raise it under **Project Settings → Functions**.

**Verify:**

- Sign in to the deployed site as the Director demo account, open a report sitting at
  `RECOMMENDED`, and click **Lock final report**. It should return the rendered PDF's SHA-256 and
  move the report to `LOCKED` — not the `RENDERER_UNAVAILABLE` 503 that meant "Chromium isn't
  here" before this fix.
- Or, from your own machine (this sends a real, mutating request to *your* deployment — only run
  it against a deployment you own, with an id and user that make sense for it):
  ```sh
  curl -s -X POST https://<your-domain>/api/reports/<report-id>/lock \
    -H "X-User-Id: <a Director account's id>"
  ```
  A working deployment returns `{"sha256": "...", "report": {"status": "LOCKED", ...}}`.
- If it still fails: the response is a 503 with `"error": "RENDERER_UNAVAILABLE"`, and the
  server log (Vercel dashboard → your deployment → **Logs**, or `vercel logs`) carries a line
  starting `[tulasetu] PDF rendering could not start Chromium:` with the underlying error —
  almost always either `includeFiles` not matching (check the glob still reads
  `node_modules/@sparticuz/chromium/**` in `vercel.json`) or the function running on an
  architecture the bundled binary doesn't cover (Vercel's default Node runtime is x86_64, which
  is what `@sparticuz/chromium`'s default package targets — this should not come up without a
  deliberate architecture override elsewhere in the project's settings).
- Once Lock works, the demonstration seed (`apps/api/src/domain/demo.ts`) will itself reach
  `LOCKED`, `CERTIFICATE_ISSUED`, `PUBLISHED` and `WITHDRAWN` on the next cold start against an
  empty database — it already tries to, and only stops short (recording why in its result) when
  rendering isn't available.
