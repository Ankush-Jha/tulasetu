#!/usr/bin/env node
/**
 * Bundles `api/_src/handler.ts` into the single flat `api/handler.js` that Vercel actually
 * deploys.
 *
 * Why this exists rather than letting Vercel's own Node builder trace the function itself: that
 * builder resolves `@tulasetu/engine` (an npm workspace package, reached through a node_modules
 * symlink) as an *external* runtime dependency and copies the raw `packages/engine` folder next
 * to the function instead of inlining it. That folder's `package.json` points `main` at
 * `src/index.ts` — a TypeScript source file, which a plain deployed Node process cannot import.
 * The result was a working route (`/api/health` reached the function) that crashed on load with
 * `ERR_MODULE_NOT_FOUND … src/index.ts`.
 *
 * Bundling here instead inlines every `@tulasetu/*` import as real, already-compiled JavaScript,
 * so nothing at runtime needs a TypeScript-aware loader. Two packages stay external instead of
 * being inlined:
 *
 * - `better-sqlite3` ships a compiled native `.node` binary, which esbuild cannot fold into a
 *   JS bundle at all.
 * - `playwright` (via `@tulasetu/renderers`) pulls in `playwright-core`, which itself
 *   conditionally `require`s `chromium-bidi` — a package this repo does not install, because
 *   this function never launches a browser (`renderReportForDownload` already turns a PDF
 *   request here into a clear 503; see api/_src/handler.ts). Bundling would make that a
 *   *build-time* failure over a code path nothing here calls; external leaves it as an ordinary
 *   runtime `require`, resolved the normal way if it's ever reached.
 *
 * Both survive as plain imports in the output; Vercel's function packer finds each in
 * node_modules the ordinary way and includes it alongside.
 */

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(ROOT, "api/_src/handler.ts")],
  // .mjs, unambiguously ESM regardless of any package.json "type" field above this file — the
  // crash this whole script exists to avoid (see the comment above) was exactly that ambiguity.
  outfile: join(ROOT, "api/handler.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // A native binary can't be bundled into JS; everything else, including the @tulasetu/*
  // workspace packages, gets inlined so the deployed function needs no TypeScript loader and no
  // separate node_modules copy of them.
  external: ["better-sqlite3", "playwright", "playwright-core", "chromium-bidi"],
  // db/open.ts's schema.sql is read at runtime by `import.meta.url`-relative path in the source
  // tree; bundled, there is no neighbouring file left to read (see api/_src/handler.ts). This
  // loader makes `import schemaSql from ".../schema.sql"` inline its content as a plain string
  // instead, resolved once at build time.
  loader: { ".sql": "text" },
  // Fastify and its dependency avvio are CommonJS and call `require()` at module-load time.
  // esbuild's own CJS-in-ESM interop shim doesn't cover Node's own builtins ("Dynamic require of
  // node:events is not supported"); a real `require`, from `createRequire`, does — this is
  // esbuild's own documented fix for bundling CJS dependencies into an ESM Node target.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
