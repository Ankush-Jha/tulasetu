/**
 * Attachments.
 *
 * The claims worth proving: that a submitted drawing is not readable by anyone who merely has
 * access to the report (AoM Rule 16(2)), that a file cannot be stored under a type it is not,
 * that the same bytes are stored once, and that a file altered on disk is caught on the way
 * out rather than served silently.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RulePack } from "@tulasetu/engine";

import { openMemoryDb, type Db } from "../src/db/open.js";
import { registerRoutes } from "../src/routes.js";
import { storagePathFor } from "../src/domain/attachments.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  readFileSync(join(HERE, "../../../packages/rulepacks/OIML_R76_2006.json"), "utf8"),
) as RulePack;

const T = "2026-09-07T10:00:00.000Z";

/** A minimal but genuine PNG — the 8-byte signature plus enough to be a real file. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);
const PDF = Buffer.from("%PDF-1.4\n% a drawing\n", "latin1");

let db: Db;
let app: FastifyInstance;
let root: string;

/** Build a multipart body by hand — no dependency, and it keeps the wire format visible. */
function multipartBody(
  file: Buffer,
  filename: string,
  contentType: string,
  fields: Record<string, string> = {},
) {
  const boundary = "----tulasetu-test-boundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(
  userId: string,
  file: Buffer,
  filename: string,
  contentType: string,
  fields: Record<string, string> = {},
) {
  const { body, contentType: ct } = multipartBody(file, filename, contentType, fields);
  return app.inject({
    method: "POST",
    url: "/reports/R1/attachments",
    headers: { "x-user-id": userId, "content-type": ct },
    payload: body,
  });
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "tulasetu-attach-"));
  db = openMemoryDb();
  db.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)").run("lab-fbd", "RRSL", "RRSL", T);
  db.prepare("INSERT INTO labs (id,name,kind,created_at) VALUES (?,?,?,?)").run("lab-x", "Other", "RRSL", T);
  const u = db.prepare(
    "INSERT INTO users (id,lab_id,role_id,full_name,email,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  u.run("u-ma", "lab-fbd", "MA", "A. Assistant", "ma@x.gov.in", T);
  u.run("u-ad", "lab-fbd", "AD", "B. Deputy", "ad@x.gov.in", T);
  u.run("u-other", "lab-x", "MA", "D. Other", "other@x.gov.in", T);

  app = Fastify();
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  registerRoutes(app, { db, pack, now: () => T, attachmentRoot: root });
  await app.ready();

  await app.inject({
    method: "POST", url: "/reports", headers: { "x-user-id": "u-ma" },
    payload: { reportId: "R1", profile: "IN_Sch7A" },
  });
});

afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe("upload", () => {
  it("accepts a PNG as Figure 1 and records its hash", async () => {
    const res = await upload("u-ma", PNG, "model.png", "image/png", { kind: "model_photo" });
    expect(res.statusCode).toBe(200);
    const row = res.json();
    expect(row.kind).toBe("model_photo");
    expect(row.mime_type).toBe("image/png");
    expect(row.sha256).toHaveLength(64);
    expect(row.byte_size).toBe(PNG.byteLength);
    // Where the file sits on disk is not the client's business.
    expect(row.storage_path).toBeUndefined();
  });

  it("defaults to restricted, because Rule 16(2) is the default", async () => {
    const res = await upload("u-ma", PDF, "drawing.pdf", "application/pdf", { kind: "descriptive_drawing" });
    expect(res.json().confidentiality).toBe("restricted");
  });

  it("refuses a type that is not on the allow-list", async () => {
    const res = await upload("u-ma", Buffer.from("<svg/>"), "x.svg", "image/svg+xml");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("UNSUPPORTED_TYPE");
  });

  it("refuses a file whose bytes do not match its declared type", async () => {
    // A .docx renamed to .pdf, or something worse dressed as an image.
    const res = await upload("u-ma", Buffer.from("PKnot a pdf"), "fake.pdf", "application/pdf");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("TYPE_MISMATCH");
  });

  it("refuses an empty file", async () => {
    const res = await upload("u-ma", Buffer.alloc(0), "empty.pdf", "application/pdf");
    expect(res.statusCode).toBe(400);
  });

  it("refuses an unknown kind", async () => {
    const res = await upload("u-ma", PNG, "x.png", "image/png", { kind: "not_a_kind" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("BAD_KIND");
  });

  it("stores identical bytes once, however many reports reference them", async () => {
    await upload("u-ma", PNG, "a.png", "image/png", { kind: "model_photo" });
    await upload("u-ma", PNG, "b.png", "image/png", { kind: "sealing_diagram" });

    const rows = (await app.inject({
      method: "GET", url: "/reports/R1/attachments", headers: { "x-user-id": "u-ma" },
    })).json();
    expect(rows).toHaveLength(2);
    expect(rows[0].sha256).toBe(rows[1].sha256);

    // Two rows, one file on disk.
    const shard = rows[0].sha256.slice(0, 2);
    expect(readdirSync(join(root, shard))).toHaveLength(1);
  });

  it("sanitises a filename that tries to escape the store", async () => {
    const res = await upload("u-ma", PNG, "../../etc/passwd.png", "image/png", { kind: "document" });
    expect(res.statusCode).toBe(200);
    expect(res.json().filename).not.toContain("/");
    expect(res.json().filename).not.toContain("..");
  });

  it("records the attachment in the append-only log", async () => {
    const up = await upload("u-ma", PNG, "model.png", "image/png", { kind: "model_photo" });
    const audit = (await app.inject({
      method: "GET", url: "/reports/R1/audit", headers: { "x-user-id": "u-ma" },
    })).json();
    const added = audit.events.filter((e: any) => e.eventType === "ATTACHMENT_ADDED");
    expect(added).toHaveLength(1);
    expect(added[0].payload.sha256).toBe(up.json().sha256);
    expect(audit.verification.ok).toBe(true);
  });

  it("refuses a request that is not multipart", async () => {
    const res = await app.inject({
      method: "POST", url: "/reports/R1/attachments",
      headers: { "x-user-id": "u-ma" }, payload: { kind: "model_photo" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("does not let another laboratory attach to the report", async () => {
    const res = await upload("u-other", PNG, "x.png", "image/png", { kind: "model_photo" });
    expect(res.statusCode).toBe(403);
  });
});

describe("download", () => {
  it("serves the bytes back exactly, with sniffing disabled", async () => {
    const up = await upload("u-ma", PNG, "model.png", "image/png", { kind: "model_photo" });
    const id = up.json().id;

    const res = await app.inject({
      method: "GET", url: `/reports/R1/attachments/${id}`, headers: { "x-user-id": "u-ma" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(res.rawPayload, PNG)).toBe(0);
  });

  it("keeps a confidential drawing from a role without the capability", async () => {
    const up = await upload("u-ma", PDF, "circuit.pdf", "application/pdf", {
      kind: "circuit_diagram", confidentiality: "confidential",
    });
    const id = up.json().id;

    // The MA uploaded it but cannot read it back — reading a manufacturer's confidential
    // drawing is a reviewing-role permission, not a consequence of having attached it.
    const denied = await app.inject({
      method: "GET", url: `/reports/R1/attachments/${id}`, headers: { "x-user-id": "u-ma" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().message).toMatch(/Rule 16\(2\)/);

    const allowed = await app.inject({
      method: "GET", url: `/reports/R1/attachments/${id}`, headers: { "x-user-id": "u-ad" },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("catches a file altered on disk instead of serving it", async () => {
    const up = await upload("u-ma", PNG, "model.png", "image/png", { kind: "model_photo" });
    const { id, sha256 } = up.json();

    // Someone with the filesystem swaps the bytes. The database row still points at the path.
    const path = storagePathFor(root, sha256, "png");
    expect(existsSync(path)).toBe(true);
    writeFileSync(path, Buffer.concat([PNG, Buffer.from("tampered")]));

    const res = await app.inject({
      method: "GET", url: `/reports/R1/attachments/${id}`, headers: { "x-user-id": "u-ma" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("HASH_MISMATCH");
    expect(res.json().message).toMatch(/altered or corrupted/i);
  });

  it("404s an attachment that belongs to no report", async () => {
    const res = await app.inject({
      method: "GET", url: "/reports/R1/attachments/does-not-exist", headers: { "x-user-id": "u-ma" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("does not let another laboratory read the attachment", async () => {
    const up = await upload("u-ma", PNG, "model.png", "image/png", { kind: "model_photo" });
    const res = await app.inject({
      method: "GET", url: `/reports/R1/attachments/${up.json().id}`, headers: { "x-user-id": "u-other" },
    });
    expect(res.statusCode).toBe(403);
  });
});
