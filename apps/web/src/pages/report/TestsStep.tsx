/**
 * The applicable test list.
 *
 * The list is not chosen by an officer — it is *derived* from the instrument profile against
 * the rule pack, and every exclusion carries a written reason and a clause. That is the point:
 * R 76-2 marks an inapplicable form "– –", and a report that simply leaves it blank has not
 * recorded that the question was asked and deliberately answered.
 *
 * So inapplicable forms are shown, not hidden. Hiding them would lose exactly the information
 * a reviewing officer needs.
 */

import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Disclosure,
  TableWrap,
  Td,
  Th,
  Verdict,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { reportPath } from "../../lib/nav";
import { NeedsProfile, StepNav, useReport } from "./ReportLayout";

export function TestsStep() {
  const { reportId, detail, instrument } = useReport();
  // Which kernel decides a form comes from the server, which reads it from the rule pack.
  // It used to be a list of test ids in this file, and it had already gone stale: it named
  // "discrimination" and "creep" after the pack had split them, and put stability of
  // equilibrium under K4 when the pack says K6. A threshold or a clause is data (CLAUDE.md
  // design rule #2), and so is this.
  const formsFile = useApi((s) => api.forms(s), []);

  if (!instrument) return <NeedsProfile />;

  const kernelOf = (formId: string) =>
    formsFile.data?.forms.find((f) => f.formId === formId)?.kernel ?? "—";
  const titleOfForm = (formId: string, testId: string) =>
    formsFile.data?.forms.find((f) => f.formId === formId)?.title ?? titleOf(testId);

  const forms = [...detail.forms].sort((a, b) =>
    a.form_id.localeCompare(b.form_id, undefined, { numeric: true }),
  );
  const applicable = forms.filter((f) => f.applicable === 1);
  const excluded = forms.filter((f) => f.applicable !== 1);
  const recorded = applicable.filter((f) => f.verdict);

  return (
    <div className="flex flex-col gap-5">
      {/*
        Three stat tiles stood here: applicable, recorded, not applicable. Every one of those
        numbers is countable from the table immediately below, and the third had its own
        disclosure at the foot of the page. A sentence carries the same three numbers in a
        tenth of the height.
      */}
      <p className="text-body-md text-on-surface-variant">
        {applicable.length} forms apply to this instrument and {recorded.length} have observations
        recorded. {excluded.length > 0 && `${excluded.length} do not apply, each with a reason.`}
      </p>

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            icon="playlist_add_check"
            title="Applicable forms"
            description="Resolved from the instrument profile against the rule pack"
            action={
              <Link to={reportPath(reportId, "observations")}>
                <Button size="sm" variant="primary" icon="arrow_forward">Record observations</Button>
              </Link>
            }
          />
        </div>
        <TableWrap className="rounded-t-none border-x-0 border-b-0">
          <thead>
            <tr>
              <Th className="w-20">Form</Th>
              <Th>Test</Th>
              <Th className="w-28">Kernel</Th>
              <Th className="w-32">Result</Th>
              <Th align="right" className="w-32"></Th>
            </tr>
          </thead>
          <tbody>
            {applicable.map((f) => (
              <tr key={`${f.form_id}-${f.range_index}`} className="transition-colors hover:bg-surface-container-low/60">
                <Td>
                  <span className="font-mono text-label-md font-semibold text-on-surface">{f.form_id}</span>
                  {f.range_index ? (
                    <span className="block text-label-sm text-on-surface-variant">range {f.range_index}</span>
                  ) : null}
                </Td>
                <Td>
                  <span className="text-on-surface">{titleOfForm(f.form_id, f.test_id)}</span>
                </Td>
                <Td>
                  <Badge tone="neutral" className="font-mono">{kernelOf(f.form_id)}</Badge>
                </Td>
                <Td><Verdict value={f.verdict} /></Td>
                <Td align="right">
                  <Link to={`${reportPath(reportId, "observations")}?form=${encodeURIComponent(f.form_id)}`}>
                    <Button size="sm" variant="ghost" icon={f.verdict ? "edit" : "add"}>
                      {f.verdict ? "Edit" : "Record"}
                    </Button>
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      {excluded.length > 0 && (
        <Disclosure summary={`${excluded.length} forms do not apply, and the report says why`}>
          <ul className="flex flex-col gap-2.5">
            {excluded.map((f) => (
              <li
                key={`${f.form_id}-${f.range_index}`}
                className="flex gap-3 rounded-xl border border-outline-variant/50 bg-surface-container-low/40 p-3"
              >
                <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high font-mono text-label-md font-semibold text-on-surface-variant">
                  {f.form_id}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-label-lg text-on-surface">{titleOfForm(f.form_id, f.test_id)}</span>
                    <Badge tone="neutral">– –</Badge>
                  </span>
                  <span className="block text-body-md text-on-surface-variant mt-0.5">
                    {f.na_reason ?? "No reason recorded."}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <StepNav slug="tests" />
    </div>
  );
}

/** Rule-pack test ids are snake_case; the report prints titles. */
function titleOf(testId: string): string {
  const s = testId.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}


