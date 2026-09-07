/**
 * Create a report.
 *
 * Deliberately short. The only decisions here are the ones that must be fixed before anything
 * else can happen: which conformity profile the report is written against, and the application
 * it belongs to. Everything metrological comes next, on the instrument profile.
 *
 * The conformity choice is not a preference — AoM Rule 7(1)(a) permits conformity to the
 * Indian rules *or* to OIML recommendations, and the report cites whichever was chosen.
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "../components/ui";
import { api } from "../lib/api";
import { useMutation } from "../lib/useApi";
import { reportPath } from "../lib/nav";

/** A readable, sortable default: TS-<year>-<6 chars>. */
function suggestId(): string {
  const year = new Date().getUTCFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TS-${year}-${rand}`;
}

export function NewReportPage() {
  const navigate = useNavigate();
  const [reportId, setReportId] = useState(suggestId);
  const [applicationNo, setApplicationNo] = useState("");
  const [profile, setProfile] = useState<"IN_Sch7A" | "OIML_R76" | "BOTH">("IN_Sch7A");
  const [fee, setFee] = useState("25000");

  const create = useMutation(api.createReport);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await create.run({
      reportId: reportId.trim(),
      profile,
      ...(applicationNo.trim() ? { applicationNo: applicationNo.trim() } : {}),
      ...(fee ? { feePaidInr: Number(fee) } : {}),
    });
    if (result) navigate(reportPath(result.id, "profile"));
  }

  return (
    <>
      <PageHeader
        eyebrow="Model approval"
        title="New test report"
        description="Two decisions now; the instrument follows on the next screen."
      />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon="description" title="Report identity" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Report number"
              required
              hint="Fixed once created — it is what the audit trail is keyed on."
            >
              <Input
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
                required
                className="font-mono"
              />
            </Field>

            <Field label="Application number" hint="From the model approval portal, if allotted.">
              <Input
                value={applicationNo}
                onChange={(e) => setApplicationNo(e.target.value)}
                placeholder="MA/2026/000123"
              />
            </Field>

            <Field
              label="Conformity profile"
              required
              hint="AoM Rule 7(1)(a) permits either. The report cites whichever is chosen."
            >
              <Select value={profile} onChange={(e) => setProfile(e.target.value as typeof profile)}>
                <option value="IN_Sch7A">Seventh Schedule, Heading A — LM (General) Rules, 2011</option>
                <option value="OIML_R76">OIML R 76</option>
                <option value="BOTH">Both</option>
              </Select>
            </Field>

            <Field
              label="Testing fee (₹)"
              hint="Rule 19: ₹10,000 mechanical, ₹25,000 digital-electronic. Feeds the Rule 4(9) return."
            >
              <Input
                type="number"
                min={0}
                step={1000}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          {create.error && (
            <div className="mt-4">
              <Alert tone="fail" title="Could not create the report">{create.error}</Alert>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" variant="primary" icon="arrow_forward" loading={create.pending}>
              Create and continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/reports")}>
              Cancel
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader icon="info" title="What happens next" />
          <ol className="flex flex-col gap-3">
            {[
              ["Instrument profile", "Accuracy class, Max, Min, e and d, and the range structure. Validated against Table 3 as you enter it."],
              ["Applicable tests", "The engine resolves which of R 76-2's forms apply, and states in writing why each of the others does not."],
              ["Observations", "Bench readings. The permissible-error band is resolved per row and follows the load."],
              ["Report", "PDF as the record copy, DOCX for review, JSON for machines."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-label-sm font-bold text-on-primary-fixed">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-label-lg text-on-surface">{title}</span>
                  <span className="block text-body-sm text-on-surface-variant">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </form>
    </>
  );
}
