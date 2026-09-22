/**
 * The production guard on the demonstration authentication stub.
 *
 * `routes.ts` derives the principal from an `X-User-Id` header it does not verify, so
 * `X-User-Id: u-dir` is a Director. `buildServer` refuses to construct an app in that state
 * under NODE_ENV=production unless TARAAZU_ALLOW_HEADER_AUTH says the instance is isolated
 * on purpose.
 *
 * These tests exist because the guard was once written beside the CLI's `.listen()` call,
 * inside an `if (isEntry)` block. The serverless entrypoint (`api/_src/handler.ts`) calls
 * `buildServer()` directly and never runs that block, so the deployed API served full
 * Director capabilities to any anonymous caller while the source read as though it were
 * protected. The guard has to sit on the path every entrypoint shares, and a test has to
 * hold it there — a regression here is silent and reachable from the open internet.
 */

import { describe, it, expect, afterEach } from "vitest";

import { buildServer } from "../src/server.js";

const ENV_KEYS = ["NODE_ENV", "TARAAZU_ALLOW_HEADER_AUTH"] as const;
const saved = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = saved.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  saved.clear();
});

describe("the production guard on header authentication", () => {
  it("refuses to build an app in production while the stub is in place", () => {
    setEnv("NODE_ENV", "production");
    setEnv("TARAAZU_ALLOW_HEADER_AUTH", undefined);

    expect(() => buildServer()).toThrow(/Refusing to start/);
  });

  it("names the stub, the replacement and the escape hatch, so the message is actionable", () => {
    setEnv("NODE_ENV", "production");
    setEnv("TARAAZU_ALLOW_HEADER_AUTH", undefined);

    expect(() => buildServer()).toThrow(/X-User-Id/);
    expect(() => buildServer()).toThrow(/NIC SSO/);
    expect(() => buildServer()).toThrow(/TARAAZU_ALLOW_HEADER_AUTH=1/);
  });

  it("gives way when the instance is declared isolated on purpose", () => {
    setEnv("NODE_ENV", "production");
    setEnv("TARAAZU_ALLOW_HEADER_AUTH", "1");

    expect(() => buildServer()).not.toThrow();
  });

  it("stays out of the way outside production, which is where the demo runs", () => {
    setEnv("NODE_ENV", "development");
    setEnv("TARAAZU_ALLOW_HEADER_AUTH", undefined);

    expect(() => buildServer()).not.toThrow();
  });

  it("guards buildServer itself, not merely the CLI that calls it", () => {
    // The regression that motivated this file: the serverless function reaches the app only
    // through buildServer, so proving the throw comes from buildServer — rather than from
    // anything wrapped around it at the command line — is the whole point.
    setEnv("NODE_ENV", "production");
    setEnv("TARAAZU_ALLOW_HEADER_AUTH", undefined);

    let threw = false;
    try {
      buildServer({ dbPath: ":memory:" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
