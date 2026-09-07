/**
 * The repository (FR12).
 *
 * Search and filtering happen on the server, not by filtering an array in the browser — a
 * laboratory's history is meant to accumulate for years, and a client-side filter silently
 * stops being the truth as soon as the result set exceeds one page.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusChip,
  TableWrap,
  Td,
  Th,
  Verdict,
} from "../components/ui";
import { api } from "../lib/api";
import { useApi, useDebounced } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { reportPath } from "../lib/nav";
import { fmtCapacity, formatDate } from "../lib/format";

const STATUSES = [
  "DRAFT", "OBSERVATIONS_COMPLETE", "VALIDATED", "SUBMITTED", "DEFICIENCY",
  "RECOMMENDED", "REMITTED", "PROVISIONAL", "LOCKED", "CERTIFICATE_ISSUED",
  "PUBLISHED", "WITHDRAWN",
];

export function ReportsPage() {
  const { can } = useAuth();
  const [manufacturer, setManufacturer] = useState("");
  const [status, setStatus] = useState("");
  const [accuracyClass, setAccuracyClass] = useState("");

  // Debounced so typing a manufacturer name is one request, not one per keystroke.
  const q = useDebounced(manufacturer, 300);

  const reports = useApi(
    (s) => api.listReports({ manufacturer: q, status, accuracyClass, limit: 100 }, s),
    [q, status, accuracyClass],
  );

  const hasFilters = Boolean(q || status || accuracyClass);

  return (
    <>
      <PageHeader
        eyebrow="Digital repository"
        title="Reports"
        description="Every type-evaluation report recorded by your laboratory, with its current position in the approval chain."
        actions={
          can("report:create") ? (
            <Link to="/reports/new">
              <Button variant="primary" icon="add">New report</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Manufacturer or model" className="lg:col-span-2">
            <Input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Search…"
              type="search"
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>
              ))}
            </Select>
          </Field>
          <Field label="Accuracy class">
            <Select value={accuracyClass} onChange={(e) => setAccuracyClass(e.target.value)}>
              <option value="">All classes</option>
              <option value="I">I — special</option>
              <option value="II">II — high</option>
              <option value="III">III — medium</option>
              <option value="IIII">IIII / IV — ordinary</option>
            </Select>
          </Field>
        </div>
        {hasFilters && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon="filter_alt_off"
              onClick={() => {
                setManufacturer("");
                setStatus("");
                setAccuracyClass("");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Card padded={false}>
        {reports.error ? (
          <div className="p-5"><ErrorState error={reports.error} onRetry={reports.reload} /></div>
        ) : reports.loading ? (
          <LoadingState label="Loading reports…" />
        ) : !reports.data?.length ? (
          <div className="p-5">
            <EmptyState
              icon={hasFilters ? "search_off" : "folder_off"}
              title={hasFilters ? "Nothing matches those filters" : "No reports yet"}
              description={
                hasFilters
                  ? "Try a broader search, or clear the filters to see everything in the repository."
                  : "A report starts with the instrument profile — the class and weighing ranges are what let the engine resolve permissible errors."
              }
              action={
                !hasFilters && can("report:create") ? (
                  <Link to="/reports/new"><Button variant="primary" icon="add">New report</Button></Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <TableWrap className="border-0">
            <thead>
              <tr>
                <Th>Report</Th>
                <Th>Application</Th>
                <Th>Manufacturer</Th>
                <Th>Model</Th>
                <Th>Class</Th>
                <Th align="right">Max</Th>
                <Th>Profile</Th>
                <Th>Status</Th>
                <Th>Result</Th>
                <Th align="right">Created</Th>
              </tr>
            </thead>
            <tbody>
              {reports.data.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-container-low/60">
                  <Td>
                    <Link
                      to={reportPath(r.id)}
                      className="font-mono text-body-sm font-semibold text-primary hover:underline"
                    >
                      {r.id}
                    </Link>
                  </Td>
                  <Td className="text-body-sm text-on-surface-variant">{r.application_no ?? "—"}</Td>
                  <Td>{r.manufacturer ?? "—"}</Td>
                  <Td>{r.model ?? "—"}</Td>
                  <Td>{r.accuracy_class ?? "—"}</Td>
                  <Td align="right" numeric>{fmtCapacity(r.max_capacity_g)}</Td>
                  <Td className="text-body-sm text-on-surface-variant">
                    {r.profile === "IN_Sch7A" ? "Seventh Schedule" : r.profile === "OIML_R76" ? "OIML R 76" : r.profile}
                  </Td>
                  <Td><StatusChip status={r.status} /></Td>
                  <Td><Verdict value={r.overall_verdict} /></Td>
                  <Td align="right" numeric className="text-body-sm text-on-surface-variant">
                    {formatDate(r.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {reports.data && reports.data.length > 0 && (
        <p className="mt-3 text-body-sm text-on-surface-variant">
          {reports.data.length} report{reports.data.length === 1 ? "" : "s"}.
          Reports and the drawings behind them are not open to public inspection
          (AoM Rule 16(2)); certificates are published separately under Rule 11(4).
        </p>
      )}
    </>
  );
}
