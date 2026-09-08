/**
 * HTTP surface.
 *
 * Thin by design: each route authenticates, delegates to `service.ts`, and maps a
 * `ServiceError` to a status. No business rule lives here — putting one in a route would put
 * it outside the tests that prove the compliance story.
 *
 * The engine is exposed as an API deliberately (CLAUDE.md §4): capture and report generation
 * are decoupled, so a future automated bench or C-DAC's software-testing facility can post
 * observations without going through our UI.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RulePack } from "@tulasetu/engine";

import type { Db } from "./db/open.js";
import { verifyChain } from "./db/events.js";
import { rebuildAllProjections } from "./domain/events.js";
import { availableTransitions, TRANSITIONS, type ReportState, type RoleId } from "./domain/lifecycle.js";
import { capabilitiesOf, type Principal } from "./domain/rbac.js";
import { dashboardCounts, rule4_9AnnualReturn, searchReports } from "./domain/stats.js";
import * as svc from "./domain/service.js";
import { loadFormsFile, type RenderFormat } from "./domain/render.js";
import { seedDemonstrationData } from "./domain/demo.js";
import {
  ATTACHMENT_KINDS,
  MAX_BYTES,
  type AttachmentKind,
  type AttachmentRow,
  type Confidentiality,
} from "./domain/attachments.js";
import { ServiceError } from "./domain/service.js";

export interface RouteOptions {
  db: Db;
  pack: RulePack;
  /** R 76-2 §17 checklist bank, if one is loaded alongside the pack. */
  checklists?: unknown;
  /** Injected so tests can pin time. Defaults to the wall clock. */
  now?: () => string;
  /** Directory for attachment bytes. Defaults to ./attachments beside the database. */
  attachmentRoot?: string;
}

/**
 * What an attachment looks like over the wire.
 *
 * `storage_path` is deliberately not included: where a file sits on the server's disk is not
 * the client's business, and publishing it invites a path-traversal attempt.
 */
function publicView(row: AttachmentRow) {
  const { storage_path: _omit, ...rest } = row;
  return rest;
}

/**
 * Resolve the caller.
 *
 * Header-based and deliberately minimal: this is the seam where a real deployment plugs in
 * NIC SSO or a DSC-backed login. It is *not* authentication, and it says so — shipping it
 * unreplaced would let any caller claim any role, so the server refuses to start in
 * production without a real provider (see `server.ts`).
 */
function authenticate(db: Db, req: FastifyRequest): Principal {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string" || !userId) {
    throw new ServiceError(401, "UNAUTHENTICATED", "Missing X-User-Id header.");
  }
  const row = db
    .prepare("SELECT id, lab_id, role_id, active FROM users WHERE id = ?")
    .get(userId) as { id: string; lab_id: string; role_id: string; active: number } | undefined;
  if (!row) throw new ServiceError(401, "UNKNOWN_USER", `No such user ${userId}.`);
  if (!row.active) throw new ServiceError(403, "INACTIVE_USER", "This account is not active.");
  return { userId: row.id, labId: row.lab_id, role: row.role_id as RoleId };
}

function send(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ServiceError) {
    return reply.status(err.status).send({ error: err.code, message: err.message });
  }
  const message = err instanceof Error ? err.message : String(err);
  // A version clash is a normal outcome of two officers working at once, not a server fault.
  if (err instanceof Error && err.name === "ConcurrencyError") {
    return reply.status(409).send({ error: "CONFLICT", message });
  }
  return reply.status(500).send({ error: "INTERNAL", message });
}

export function registerRoutes(app: FastifyInstance, opts: RouteOptions): void {
  const { db, pack, checklists } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const attachmentRoot = opts.attachmentRoot ?? "attachments";
  const ctx = () => ({ db, pack, now: now(), attachmentRoot });

  const guard =
    <T>(fn: (principal: Principal, req: FastifyRequest) => T) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        return fn(authenticate(db, req), req);
      } catch (err) {
        return send(reply, err);
      }
    };

  // --- meta ---------------------------------------------------------------

  app.get("/health", async () => ({
    ok: true,
    rulesetId: pack.ruleset_id,
    rulesetVersion: pack["version"] ?? null,
    edition: pack.edition ?? null,
    // A draft edition must announce itself everywhere it appears. A report computed against a
    // committee draft looks exactly like one computed against the standard in force.
    draftEdition: String(pack["status"] ?? "").toLowerCase().includes("draft"),
    ...(pack["status"] ? { rulesetStatus: pack["status"] } : {}),
  }));

  /** The rule pack in force. Published so a report's numbers can be independently rechecked. */
  app.get("/rulepack", async () => pack);

  /**
   * R 76-2 §17's checklists, as transcribed from the standard.
   *
   * Served rather than bundled into the client for the same reason the rule pack is: the
   * checklist is part of the standard, it changes when the standard does, and a copy compiled
   * into a browser build is a copy that can silently fall behind the one the engine uses.
   */
  app.get("/checklists", async (_req, reply) => {
    if (!checklists) {
      return reply.status(404).send({
        error: "NO_CHECKLISTS",
        message: "No checklist file is loaded for this rule pack.",
      });
    }
    return checklists;
  });

  /**
   * The printed layout of every R 76-2 form: its columns, formulas, acceptance criterion and
   * environmental header.
   *
   * Served for the same reason the rule pack is. The entry screen draws its inputs from this,
   * the runner computes from it and the renderer prints from it — one description, so a column
   * cannot appear on screen that the report has no place for. Compiling a copy into the browser
   * bundle would be a copy that silently falls behind the one the engine uses.
   */
  app.get("/forms", async () => {
    const file = loadFormsFile();
    // Each form is paired with the kernel the *rule pack* names for it, not the one the forms
    // file guessed: the pack is what the runner dispatches on, so the screen must agree with it.
    const kernelOf = new Map(pack.tests.map((t) => [t.form, t.kernel]));
    return {
      ...file,
      forms: file.forms.map((f) => ({
        ...f,
        ...(kernelOf.has(f.formId) ? { kernel: kernelOf.get(f.formId) } : {}),
      })),
    };
  });

  app.get("/lifecycle", async () => ({
    transitions: TRANSITIONS.map((t) => ({
      from: t.from, to: t.to, event: t.event, roles: t.roles, label: t.label,
      basis: t.basis, requires: t.requires ?? [],
    })),
  }));

  app.get("/me", guard((p) => ({ ...p, capabilities: capabilitiesOf(p.role) })));

  /**
   * The family/EUT solver, standing alone.
   *
   * It is a pure function of the variants and the rule pack — it reads nothing from a report
   * and writes nothing — so binding it to a report id would be an access check protecting no
   * data. A laboratory quoting for a family before any report exists is the normal case.
   */
  app.post(
    "/tools/family",
    guard((_p, req) => {
      const { variants } = req.body as { variants?: Parameters<typeof svc.solveFamilyStandalone>[1] };
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new ServiceError(400, "NO_VARIANTS", "Provide at least one variant.");
      }
      return svc.solveFamilyStandalone(ctx(), variants);
    }),
  );

  /**
   * Preview a profile without saving it.
   *
   * What the registration wizard's live panel reads on every keystroke: the validation
   * findings, the permissible-error bands, and the tests the instrument attracts. Pure — it
   * records nothing — but it is a real engine call, so what the officer sees while typing is
   * what the report will carry.
   */
  app.post(
    "/tools/profile-preview",
    guard((_p, req) => {
      const { profile } = req.body as { profile?: Parameters<typeof svc.previewProfile>[1] };
      if (!profile) throw new ServiceError(400, "NO_PROFILE", "Send the profile to preview.");
      return svc.previewProfile(ctx(), profile);
    }),
  );

  /** Annex F module compatibility, likewise pure and not tied to a report. */
  app.post(
    "/tools/modules",
    guard((_p, req) => svc.checkModulesStandalone(ctx(), req.body as Parameters<typeof svc.checkModulesStandalone>[1])),
  );

  // --- reports ------------------------------------------------------------

  app.get(
    "/reports",
    guard((p, req) => {
      const q = req.query as Record<string, string | undefined>;
      // A caller who cannot read across laboratories is scoped to their own, whatever they ask.
      const labId = capabilitiesOf(p.role).includes("report:read_any_lab") ? q["labId"] : p.labId;
      return searchReports(db, {
        ...(labId ? { labId } : {}),
        ...(q["status"] ? { status: q["status"] } : {}),
        ...(q["accuracyClass"] ? { accuracyClass: q["accuracyClass"] } : {}),
        ...(q["manufacturer"] ? { manufacturer: q["manufacturer"] } : {}),
        ...(q["model"] ? { model: q["model"] } : {}),
        ...(q["createdFrom"] ? { createdFrom: q["createdFrom"] } : {}),
        ...(q["createdTo"] ? { createdTo: q["createdTo"] } : {}),
        ...(q["limit"] ? { limit: Number(q["limit"]) } : {}),
        ...(q["offset"] ? { offset: Number(q["offset"]) } : {}),
      });
    }),
  );

  app.post(
    "/reports",
    guard((p, req) => svc.createReport(ctx(), p, req.body as svc.CreateReportInput)),
  );

  app.get(
    "/reports/:id",
    guard((p, req) => {
      const id = (req.params as { id: string }).id;
      const report = svc.getReport(ctx(), p, id);
      return {
        report,
        forms: svc.getReportForms(ctx(), p, id),
        available: availableTransitions(report.status as ReportState, p.role),
        guards: svc.satisfiedGuards(ctx(), id),
      };
    }),
  );

  app.put(
    "/reports/:id/profile",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      const body = req.body as { profile: Parameters<typeof svc.setInstrumentProfile>[3]; expectedVersion?: number };
      return svc.setInstrumentProfile(ctx(), p, id, body.profile, body.expectedVersion);
    }),
  );

  app.post(
    "/reports/:id/forms/:formId/observations",
    guard((p, req) => {
      const { id, formId } = req.params as { id: string; formId: string };
      const body = req.body as Omit<svc.RecordObservationsInput, "formId">;
      return svc.recordWeighingObservations(ctx(), p, id, { ...body, formId });
    }),
  );

  /** Live mpe for a load, without recording anything — what the wizard calls as an officer types. */
  app.get(
    "/reports/:id/mpe",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      const load = Number((req.query as { load?: string }).load);
      if (!Number.isFinite(load)) {
        throw new ServiceError(400, "BAD_LOAD", "Query parameter `load` must be a number.");
      }
      return svc.previewMpe(ctx(), p, id, load);
    }),
  );

  app.post(
    "/reports/:id/family",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      const { variants } = req.body as { variants: Parameters<typeof svc.runFamilySolver>[3] };
      return svc.runFamilySolver(ctx(), p, id, variants);
    }),
  );

  app.post(
    "/reports/:id/transition",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      return svc.transitionReport(ctx(), p, id, req.body as svc.TransitionInput);
    }),
  );

  app.post(
    "/reports/:id/deficiencies",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      svc.raiseDeficiency(ctx(), p, id, req.body as svc.DeficiencyInput);
      return { ok: true };
    }),
  );

  app.post(
    "/reports/:id/deficiencies/:deficiencyId/resolve",
    guard((p, req) => {
      const { id, deficiencyId } = req.params as { id: string; deficiencyId: string };
      const { resolution } = req.body as { resolution: string };
      svc.resolveDeficiency(ctx(), p, id, deficiencyId, resolution);
      return { ok: true };
    }),
  );

  // --- attachments --------------------------------------------------------

  app.get(
    "/reports/:id/attachments",
    guard((p, req) =>
      svc.listReportAttachments(ctx(), p, (req.params as { id: string }).id).map(publicView),
    ),
  );

  /**
   * Attach a file. Multipart, because a scanned drawing is not JSON.
   *
   * `kind` names the slot it fills — `model_photo` is R 76-2's Figure 1 and `sealing_diagram`
   * its Figure 2.
   */
  app.post("/reports/:id/attachments", async (req, reply) => {
    try {
      const principal = authenticate(db, req);
      const { id } = req.params as { id: string };

      const anyReq = req as unknown as { isMultipart?: () => boolean; file?: () => Promise<unknown> };
      if (!anyReq.isMultipart?.()) {
        throw new ServiceError(
          400, "NOT_MULTIPART",
          "Attach the file as multipart/form-data, with the file part named `file`.",
        );
      }

      const part = (await anyReq.file!()) as
        | {
            filename: string;
            mimetype: string;
            toBuffer: () => Promise<Buffer>;
            fields?: Record<string, { value?: string }>;
          }
        | undefined;
      if (!part) throw new ServiceError(400, "NO_FILE", "No file part was sent.");

      const bytes = await part.toBuffer();
      const kind = (part.fields?.["kind"]?.value ?? "document") as AttachmentKind;
      const confidentiality = part.fields?.["confidentiality"]?.value as Confidentiality | undefined;

      if (!ATTACHMENT_KINDS.includes(kind)) {
        throw new ServiceError(
          400, "BAD_KIND",
          `Unknown attachment kind ${kind}. Use one of: ${ATTACHMENT_KINDS.join(", ")}.`,
        );
      }

      const row = svc.addAttachment(
        ctx(), principal, id,
        {
          kind,
          filename: part.filename,
          mimeType: part.mimetype,
          bytes: new Uint8Array(bytes),
          ...(confidentiality ? { confidentiality } : {}),
        },
        attachmentRoot,
      );
      return publicView(row);
    } catch (err) {
      return send(reply, err);
    }
  });

  /** Serve the bytes back, hash-verified on the way out. */
  app.get("/reports/:id/attachments/:attachmentId", async (req, reply) => {
    try {
      const principal = authenticate(db, req);
      const { id, attachmentId } = req.params as { id: string; attachmentId: string };
      const { row, bytes } = svc.readAttachment(ctx(), principal, id, attachmentId);
      const inline = (req.query as { inline?: string }).inline === "1";
      return reply
        .header("Content-Type", row.mime_type)
        .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${row.filename}"`)
        // No sniffing: an attachment is served as exactly the type it was stored as.
        .header("X-Content-Type-Options", "nosniff")
        .header("X-TulaSetu-SHA256", row.sha256)
        .send(Buffer.from(bytes));
    } catch (err) {
      return send(reply, err);
    }
  });

  // --- signatures (FR16) ---------------------------------------------------

  /**
   * Register a signing key.
   *
   * With a `publicKeyPem` in the body this takes only the public half — the deployment case,
   * where the private half is on the officer's DSC token. With no body it generates a pair and
   * returns the private half **once**, for the demonstration; that is a convenience, not a
   * security property.
   */
  app.post(
    "/me/signing-key",
    guard((p, req) => {
      const body = (req.body ?? {}) as { publicKeyPem?: string };
      return svc.registerSigningKey(ctx(), p, body.publicKeyPem);
    }),
  );

  app.get(
    "/reports/:id/signatures",
    guard((p, req) => svc.getSignatures(ctx(), p, (req.params as { id: string }).id)),
  );

  app.post(
    "/reports/:id/sign",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      return svc.signReport(ctx(), p, id, (req.body ?? {}) as { signature?: string; privateKeyPem?: string });
    }),
  );

  // --- checklist ----------------------------------------------------------

  app.get(
    "/reports/:id/checklist",
    guard((p, req) => svc.getChecklistAnswers(ctx(), p, (req.params as { id: string }).id)),
  );

  app.post(
    "/reports/:id/checklist",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      return svc.recordChecklistAnswers(ctx(), p, id, req.body as svc.ChecklistAnswerInput);
    }),
  );

  // --- rendering ----------------------------------------------------------

  /**
   * Download the report in one of its three formats (plus `html`, which is what the PDF is
   * printed from — useful for checking layout without a browser round-trip).
   *
   * The rendering is logged: which copy left the building, when, and its hash.
   */
  app.get("/reports/:id/render/:format", async (req, reply) => {
    try {
      const principal = authenticate(db, req);
      const { id, format } = req.params as { id: string; format: string };
      if (!["pdf", "docx", "json", "html"].includes(format)) {
        throw new ServiceError(400, "BAD_FORMAT", `Unknown format ${format}. Use pdf, docx, json or html.`);
      }
      const rendered = await svc.renderReportForDownload(ctx(), principal, id, format as RenderFormat);
      const inline = (req.query as { inline?: string }).inline === "1";
      return reply
        .header("Content-Type", rendered.contentType)
        .header(
          "Content-Disposition",
          `${inline ? "inline" : "attachment"}; filename="${rendered.filename}"`,
        )
        // So a downloaded copy can be matched back to the render that produced it.
        .header("X-TulaSetu-SHA256", rendered.sha256)
        .send(Buffer.from(rendered.bytes));
    } catch (err) {
      return send(reply, err);
    }
  });

  /**
   * Render the record copy and lock the report to it, in one step.
   *
   * One operation on purpose: rendering and locking separately leaves a window in which the
   * report could change between them, and the recorded hash would then belong to a document
   * that no longer exists.
   */
  app.post("/reports/:id/lock", async (req, reply) => {
    try {
      const principal = authenticate(db, req);
      const { id } = req.params as { id: string };
      return await svc.renderAndLock(ctx(), principal, id);
    } catch (err) {
      return send(reply, err);
    }
  });

  // --- audit --------------------------------------------------------------

  app.get(
    "/reports/:id/audit",
    guard((p, req) => svc.getAuditTrail(ctx(), p, (req.params as { id: string }).id)),
  );

  app.get(
    "/reports/:id/verify",
    guard((p, req) => {
      const { id } = req.params as { id: string };
      svc.getReport(ctx(), p, id); // access check
      return verifyChain(db, id);
    }),
  );

  // --- dashboard and statutory returns ------------------------------------

  app.get(
    "/dashboard",
    guard((p) => dashboardCounts(db, capabilitiesOf(p.role).includes("stats:read_national") ? undefined : p.labId)),
  );

  /**
   * The Rule 4(9) annual return.
   *
   * Every approved laboratory owes this — models tested, fees realised, time taken per test.
   * Because observations are timestamped events, it is a query rather than a data-gathering
   * exercise, and it ships with the caveats that say how each figure was measured.
   */
  app.get(
    "/stats/rule-4-9",
    guard((p, req) => {
      const q = req.query as Record<string, string | undefined>;
      const national = q["scope"] === "national";
      if (national && !capabilitiesOf(p.role).includes("stats:read_national")) {
        throw new ServiceError(403, "FORBIDDEN", "Only the Director may read the national roll-up.");
      }
      const year = q["year"] ?? String(new Date(now()).getUTCFullYear());
      return rule4_9AnnualReturn(db, {
        labId: national ? null : (q["labId"] && capabilitiesOf(p.role).includes("report:read_any_lab") ? q["labId"] : p.labId),
        from: q["from"] ?? `${year}-01-01`,
        to: q["to"] ?? `${year}-12-31`,
        generatedAt: now(),
      });
    }),
  );

  /**
   * Seed the demonstration set.
   *
   * Available to anyone who may create a report, because the point is that a visitor can
   * populate the prototype themselves rather than needing an administrator. Idempotent, and
   * everything it creates is visibly labelled as a demonstration.
   */
  app.post(
    "/admin/demo-data",
    async (req, reply) => {
      try {
        const principal = authenticate(db, req);
        if (!capabilitiesOf(principal.role).includes("report:create")) {
          throw new ServiceError(
            403, "FORBIDDEN",
            "Seeding demonstration data needs a role that can create reports — sign in as the " +
              "Metrological Assistant.",
          );
        }
        return await seedDemonstrationData(ctx(), principal);
      } catch (err) {
        return send(reply, err);
      }
    },
  );

  // --- maintenance --------------------------------------------------------

  /**
   * Replay every report from the log.
   *
   * Safe by construction: projections are derived, so this can only rebuild what the log
   * already says. It is how a reducer fix is applied to history — no migration, nothing lost.
   */
  app.post(
    "/admin/rebuild-projections",
    guard((p) => {
      if (!capabilitiesOf(p.role).includes("user:manage")) {
        throw new ServiceError(403, "FORBIDDEN", "Administrator only.");
      }
      return { rebuilt: rebuildAllProjections(db) };
    }),
  );
}
