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

import { createContext, useContext } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorState,
  Icon,
  LoadingState,
  Spinner,
  StatusChip,
  Verdict,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, type ReportDetail } from "../../lib/api";
import { useApi, useMutation } from "../../lib/useApi";
import { REPORT_STEPS, reportPath } from "../../lib/nav";
import { formatDate } from "../../lib/format";

interface ReportContextValue {
  detail: ReportDetail;
  reportId: string;
  reload: () => void;
  /** Parsed instrument profile, or null while it has not been recorded. */
  instrument: InstrumentProfileShape | null;
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

export function ReportLayout() {
  const { reportId = "" } = useParams();
  const { data, initialLoading, loading, error, reload } = useApi(
    (s) => api.getReport(reportId, s),
    [reportId],
  );

  const transition = useMutation(api.transition);

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

  async function move(to: string) {
    const ok = await transition.run(reportId, { to });
    if (ok) reload();
  }

  return (
    <ReportContext.Provider value={{ detail: data, reportId, reload, instrument }}>
      {/* Report header */}
      <Card elevation="raised" className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-label-lg font-bold text-on-surface">{report.id}</span>
              {loading && <Spinner size={13} className="text-on-surface-variant" />}
              <StatusChip status={report.status} />
              <Verdict value={report.overall_verdict} />
              <Badge tone="neutral">
                {report.profile === "IN_Sch7A" ? "Seventh Schedule" : report.profile === "OIML_R76" ? "OIML R 76" : report.profile}
              </Badge>
            </div>
            <h1 className="text-headline-md text-on-surface mt-1.5">
              {instrument?.model ?? report.model ?? "Instrument not yet recorded"}
            </h1>
            <p className="text-body-md text-on-surface-variant">
              {[
                instrument?.manufacturer ?? report.manufacturer,
                instrument ? `Class ${instrument.accuracyClass}` : null,
                report.application_no ? `Application ${report.application_no}` : null,
                `Created ${formatDate(report.created_at)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* Lifecycle actions the server says this officer may take from here */}
          <div className="flex flex-wrap items-center gap-2">
            {available.length === 0 ? (
              <Badge tone="neutral" icon="lock">No action available to your role</Badge>
            ) : (
              available.map((t) => (
                <Button
                  key={`${t.from}-${t.to}`}
                  size="sm"
                  variant={t.to === "LOCKED" || t.to === "PUBLISHED" ? "primary" : "secondary"}
                  loading={transition.pending}
                  onClick={() => move(t.to)}
                  title={t.basis}
                >
                  {t.label}
                </Button>
              ))
            )}
          </div>
        </div>

        {transition.error && (
          <div className="mt-4">
            <Alert tone="fail" title="That step is not available yet">{transition.error}</Alert>
          </div>
        )}

        {/* Progress: how much of the applicable work is done */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: applicable.length ? `${(decided.length / applicable.length) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-body-sm text-on-surface-variant tabular-nums whitespace-nowrap">
            {decided.length} of {applicable.length} applicable forms recorded
          </span>
        </div>

        {guards.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {guards.map((g) => (
              <Badge key={g} tone="pass" icon="check">{describeGuard(g)}</Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Steps */}
      <nav className="mb-5 flex gap-1.5 overflow-x-auto pb-1" aria-label="Report steps">
        {REPORT_STEPS.map((step, i) => (
          <NavLink
            key={step.slug}
            to={reportPath(reportId, step.slug)}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                isActive
                  ? "border-primary/40 bg-primary-fixed text-on-primary-fixed"
                  : "border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-label-sm font-bold",
                    isActive ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex flex-col leading-tight text-left">
                  <span className="text-label-md font-semibold whitespace-nowrap">{step.label}</span>
                  <span className="text-label-sm opacity-80 whitespace-nowrap">{step.hint}</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!instrument && (
        <div className="mb-5">
          <Alert tone="info" icon="precision_manufacturing" title="Start with the instrument profile">
            Permissible errors cannot be resolved without the accuracy class and the weighing
            ranges, so every later step depends on this one.
          </Alert>
        </div>
      )}

      <Outlet />
    </ReportContext.Provider>
  );
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
