/**
 * The shell around a single report.
 *
 * Loads the report once and shares it with every step through context, so the six steps do
 * not each re-fetch the same thing and then disagree about it after a write.
 *
 * It also carries the lifecycle controls, because they belong to the report rather than to any
 * one step: which transitions this officer may take from the current state, and which guards
 * are still unmet. Those come from the server — the same state machine that enforces them —
 * so the buttons on screen are exactly the moves that will be allowed.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ActionBar,
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  ErrorState,
  Field,
  humanizeStatus,
  Icon,
  LoadingState,
  Select,
  Spinner,
  StatusChip,
  TextArea,
  Verdict,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, type LifecycleTransition, type ReportDetail } from "../../lib/api";
import { useApi, useMutation } from "../../lib/useApi";
import { REPORT_STEPS, reportPath } from "../../lib/nav";
import { formatDate } from "../../lib/format";
import { ROLE_LABEL } from "../../lib/auth";

interface ReportContextValue {
  detail: ReportDetail;
  reportId: string;
  reload: () => void;
  /** Parsed instrument profile, or null while it has not been recorded. */
  instrument: InstrumentProfileShape | null;
  /**
   * May this officer still change anything? Comes from the server, which has always enforced
   * it; the screens now ask before drawing a form nothing will accept.
   */
  writable: boolean;
  /** Why not, in the server's own words — worth showing rather than paraphrasing. */
  readOnlyReason?: string;
}

/** The subset of the engine's InstrumentProfile the UI reads. */
export interface InstrumentProfileShape {
  unit: "mg" | "g" | "kg" | "t";
  accuracyClass: "I" | "II" | "III" | "IIII";
  indicatingType: "self" | "semi-self" | "non-self";
  rangeKind: "single" | "multi-interval" | "multiple-range";
  electronic: boolean;
  ranges: { e: number; d: number; max: number; min: number; n?: number }[];
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  softwareVersion?: string;
  softwareChecksum?: string;
  directSalesToPublic?: boolean;
  priceComputing?: boolean;
  softwareControlled?: boolean;
  vehiclePowered?: boolean;
  hasTareDevice?: boolean;
  hasPrintOrStorage?: boolean;
  tiltable?: boolean;
  rollingLoad?: boolean;
  modular?: boolean;
  powerSupply?: string[];
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used inside <ReportLayout>.");
  return ctx;
}

/**
 * Transitions whose consequence is irreversible enough (or expensive enough to undo) that a
 * single click should not be the whole interaction. Restating the transition's own `basis` —
 * the statutory provision it implements — means the confirmation says *why* this step matters
 * instead of a generic "are you sure?".
 */
const CONFIRM_ON: ReadonlySet<string> = new Set([
  "LOCKED",
  "CERTIFICATE_ISSUED",
  "PUBLISHED",
  "WITHDRAWN",
  "PROVISIONAL",
]);

/** Deficiency severities the server's CHECK constraint accepts (db/schema.sql). */
const SEVERITIES: { value: string; label: string }[] = [
  { value: "major", label: "Major — blocks recommendation until resolved" },
  { value: "minor", label: "Minor" },
  { value: "observation", label: "Observation" },
];

export function ReportLayout() {
  const { reportId = "" } = useParams();
  const { pathname } = useLocation();
  const { data, initialLoading, loading, error, reload } = useApi(
    (s) => api.getReport(reportId, s),
    [reportId],
  );

  const transition = useMutation(api.transition);
  const raiseDeficiency = useMutation(api.raiseDeficiency);

  // Three dialog states, one per shape of interruption this lifecycle needs:
  //  - a plain confirmation, for the CONFIRM_ON set, echoing the transition's own `basis`;
  //  - a required reason, for the two "send it back" moves (remit, return to the MA) — the
  //    officer on the other end needs to know what to fix, not just that it moved;
  //  - the deficiency form, which is not a transition at all from the client's point of view
  //    (POST /deficiencies performs the SUBMITTED -> DEFICIENCY move as a side effect of being
  //    recorded — see apps/api/src/domain/service.ts raiseDeficiency / lifecycle.ts).
  const [confirming, setConfirming] = useState<LifecycleTransition | null>(null);
  const [reasonFor, setReasonFor] = useState<LifecycleTransition | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [deficiencyOpen, setDeficiencyOpen] = useState(false);
  const [defText, setDefText] = useState("");
  const [defSeverity, setDefSeverity] = useState("major");
  const [defFormId, setDefFormId] = useState("");
  // Raising a deficiency (SUBMITTED -> DEFICIENCY) and returning it to the lab (DEFICIENCY ->
  // DRAFT, "Return to Metrological Assistant") are two distinct transitions in lifecycle.ts —
  // but in practice a reviewing officer almost always wants both in the same breath, and
  // making them click through a second dialog for the second one is friction with no
  // corresponding benefit. Default to doing both; the checkbox is there for the rarer case of
  // wanting to raise a finding without sending the report back yet.
  const [defReturnNow, setDefReturnNow] = useState(true);

  // Block only on the *first* load. Blocking on every refetch unmounts the step below and
  // throws away whatever it was holding — the validation findings the officer just triggered,
  // the rows they just computed — which looks exactly like the save having done nothing.
  if (initialLoading) return <LoadingState label="Loading report…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { report, forms, available, guards } = data;

  let instrument: InstrumentProfileShape | null = null;
  if (report.instrument_json) {
    try {
      instrument = JSON.parse(report.instrument_json) as InstrumentProfileShape;
    } catch {
      instrument = null;
    }
  }

  const applicable = forms.filter((f) => f.applicable === 1);
  const decided = applicable.filter((f) => f.verdict);

  // Which section is open, from the URL — the rail highlights it and names it once.
  const slug = pathname.split("/").pop() ?? "";
  const currentStepIndex = Math.max(0, REPORT_STEPS.findIndex((s) => s.slug === slug));

  async function runTransition(to: string, note?: string) {
    const ok = await transition.run(reportId, note ? { to, note } : { to });
    if (ok) reload();
    return ok;
  }

  /**
   * The single entry point for every transition button, wherever it is drawn. Deciding *here*
   * which of the three interruptions (if any) a given move needs is what keeps a Cancel/Esc
   * genuinely free of network calls — nothing runs until one of the dialogs' own confirm
   * handlers below calls `runTransition` or `raiseDeficiency.run`.
   */
  function beginTransition(t: LifecycleTransition) {
    transition.reset();
    if (t.to === "DEFICIENCY") {
      setDefText("");
      setDefSeverity("major");
      setDefFormId("");
      setDefReturnNow(true);
      raiseDeficiency.reset();
      transition.reset();
      setDeficiencyOpen(true);
      return;
    }
    if (t.to === "REMITTED" || (t.from === "DEFICIENCY" && t.to === "DRAFT")) {
      setReasonText("");
      setReasonFor(t);
      return;
    }
    if (CONFIRM_ON.has(t.to)) {
      setConfirming(t);
      return;
    }
    void runTransition(t.to);
  }

  async function confirmReason() {
    if (!reasonFor || !reasonText.trim()) return;
    const ok = await runTransition(reasonFor.to, reasonText.trim());
    if (ok) setReasonFor(null);
  }

  async function confirmDialog() {
    if (!confirming) return;
    const ok = await runTransition(confirming.to);
    if (ok) setConfirming(null);
  }

  async function submitDeficiency() {
    if (!defText.trim()) return;
    // Client-generated id: apps/api/src/domain/service.ts's DeficiencyInput takes an arbitrary
    // caller-chosen string (the demo seed uses "DEF-0002-1"), not a server-assigned one.
    const id = `DEF-${reportId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ok = await raiseDeficiency.run(reportId, {
      id,
      severity: defSeverity,
      text: defText.trim(),
      ...(defFormId ? { formId: defFormId } : {}),
    });
    if (!ok) return;
    // Raising the deficiency alone only performs SUBMITTED -> DEFICIENCY (a side effect of
    // POST /deficiencies — see lifecycle.ts). "Return to Metrological Assistant" is the
    // separate DEFICIENCY -> DRAFT transition; doing it here too, reusing the same text as the
    // note, is what "Record and return to the MA" promises on the button.
    if (defReturnNow) await runTransition("DRAFT", defText.trim());
    setDeficiencyOpen(false);
    reload();
  }

  return (
    <ReportContext.Provider
      value={{
        detail: data,
        reportId,
        reload,
        instrument,
        writable: data.writable?.allowed ?? true,
        ...(data.writable?.reason ? { readOnlyReason: data.writable.reason } : {}),
      }}
    >
      {/*
        The report's identity in one line.
        
        This was a full card — report number, three chips, a headline, the creation date, the
        guard summary and an action row — repeated above every one of the seven sections. On the
        profile step that pushed the first input 584px down a 1000px viewport: well over half the
        screen spent restating which report you already knew you had open, before the page could
        begin doing its job. It is a strip now, and the actions sit in it.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-label-md font-semibold text-on-surface">{report.id}</span>
        <span className="text-on-surface-variant" aria-hidden="true">·</span>
        <span className="min-w-0 truncate text-label-lg text-on-surface">
          {instrument?.model ?? report.model ?? "Instrument not yet recorded"}
        </span>
        {instrument && (
          <span className="truncate text-body-sm text-on-surface-variant">
            {instrument.manufacturer} · class {instrument.accuracyClass}
          </span>
        )}
        <StatusChip status={report.status} />
        <Verdict value={report.overall_verdict} />

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {available.length === 0 ? (
            <span className="text-body-sm text-on-surface-variant">No action for your role</span>
          ) : (
            available.map((t) => (
              <Button
                key={`${t.from}-${t.to}`}
                size="sm"
                variant={t.to === "LOCKED" || t.to === "PUBLISHED" ? "primary" : "secondary"}
                loading={transition.pending || raiseDeficiency.pending}
                onClick={() => beginTransition(t)}
                title={t.basis}
              >
                {t.label}
              </Button>
            ))
          )}
        </span>
      </div>

      {(transition.error || raiseDeficiency.error) && (
        <div className="mb-3">
          <Alert tone="fail" title="That step is not available yet">
            {transition.error || raiseDeficiency.error}
          </Alert>
        </div>
      )}

      {/*
        One progress rail for the whole report.
        
        There were four competing progress indicators stacked here — a bar, seven section cards,
        an advisory alert and, inside the profile, a second stepper — which between them filled
        the screen before any content. A reader cannot tell which one to follow when four are
        offered. This is the single one: seven segments, the current section named, and how much
        of the applicable work is recorded. A page with its own sub-steps shows those itself.
      */}
      <nav aria-label="Report sections" className="mb-4">
        <ol className="flex gap-1">
          {REPORT_STEPS.map((step, i) => {
            const active = i === currentStepIndex;
            const behind = i < currentStepIndex;
            return (
              <li key={step.slug} className="flex-1">
                <NavLink
                  to={reportPath(reportId, step.slug)}
                  title={`${step.label} — ${step.hint}`}
                  className={cn(
                    "group block rounded-full py-1 transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  )}
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-colors",
                      active ? "bg-primary" : behind ? "bg-primary/40" : "bg-outline-variant/50",
                      "group-hover:bg-primary/70",
                    )}
                  />
                  <span
                    className={cn(
                      "mt-1 block truncate text-label-sm transition-colors",
                      active ? "font-semibold text-on-surface" : "text-on-surface-variant",
                    )}
                  >
                    {step.label}
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ol>
      </nav>

      {/*
        Said once, at the top, rather than by every disabled control separately. A reader who
        cannot change anything needs to know that before they start reading the form, not after
        they try to type in it.
      */}
      {data.writable && !data.writable.allowed && slug !== "overview" && (
        <div className="mb-4">
          <Alert tone="info" icon="lock" title="This report is read-only">
            {humanizeReadOnlyReason(data.writable.reason, report.status)}
          </Alert>
        </div>
      )}

      <Outlet />

      {/* Confirm: LOCKED / CERTIFICATE_ISSUED / PUBLISHED / WITHDRAWN / PROVISIONAL. Cancel and
          Esc both route through Dialog's onClose, which only clears this state — neither calls
          runTransition, so neither makes a network request. */}
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? confirming.label : ""}
      >
        {confirming && (
          <>
            <p className="text-body-md text-on-surface">{confirming.basis}</p>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              This report moves from <span className="font-semibold">{humanizeStatus(confirming.from)}</span> to{" "}
              <span className="font-semibold">{humanizeStatus(confirming.to)}</span>. This cannot be undone
              from here — a correction after this point is a new revision, not an edit.
            </p>
            {transition.error && <div className="mt-3"><Alert tone="fail">{transition.error}</Alert></div>}
            <DialogActions>
              <Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button variant="primary" loading={transition.pending} onClick={confirmDialog}>
                {confirming.label}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Reason required: Remit back for further tests, and Return to Metrological Assistant.
          api.transition already accepts `note` (apps/web/src/lib/api.ts) — this is the one place
          that ever sends it. */}
      <Dialog
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        title={reasonFor ? reasonFor.label : ""}
        description="The officer who receives this next needs to know what to fix, not just that it moved."
      >
        {reasonFor && (
          <>
            <Field label="Reason" required hint={reasonFor.basis}>
              <TextArea
                autoFocus
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="What needs to change before this comes back?"
              />
            </Field>
            {transition.error && <div className="mt-3"><Alert tone="fail">{transition.error}</Alert></div>}
            <DialogActions>
              <Button variant="secondary" onClick={() => setReasonFor(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={transition.pending}
                disabled={!reasonText.trim()}
                onClick={confirmReason}
              >
                {reasonFor.label}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Record deficiency. POST /deficiencies records the finding and, as a side effect,
          performs SUBMITTED -> DEFICIENCY (apps/api/src/domain/service.ts, lifecycle.ts).
          "Return to Metrological Assistant" is the separate DEFICIENCY -> DRAFT transition —
          offered here as one action, since a reviewer raising a finding is nearly always ready
          to send it back in the same breath. */}
      <Dialog
        open={deficiencyOpen}
        onClose={() => setDeficiencyOpen(false)}
        title="Record deficiency"
        description="AoM Rule 8: the reviewing officer records deficiencies and returns the report to the laboratory."
      >
        <div className="flex flex-col gap-4">
          <Field label="What is wrong" required>
            <TextArea
              autoFocus
              value={defText}
              onChange={(e) => setDefText(e.target.value)}
              placeholder="Describe the deficiency — specific enough that the Metrological Assistant knows what to redo."
            />
          </Field>
          <Field label="Severity" required>
            <Select value={defSeverity} onChange={(e) => setDefSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Form reference" hint="Optional — which recorded form this is about.">
            <Select value={defFormId} onChange={(e) => setDefFormId(e.target.value)}>
              <option value="">Not tied to one form</option>
              {applicable.map((f) => (
                <option key={f.form_id} value={f.form_id}>
                  Form {f.form_id} — {f.test_id.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-start gap-2.5 text-body-md text-on-surface">
            <input
              type="checkbox"
              checked={defReturnNow}
              onChange={(e) => setDefReturnNow(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-outline-variant/60 text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <span>
              Also return this to the Metrological Assistant now
              <span className="block text-body-sm text-on-surface-variant">
                Otherwise it stays with you, recorded but not yet sent back.
              </span>
            </span>
          </label>
          {(raiseDeficiency.error || transition.error) && (
            <Alert tone="fail">{raiseDeficiency.error || transition.error}</Alert>
          )}
          <DialogActions>
            <Button variant="secondary" onClick={() => setDeficiencyOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={raiseDeficiency.pending || transition.pending}
              disabled={!defText.trim()}
              onClick={submitDeficiency}
            >
              {defReturnNow ? "Record and return to the MA" : "Record deficiency"}
            </Button>
          </DialogActions>
        </div>
      </Dialog>
    </ReportContext.Provider>
  );
}

/**
 * The server's `canWriteReport` always checks against one representative capability
 * (`report:edit_profile`) and, when that is what fails, says so literally: "Role AD lacks
 * capability report:edit_profile." True, but nobody outside this codebase reads capability
 * strings — reword the one case that leaks one; the other two reasons are already in plain
 * language.
 */
function humanizeReadOnlyReason(reason: string | undefined, status: string): string {
  if (!reason) return "Nothing here can be changed.";
  const m = /^Role (\w+) lacks capability report:edit_profile\.$/.exec(reason);
  if (!m) return reason;
  const role = ROLE_LABEL[m[1] as keyof typeof ROLE_LABEL] ?? m[1];
  const reviewing = ["SUBMITTED", "DEFICIENCY", "RECOMMENDED", "PROVISIONAL"].includes(status);
  return reviewing
    ? `${role} can review this report but not edit it while it is ${humanizeStatus(status).toLowerCase()}.`
    : `${role} cannot edit this report in its current state.`;
}

/** The server's guard names, in words an officer would use. */
function describeGuard(guard: string): string {
  switch (guard) {
    case "all_applicable_forms_complete": return "All applicable forms recorded";
    case "no_blocking_validation_issues": return "Validation clean";
    case "all_deficiencies_resolved": return "No open deficiencies";
    case "final_pdf_rendered": return "Record copy rendered";
    default: return guard;
  }
}

/**
 * Move to the next step, and back to the last one.
 *
 * Every step needs this and only two of the six had it: an officer could fill in a whole
 * checklist or upload every drawing and find no way forward except the progress rail at the top
 * of the page, which reads as a status display rather than a control. A wizard that does not
 * say what comes next is not a wizard.
 *
 * The steps come from REPORT_STEPS, so the order here cannot drift from the order the rail
 * shows. `extra` is for a step that has its own inner loop — the observation screen moves
 * between forms before it moves to the next step.
 */
export function StepNav({
  slug,
  extra,
  nextLabel,
  onNext,
}: {
  slug: string;
  extra?: ReactNode;
  /** Overrides the label when the next action is not simply "the next step". */
  nextLabel?: string;
  onNext?: () => void;
}) {
  const { reportId } = useReport();
  const navigate = useNavigate();

  const i = REPORT_STEPS.findIndex((s) => s.slug === slug);
  const previous = i > 0 ? REPORT_STEPS[i - 1] : null;
  const next = i >= 0 && i < REPORT_STEPS.length - 1 ? REPORT_STEPS[i + 1] : null;

  return (
    <ActionBar
      left={
        previous ? (
          <Button
            variant="ghost"
            icon="arrow_back"
            onClick={() => navigate(reportPath(reportId, previous.slug))}
          >
            {previous.label}
          </Button>
        ) : undefined
      }
      right={
        <>
          {extra}
          {next && (
            <Button
              variant="primary"
              icon="arrow_forward"
              onClick={onNext ?? (() => navigate(reportPath(reportId, next.slug)))}
            >
              {nextLabel ?? `Continue to ${next.label.toLowerCase()}`}
            </Button>
          )}
        </>
      }
    />
  );
}

/** Shared empty state for steps that need the profile first. */
export function NeedsProfile() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-low text-on-surface-variant">
          <Icon name="precision_manufacturing" size={24} />
        </span>
        <p className="text-headline-sm text-on-surface">The instrument profile comes first</p>
        <p className="text-body-md text-on-surface-variant max-w-md">
          This step reads the accuracy class and the weighing ranges. Record them and it will
          fill in.
        </p>
      </div>
    </Card>
  );
}
