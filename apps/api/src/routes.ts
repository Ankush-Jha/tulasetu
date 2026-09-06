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
import { ServiceError } from "./domain/service.js";

export interface RouteOptions {
  db: Db;
  pack: RulePack;
  /** Injected so tests can pin time. Defaults to the wall clock. */
  now?: () => string;
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
  const { db, pack } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const ctx = () => ({ db, pack, now: now() });

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
  }));

  /** The rule pack in force. Published so a report's numbers can be independently rechecked. */
  app.get("/rulepack", async () => pack);

  app.get("/lifecycle", async () => ({
    transitions: TRANSITIONS.map((t) => ({
      from: t.from, to: t.to, event: t.event, roles: t.roles, label: t.label,
      basis: t.basis, requires: t.requires ?? [],
    })),
  }));

  app.get("/me", guard((p) => ({ ...p, capabilities: capabilitiesOf(p.role) })));

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
