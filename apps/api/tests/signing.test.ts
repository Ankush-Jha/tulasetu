/**
 * Digital signatures (FR16).
 *
 * The claim being tested is narrow and important: a signature over the report's head hash
 * commits the signer to the whole history behind it, and a signature that no longer matches is
 * *reported* rather than trusted. A stored "verified" flag would be an assertion; the point of
 * a signature is that the assertion can be re-checked, so verification runs on every read.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RulePack } from "@tulasetu/engine";

import { openMemoryDb, type Db } from "../src/db/open.js";
import { registerRoutes } from "../src/routes.js";
import { generateKeyPair, signHash, verifySignature } from "../src/domain/signing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(HERE, "../../../packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;

const T = "2026-09-07T10:00:00.000Z";

let db: Db;
let app: FastifyInstance;

async function call(method: "GET" | "POST" | "PUT", url: string, userId: string, payload?: unknown) {
  return app.inject({
    method, url, headers: { "x-user-id": userId },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

beforeEach(async () => {
  db = openMemoryDb();
  db.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)").run("lab-fbd", "RRSL", "RRSL", T);
  const u = db.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  u.run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@x.gov.in", T);
  u.run("u-dir", "lab-fbd", "DIRECTOR", "C. Director", "dir@x.gov.in", T);

  app = Fastify();
  registerRoutes(app, { db, pack, now: () => T });
  await app.ready();

  await call("POST", "/reports", "u-ma", { reportId: "R1", profile: "IN_Sch7A" });
});

afterEach(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------

describe("the primitives", () => {
  it("round-trips a signature over a hash", () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair();
    const hash = "a".repeat(64);
    const sig = signHash(hash, privateKeyPem);
    expect(verifySignature(hash, sig, publicKeyPem).ok).toBe(true);
  });

  it("rejects a signature over a different hash", () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair();
    const sig = signHash("a".repeat(64), privateKeyPem);
    const r = verifySignature("b".repeat(64), sig, publicKeyPem);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not match this record/i);
  });

  it("rejects a signature made with a different key", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const hash = "c".repeat(64);
    expect(verifySignature(hash, signHash(hash, b.privateKeyPem), a.publicKeyPem).ok).toBe(false);
  });

  it("reports rather than throws on malformed input", () => {
    const { publicKeyPem } = generateKeyPair();
    expect(verifySignature("a".repeat(64), "", publicKeyPem).ok).toBe(false);
    expect(verifySignature("a".repeat(64), "notbase64!!", publicKeyPem).ok).toBe(false);
    expect(verifySignature("a".repeat(64), "AAAA", "not a key").ok).toBe(false);
  });
});

describe("signing a report", () => {
  it("refuses to sign before a key is registered", async () => {
    const res = await call("POST", "/reports/R1/sign", "u-dir", {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("NO_SIGNING_KEY");
  });

  it("issues a key pair once, and keeps only the public half", async () => {
    const res = await call("POST", "/me/signing-key", "u-dir");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.generated).toBe(true);
    expect(body.publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
    expect(body.privateKeyPem).toMatch(/BEGIN PRIVATE KEY/);

    // Only the public half is retained.
    const stored = db.prepare("SELECT public_key FROM users WHERE id = ?").get("u-dir") as any;
    expect(stored.public_key).toBe(body.publicKeyPem);
    expect(stored.public_key).not.toContain("PRIVATE");
  });

  it("accepts a public key on its own, which is the deployment case", async () => {
    const { publicKeyPem } = generateKeyPair();
    const res = await call("POST", "/me/signing-key", "u-dir", { publicKeyPem });
    expect(res.json().generated).toBe(false);
    expect(res.json().privateKeyPem).toBeUndefined();
  });

  it("signs the head of the chain, and verifies on read", async () => {
    const key = (await call("POST", "/me/signing-key", "u-dir")).json();
    const signed = await call("POST", "/reports/R1/sign", "u-dir", { privateKeyPem: key.privateKeyPem });
    expect(signed.statusCode).toBe(200);

    const res = (await call("GET", "/reports/R1/signatures", "u-dir")).json();
    expect(res.signatures).toHaveLength(1);
    expect(res.signatures[0]).toMatchObject({ actorName: "C. Director", role: "DIRECTOR", verified: true });
    expect(res.signatures[0].hash).toHaveLength(64);
    expect(res.chain.ok).toBe(true);
    expect(res.trustworthy).toBe(true);
  });

  it("accepts a detached signature produced elsewhere — the DSC case", async () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair();
    await call("POST", "/me/signing-key", "u-dir", { publicKeyPem });

    // The officer's device signs the head hash; the private key never reaches the server.
    const audit = (await call("GET", "/reports/R1/audit", "u-dir")).json();
    const head = audit.events[audit.events.length - 1];
    const signature = signHash(head.hash, privateKeyPem);

    const res = await call("POST", "/reports/R1/sign", "u-dir", { signature });
    expect(res.statusCode).toBe(200);
    expect((await call("GET", "/reports/R1/signatures", "u-dir")).json().signatures[0].verified).toBe(true);
  });

  it("refuses a signature that does not verify", async () => {
    await call("POST", "/me/signing-key", "u-dir");
    const other = generateKeyPair();
    const audit = (await call("GET", "/reports/R1/audit", "u-dir")).json();
    const head = audit.events[audit.events.length - 1];

    const res = await call("POST", "/reports/R1/sign", "u-dir", {
      signature: signHash(head.hash, other.privateKeyPem),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("BAD_SIGNATURE");
  });

  it("records the signature as its own event, never by editing the one it covers", async () => {
    const key = (await call("POST", "/me/signing-key", "u-dir")).json();
    const before = (await call("GET", "/reports/R1/audit", "u-dir")).json();
    await call("POST", "/reports/R1/sign", "u-dir", { privateKeyPem: key.privateKeyPem });
    const after = (await call("GET", "/reports/R1/audit", "u-dir")).json();

    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.events.at(-1).eventType).toBe("REPORT_SIGNED");
    // The event that was signed is untouched.
    expect(after.events[before.events.length - 1]).toEqual(before.events.at(-1));
    expect(after.verification.ok).toBe(true);
  });

  it("commits the signer to the whole history, so a later tamper invalidates the signature", async () => {
    const key = (await call("POST", "/me/signing-key", "u-dir")).json();
    await call("POST", "/reports/R1/sign", "u-dir", { privateKeyPem: key.privateKeyPem });
    expect((await call("GET", "/reports/R1/signatures", "u-dir")).json().trustworthy).toBe(true);

    // Someone with the database file rewrites an event the signature covers.
    db.exec("DROP TRIGGER report_events_no_update");
    db.prepare("UPDATE report_events SET payload = ? WHERE report_id = ? AND version = 1").run(
      JSON.stringify({ tampered: true }), "R1",
    );

    const audit = (await call("GET", "/reports/R1/audit", "u-dir")).json();
    expect(audit.verification.ok).toBe(false);

    // The signature itself still verifies — it covers the head's *stored* hash, and rewriting
    // an earlier row does not change that stored value. What fails is the chain, because the
    // recomputed hash no longer matches. So the endpoint must return both, and must not call
    // the report trustworthy on the strength of a valid signature over altered data.
    const res = (await call("GET", "/reports/R1/signatures", "u-dir")).json();
    expect(res.signatures[0].verified).toBe(true);
    expect(res.chain.ok).toBe(false);
    expect(res.trustworthy).toBe(false);
  });

  it("keeps a signature valid when the signer's key is replaced, and says the key changed", async () => {
    /**
     * This used to assert the opposite: replacing a key marked every past signature
     * unverified, and the report untrustworthy. That conflated two different questions.
     * Verification asks whether the maths holds against the key that made the signature, and
     * it does. Revocation asks whether that key should still be trusted, which is a separate
     * matter and not one a laboratory answers by silently failing arithmetic — the old
     * behaviour would have turned an archive red the first time anyone renewed a DSC, and
     * reported "tampered" about records nobody had touched.
     */
    const key = (await call("POST", "/me/signing-key", "u-dir")).json();
    await call("POST", "/reports/R1/sign", "u-dir", { privateKeyPem: key.privateKeyPem });

    // A new key is registered — the old signature was not made with it.
    await call("POST", "/me/signing-key", "u-dir");

    const res = (await call("GET", "/reports/R1/signatures", "u-dir")).json();
    expect(res.signatures[0].verified).toBe(true);
    expect(res.trustworthy).toBe(true);
    // The fact is surfaced rather than buried, so a reader can weigh it.
    expect(res.signatures[0].keyRotated).toBe(true);
  });

  it("does not let another laboratory sign the report", async () => {
    db.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)").run("lab-x", "Other", "RRSL", T);
    db.prepare(
      "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
    ).run("u-x", "lab-x", "MA", "X", "x@x.gov.in", T);
    await call("POST", "/me/signing-key", "u-x");
    expect((await call("POST", "/reports/R1/sign", "u-x", {})).statusCode).toBe(403);
  });
});


describe("a rotated key does not invalidate the signatures made before it", () => {
  /**
   * Verification used to look the signer's key up on the user row, so an officer who rotated
   * their key silently turned every signature they had ever made red — on reports that had not
   * changed at all. A signature is an assertion about a moment, so the key that made it is part
   * of the record of that moment.
   */
  it("verifies each signature against the key that actually made it", async () => {
    await call("POST", "/reports", "u-ma", { reportId: "K1", profile: "OIML_R76" });
    const first = (await call("POST", "/me/signing-key", "u-ma", {})).json();
    await call("POST", "/reports/K1/sign", "u-ma", { privateKeyPem: first.privateKeyPem });

    const before = (await call("GET", "/reports/K1/signatures", "u-ma")).json();
    expect(before.signatures).toHaveLength(1);
    expect(before.signatures[0].verified).toBe(true);

    // The officer registers a new pair — a lost device, a renewed DSC, an ordinary rotation.
    const second = (await call("POST", "/me/signing-key", "u-ma", {})).json();
    expect(second.publicKeyPem).not.toBe(first.publicKeyPem);

    const after = (await call("GET", "/reports/K1/signatures", "u-ma")).json();
    expect(after.signatures[0].verified, "the old signature is still good").toBe(true);

    // And a signature made under the new key verifies too, so both coexist on one report.
    await call("POST", "/reports/K1/sign", "u-ma", { privateKeyPem: second.privateKeyPem });
    const both = (await call("GET", "/reports/K1/signatures", "u-ma")).json();
    expect(both.signatures).toHaveLength(2);
    expect(both.signatures.every((s: { verified: boolean }) => s.verified)).toBe(true);
  });
});
