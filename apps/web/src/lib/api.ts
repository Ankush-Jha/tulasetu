/**
 * Typed client for the TulaSetu API (`apps/api`).
 *
 * The engine is deliberately reachable over HTTP rather than bundled into the browser
 * (CLAUDE.md §4): capture and report generation are decoupled, so a bench rig or C-DAC's
 * software-testing facility can post the same observations this UI does. The consequence for
 * the front end is that **the browser never computes a verdict**. Every mpe, every error,
 * every PASSED/FAILED on screen came from the server's deterministic engine. If this file
 * ever grows a calculation, that guarantee is gone.
 *
 * Identity is sent as `X-User-Id`, matching the API's demonstration authentication. That is a
 * stub on both sides and is documented as one; swapping it for NIC SSO or a DSC-backed
 * session changes this file and `auth.tsx`, and nothing else.
 */

const BASE = import.meta.env["VITE_API_BASE"] ?? "/api";

export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: the web app builds with
  // `erasableSyntaxOnly`, which forbids syntax that has to emit code to work.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let currentUserId: string | null = null;

export function setApiUser(userId: string | null): void {
  currentUserId = userId;
}

export function getApiUser(): string | null {
  return currentUserId;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      ...(signal ? { signal } : {}),
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(currentUserId ? { "X-User-Id": currentUserId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    // A network failure is the common case on a lab bench that has gone offline, so it gets
    // a message an officer can act on rather than the browser's own wording.
    throw new ApiError(
      0,
      "NETWORK",
      "Cannot reach the TulaSetu server. Check that the API is running and try again.",
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    const p = payload as { error?: string; message?: string } | null;
    throw new ApiError(res.status, p?.error ?? "UNKNOWN", p?.message ?? `Request failed (${res.status}).`);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Shapes returned by the API
// ---------------------------------------------------------------------------

export type RoleId = "MA" | "AD" | "DD" | "DIRECTOR" | "ADMIN";

export interface Me {
  userId: string;
  labId: string;
  role: RoleId;
  capabilities: string[];
}

export interface ReportSummary {
  id: string;
  lab_id: string;
  status: string;
  ruleset_id: string;
  profile: string;
  application_no: string | null;
  manufacturer: string | null;
  model: string | null;
  accuracy_class: string | null;
  max_capacity_g: number | null;
  overall_verdict: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ReportForm {
  report_id: string;
  form_id: string;
  test_id: string;
  range_index: number | null;
  applicable: number;
  verdict: string | null;
  na_reason: string | null;
  result_json: string | null;
  updated_at: string;
}

export interface LifecycleTransition {
  from: string;
  to: string;
  event: string;
  roles: RoleId[];
  label: string;
  basis: string;
  requires: string[];
}

export interface ReportDetail {
  report: ReportSummary & { instrument_json: string | null; locked_hash: string | null; version: number };
  forms: ReportForm[];
  available: LifecycleTransition[];
  guards: string[];
}

export interface Issue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: string;
  clause?: string;
}

export interface ApplicableTest {
  testId: string;
  formId: string;
  kernel: string;
  title?: string;
  applicable: boolean;
  reason?: string;
  clause?: string;
  rangeIndex?: number;
  order: number;
}

export interface MpeResolution {
  mpe: number;
  factor: number;
  e: number;
  rangeIndex: number;
  m: number;
  stage: string;
  reason: string;
  clause?: string;
}

export interface WeighingRow {
  load: number;
  indication: number;
  additionalLoad: number;
  priorToRounding: number;
  error: number;
  correctedError: number;
  mpe: MpeResolution;
  verdict: string;
  roundingEliminated: boolean;
  label?: string;
}

export interface DashboardCounts {
  inProcess: number;
  completed: number;
  withDeficiency: number;
  total: number;
  byStatus: Record<string, number>;
}

export interface Rule49Return {
  labId: string | null;
  labName: string | null;
  from: string;
  to: string;
  modelsTested: number;
  modelsApproved: number;
  modelsRejected: number;
  modelsInProgress: number;
  feesRealisedInr: number;
  medianTurnaroundDays: number | null;
  perTest: {
    formId: string;
    testId: string;
    timesPerformed: number;
    passed: number;
    failed: number;
    medianMinutes: number | null;
    meanMinutes: number | null;
  }[];
  byAccuracyClass: Record<string, number>;
  exceededThreeMonths: number;
  generatedAt: string;
  caveats: string[];
}

export interface AuditTrail {
  verification: { ok: boolean; eventCount: number; brokenAtSeq?: number; reason?: string };
  events: {
    version: number;
    eventType: string;
    actorId: string;
    recordedAt: string;
    hash: string;
    payload: Record<string, unknown>;
  }[];
}

export interface FamilyVariant {
  id: string;
  family?: string;
  accuracyClass: string;
  max: number;
  e: number;
  d: number;
  n?: number;
  unit?: string;
  temperatureRange?: { minC: number; maxC: number };
}

export interface FamilyResult {
  selections: { eut: boolean; variant: FamilyVariant; justification: string; clause: string }[];
  coverageClause: string;
  summary: unknown[];
  issues: Issue[];
}

export interface Attachment {
  id: string;
  report_id: string;
  kind: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  confidentiality: "public" | "restricted" | "confidential";
  uploaded_by: string;
  uploaded_at: string;
}

export interface RulePackInfo {
  ruleset_id: string;
  version?: string;
  edition?: string;
  tests: { id: string; form: string; kernel: string; title?: string; clause?: string }[];
  mpe_bands_initial: { limit: string; max_m_in_e: Record<string, number | null> }[];
  classification: unknown[];
  checklist_rules?: { id: string; title?: string; clause?: string }[];
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const api = {
  health: (signal?: AbortSignal) =>
    request<{ ok: boolean; rulesetId: string; rulesetVersion: string | null; edition: string | null }>(
      "GET", "/health", undefined, signal),

  me: (signal?: AbortSignal) => request<Me>("GET", "/me", undefined, signal),

  rulepack: (signal?: AbortSignal) => request<RulePackInfo>("GET", "/rulepack", undefined, signal),

  lifecycle: (signal?: AbortSignal) =>
    request<{ transitions: LifecycleTransition[] }>("GET", "/lifecycle", undefined, signal),

  listReports: (query: Record<string, string | number | undefined> = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const suffix = qs.toString();
    return request<ReportSummary[]>("GET", `/reports${suffix ? `?${suffix}` : ""}`, undefined, signal);
  },

  createReport: (body: {
    reportId: string;
    applicationNo?: string;
    profile: "IN_Sch7A" | "OIML_R76" | "BOTH";
    feePaidInr?: number;
  }) => request<ReportSummary>("POST", "/reports", body),

  getReport: (id: string, signal?: AbortSignal) =>
    request<ReportDetail>("GET", `/reports/${encodeURIComponent(id)}`, undefined, signal),

  setProfile: (id: string, profile: unknown, expectedVersion?: number) =>
    request<{ report: ReportSummary; issues: Issue[]; applicable: ApplicableTest[] }>(
      "PUT", `/reports/${encodeURIComponent(id)}/profile`,
      { profile, ...(expectedVersion !== undefined ? { expectedVersion } : {}) },
    ),

  recordObservations: (
    id: string,
    formId: string,
    body: { testId?: string; rangeIndex?: number; observations: unknown[]; zeroError?: number; environment?: unknown[] },
  ) =>
    request<{ verdict: string; issues: Issue[]; rows: WeighingRow[] }>(
      "POST", `/reports/${encodeURIComponent(id)}/forms/${encodeURIComponent(formId)}/observations`, body,
    ),

  previewMpe: (id: string, load: number, signal?: AbortSignal) =>
    request<MpeResolution>("GET", `/reports/${encodeURIComponent(id)}/mpe?load=${load}`, undefined, signal),

  solveFamily: (id: string, variants: FamilyVariant[]) =>
    request<FamilyResult>("POST", `/reports/${encodeURIComponent(id)}/family`, { variants }),

  transition: (id: string, body: { to: string; pdfSha256?: string; note?: string; expectedVersion?: number }) =>
    request<ReportSummary>("POST", `/reports/${encodeURIComponent(id)}/transition`, body),

  raiseDeficiency: (id: string, body: { id: string; formId?: string; severity: string; text: string }) =>
    request<{ ok: true }>("POST", `/reports/${encodeURIComponent(id)}/deficiencies`, body),

  resolveDeficiency: (id: string, deficiencyId: string, resolution: string) =>
    request<{ ok: true }>(
      "POST", `/reports/${encodeURIComponent(id)}/deficiencies/${encodeURIComponent(deficiencyId)}/resolve`,
      { resolution },
    ),

  /**
   * Download a rendered report.
   *
   * Returns a Blob rather than parsed JSON because two of the four formats are binary. The
   * server records the render in the append-only log, so this is a write as far as the report's
   * history is concerned even though it is a GET.
   */
  renderUrl: (id: string, format: "pdf" | "docx" | "json" | "html", inline = false) =>
    `${BASE}/reports/${encodeURIComponent(id)}/render/${format}${inline ? "?inline=1" : ""}`,

  download: async (id: string, format: "pdf" | "docx" | "json" | "html") => {
    const res = await fetch(api.renderUrl(id, format), {
      headers: { ...(currentUserId ? { "X-User-Id": currentUserId } : {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body?.error ?? "UNKNOWN", body?.message ?? "Could not render the report.");
    }
    return {
      blob: await res.blob(),
      sha256: res.headers.get("X-TulaSetu-SHA256") ?? "",
      filename: /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${id}.${format}`,
    };
  },

  signatures: (id: string, signal?: AbortSignal) =>
    request<{
      chain: { ok: boolean; eventCount: number; reason?: string };
      trustworthy: boolean;
      signatures: {
        eventVersion: number; actorId: string; actorName: string; role: string;
        recordedAt: string; hash: string; signature: string; verified: boolean; reason?: string;
      }[];
    }>("GET", `/reports/${encodeURIComponent(id)}/signatures`, undefined, signal),

  registerSigningKey: () =>
    request<{ publicKeyPem: string; privateKeyPem?: string; generated: boolean }>(
      "POST", "/me/signing-key", {}),

  signReport: (id: string, body: { signature?: string; privateKeyPem?: string }) =>
    request<{ signedVersion: number; hash: string; signature: string }>(
      "POST", `/reports/${encodeURIComponent(id)}/sign`, body),

  attachments: (id: string, signal?: AbortSignal) =>
    request<Attachment[]>("GET", `/reports/${encodeURIComponent(id)}/attachments`, undefined, signal),

  attachmentUrl: (reportId: string, attachmentId: string, inline = false) =>
    `${BASE}/reports/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(attachmentId)}${inline ? "?inline=1" : ""}`,

  uploadAttachment: async (
    reportId: string,
    file: File,
    kind: string,
    confidentiality: string,
  ): Promise<Attachment> => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("confidentiality", confidentiality);
    form.append("file", file);
    const res = await fetch(`${BASE}/reports/${encodeURIComponent(reportId)}/attachments`, {
      method: "POST",
      headers: { ...(currentUserId ? { "X-User-Id": currentUserId } : {}) },
      body: form,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body?.error ?? "UNKNOWN", body?.message ?? "Upload failed.");
    return body as Attachment;
  },

  checklistAnswers: (id: string, signal?: AbortSignal) =>
    request<{ checklist_id: string; item_index: number; item_ref: string; answer: "yes" | "no" | "na"; remark: string | null; updated_at: string }[]>(
      "GET", `/reports/${encodeURIComponent(id)}/checklist`, undefined, signal),

  saveChecklistAnswers: (
    id: string,
    checklistId: string,
    answers: { index: number; ref?: string; answer: "yes" | "no" | "na"; remark?: string }[],
  ) =>
    request<{ recorded: number }>("POST", `/reports/${encodeURIComponent(id)}/checklist`, {
      checklistId, answers,
    }),

  /** Render the record copy and lock the report to it — deliberately one step. */
  lock: (id: string) =>
    request<{ report: ReportSummary; sha256: string }>("POST", `/reports/${encodeURIComponent(id)}/lock`),

  audit: (id: string, signal?: AbortSignal) =>
    request<AuditTrail>("GET", `/reports/${encodeURIComponent(id)}/audit`, undefined, signal),

  verify: (id: string, signal?: AbortSignal) =>
    request<AuditTrail["verification"]>("GET", `/reports/${encodeURIComponent(id)}/verify`, undefined, signal),

  dashboard: (signal?: AbortSignal) => request<DashboardCounts>("GET", "/dashboard", undefined, signal),

  rule49: (query: { from?: string; to?: string; scope?: "national"; labId?: string } = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) qs.set(k, String(v));
    const suffix = qs.toString();
    return request<Rule49Return>("GET", `/stats/rule-4-9${suffix ? `?${suffix}` : ""}`, undefined, signal);
  },
};
