/**
 * Which Chromium `renderPdf` drives, proven without a deployment.
 *
 * F4 (fix-brief): PDF rendering fails on Vercel because a stock Node function has no Chromium
 * binary. `packages/renderers/src/pdf.ts` now picks between two runtimes — the full `playwright`
 * package against a locally installed browser, or `playwright-core` driving the Brotli-packed
 * build `@sparticuz/chromium` unpacks to `/tmp` — based on `VERCEL` (set automatically by the
 * platform) or `TARAAZU_SERVERLESS_CHROMIUM` (set here, to exercise that branch without
 * deploying anything or owning a Linux machine).
 *
 * The real `@sparticuz/chromium` binary is Linux-only and cannot run in this suite (or on a
 * developer's Mac) — `node -e` against the real packages confirms the branch is reached and the
 * binary is unpacked, then fails with `spawn ENOEXEC`, which is exactly the "right code path,
 * wrong host OS" signature, not a bug. So this test mocks both runtimes' `launch` and asserts
 * *which one* `renderPdf` calls and with *what arguments* — the part that has to be right for
 * the Vercel deployment to work, and the part a unit test can prove on any platform.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { assembleReport, type FormsFile } from "../src/assemble.js";
import type { ReportDocument } from "../src/model.js";
import type { InstrumentProfile } from "@taraazu/engine";

/** A form bank with nothing in it — this suite never reaches a real form, only the cover page. */
const EMPTY_FORMS: FormsFile = { forms: [] };

const instrument: InstrumentProfile = {
  unit: "g",
  accuracyClass: "III",
  indicatingType: "self",
  rangeKind: "single",
  electronic: true,
  manufacturer: "Example Instruments Pvt Ltd",
  model: "EX-1",
  serialNumber: "SN-0001",
  ranges: [{ e: 1, d: 1, max: 2000, min: 20, n: 2000 }],
};

function minimalDoc(): ReportDocument {
  return assembleReport({
    reportId: "TS-2026-RUNTIME",
    profile: "IN_Sch7A",
    rulesetId: "OIML_R76_2006",
    edition: "2007-report-format",
    status: "DRAFT",
    lab: { name: "RRSL Faridabad", kind: "RRSL", labCode: "09", nablAccredited: true },
    instrument,
    generatedAt: "2026-09-07T00:00:00Z",
    formsFile: EMPTY_FORMS,
    forms: [],
  });
}

/** A `playwright`/`playwright-core` `Browser` stand-in with just enough shape for `renderPdf`. */
function fakeBrowser() {
  return {
    newPage: async () => ({
      setContent: async () => {},
      emulateMedia: async () => {},
      pdf: async () => Buffer.from("%PDF-1.4 fake\n"),
    }),
    close: async () => {},
  };
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.doUnmock("playwright");
  vi.doUnmock("playwright-core");
  vi.doUnmock("@sparticuz/chromium");
  vi.resetModules();
});

describe("renderPdf's choice of Chromium", () => {
  it("on Vercel (or with the local override), drives playwright-core + @sparticuz/chromium — never the full playwright package", async () => {
    delete process.env["VERCEL"];
    process.env["TARAAZU_SERVERLESS_CHROMIUM"] = "1";

    const launch = vi.fn(async (opts: { args?: string[]; executablePath?: string }) => {
      expect(opts.executablePath).toBe("/tmp/fake-chromium");
      expect(opts.args).toEqual(["--fake-serverless-arg"]);
      return fakeBrowser();
    });
    vi.doMock("playwright-core", () => ({ chromium: { launch } }));
    vi.doMock("@sparticuz/chromium", () => ({
      default: {
        args: ["--fake-serverless-arg"],
        executablePath: async () => "/tmp/fake-chromium",
      },
    }));
    vi.doMock("playwright", () => {
      throw new Error("the serverless path must not import the full playwright package");
    });

    vi.resetModules();
    const { renderPdf } = await import("../src/pdf.js");
    const result = await renderPdf(minimalDoc());

    expect(launch).toHaveBeenCalledTimes(1);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("off Vercel, drives the full playwright package against a locally installed browser — never @sparticuz/chromium", async () => {
    delete process.env["VERCEL"];
    delete process.env["TARAAZU_SERVERLESS_CHROMIUM"];

    const launch = vi.fn(async () => fakeBrowser());
    vi.doMock("playwright", () => ({ chromium: { launch } }));
    vi.doMock("playwright-core", () => {
      throw new Error("the local path must not import playwright-core directly");
    });
    vi.doMock("@sparticuz/chromium", () => {
      throw new Error("the local path must not import @sparticuz/chromium");
    });

    vi.resetModules();
    const { renderPdf } = await import("../src/pdf.js");
    const result = await renderPdf(minimalDoc());

    expect(launch).toHaveBeenCalledTimes(1);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats Vercel's own VERCEL=1 the same as the local override", async () => {
    process.env["VERCEL"] = "1";
    delete process.env["TARAAZU_SERVERLESS_CHROMIUM"];

    const launch = vi.fn(async () => fakeBrowser());
    vi.doMock("playwright-core", () => ({ chromium: { launch } }));
    vi.doMock("@sparticuz/chromium", () => ({
      default: { args: [], executablePath: async () => "/tmp/fake-chromium" },
    }));
    vi.doMock("playwright", () => {
      throw new Error("VERCEL=1 must take the serverless path");
    });

    vi.resetModules();
    const { renderPdf } = await import("../src/pdf.js");
    await renderPdf(minimalDoc());

    expect(launch).toHaveBeenCalledTimes(1);
  });
});
