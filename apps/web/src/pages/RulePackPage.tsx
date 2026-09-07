/**
 * The rule pack, on screen.
 *
 * CLAUDE.md's second design rule is that the standard is data: no threshold, band boundary or
 * clause number is written in code. This page is what makes that claim checkable rather than
 * asserted — it renders the pack the server is actually serving, so anyone can compare Table 6
 * on screen against Table 6 in the PDF.
 *
 * It matters practically too. R 76 is being restructured from two parts into five, and India's
 * Seventh Schedule differs from OIML in ways that are easy to state and easy to get wrong.
 * Supporting both means swapping a file, and this is the file.
 */

import {
  Badge,
  Card,
  CardHeader,
  Clause,
  Disclosure,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";

const CLASSES = ["I", "II", "III", "IIII"] as const;

export function RulePackPage() {
  const pack = useApi((s) => api.rulepack(s), []);

  if (pack.loading) return <LoadingState label="Loading the rule pack…" />;
  if (pack.error) return <ErrorState error={pack.error} onRetry={pack.reload} />;
  if (!pack.data) return null;

  const p = pack.data;
  const bands = p.mpe_bands_initial ?? [];
  const classification = (p.classification ?? []) as {
    class: string; e_min_g: number; e_max_g: number | null;
    n_min: number; n_max: number | null; min_capacity: string;
  }[];
  const kernelParams = (p["kernel_params"] ?? {}) as Record<string, Record<string, unknown>>;

  return (
    <>
      <PageHeader
        eyebrow="The standard as data"
        title="Rule pack"
        description="Every threshold the engine applies, and the clause it comes from. Swapping this file is how the same engine serves OIML R 76 and India's Seventh Schedule."
        actions={<Badge tone="info" icon="gavel">{p.ruleset_id}{p.version ? ` v${p.version}` : ""}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        <Stat label="Tests defined" value={p.tests?.length ?? 0} icon="checklist" />
        <Stat label="Classification rows" value={classification.length} icon="table_rows" hint="R 76-1 Table 3" />
        <Stat
          label="In-service multiplier"
          value={`× ${p["mpe_in_service_factor"] ?? "—"}`}
          icon="close_fullscreen"
          hint="R 76-1 §3.5.2 — the same engine serves state verification"
        />
      </div>

      <div className="flex flex-col gap-5">
        {/* Table 6 */}
        <Card padded={false}>
          <div className="p-5 pb-0">
            <CardHeader
              icon="straighten"
              title="Maximum permissible errors"
              description="R 76-1 Table 6 — loads m expressed in verification scale intervals e"
            />
          </div>
          <TableWrap className="rounded-t-none border-x-0 border-b-0">
            <thead>
              <tr>
                <Th>mpe on initial verification</Th>
                {CLASSES.map((c) => (
                  <Th key={c} align="center">Class {c}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bands.map((band, i) => {
                const prev = bands[i - 1]?.max_m_in_e;
                return (
                  <tr key={band.limit}>
                    <Td className="font-semibold">± {band.limit}</Td>
                    {CLASSES.map((c) => {
                      const upper = band.max_m_in_e?.[c];
                      const lower = prev?.[c];
                      return (
                        <Td key={c} align="center" numeric className="text-body-sm">
                          {upper === null || upper === undefined ? (
                            lower !== undefined && lower !== null ? (
                              <>{lower.toLocaleString("en-IN")} &lt; m</>
                            ) : (
                              "—"
                            )
                          ) : lower === undefined || lower === null ? (
                            <>0 ≤ m ≤ {upper.toLocaleString("en-IN")}</>
                          ) : (
                            <>{lower.toLocaleString("en-IN")} &lt; m ≤ {upper.toLocaleString("en-IN")}</>
                          )}
                        </Td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <p className="p-5 pt-3 text-body-sm text-on-surface-variant">
            <Icon name="info" size={14} className="mr-1 inline align-[-2px]" />
            Class I&rsquo;s ±1.5 e band is unbounded above, where the other classes have a
            ceiling. On a multi-interval instrument <em>e</em> follows the load, so the band a
            reading falls into is resolved per row rather than per instrument.{" "}
            <Clause>{String(p["mpe_clause"] ?? "R 76-1:2006 §3.5.1")}</Clause>
          </p>
        </Card>

        {/* Table 3 */}
        <Card padded={false}>
          <div className="p-5 pb-0">
            <CardHeader
              icon="category"
              title="Classification"
              description={String(p["classification_clause"] ?? "R 76-1 Table 3")}
            />
          </div>
          <TableWrap className="rounded-t-none border-x-0 border-b-0">
            <thead>
              <tr>
                <Th>Class</Th>
                <Th align="right">e range</Th>
                <Th align="right">n minimum</Th>
                <Th align="right">n maximum</Th>
                <Th align="right">Minimum capacity</Th>
              </tr>
            </thead>
            <tbody>
              {classification.map((row, i) => (
                <tr key={i}>
                  <Td className="font-semibold">{row.class === "IIII" ? "IIII / IV" : row.class}</Td>
                  <Td align="right" numeric className="text-body-sm">
                    {row.e_max_g === null
                      ? `≥ ${row.e_min_g} g`
                      : `${row.e_min_g} – ${row.e_max_g} g`}
                  </Td>
                  <Td align="right" numeric>{row.n_min.toLocaleString("en-IN")}</Td>
                  <Td align="right" numeric>{row.n_max === null ? "—" : row.n_max.toLocaleString("en-IN")}</Td>
                  <Td align="right" numeric>{row.min_capacity}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        {/* Tests — reference material, so behind a disclosure rather than three screens of table. */}
        <Disclosure summary={`All ${p.tests?.length ?? 0} tests, their kernels and applicability predicates`}>
        <Card padded={false} elevation="none">
          <div className="p-1 pb-0">
            <CardHeader
              icon="fact_check"
              title="Tests and their applicability"
              description="Each with its kernel, its clause, and the predicate that decides whether it applies"
            />
          </div>
          <TableWrap className="rounded-t-none border-x-0 border-b-0">
            <thead>
              <tr>
                <Th className="w-20">Form</Th>
                <Th>Test</Th>
                <Th className="w-20">Kernel</Th>
                <Th>Clause</Th>
                <Th>Applies when</Th>
              </tr>
            </thead>
            <tbody>
              {(p.tests ?? []).map((t) => {
                const applies = (t as { applies?: Record<string, unknown> }).applies;
                const note = (t as { note?: string }).note;
                return (
                  <tr key={t.id} className="align-top">
                    <Td className="font-mono text-body-sm font-semibold">{t.form}</Td>
                    <Td>
                      <span className="block text-on-surface">{t.title ?? t.id}</span>
                      {note && (
                        <span className="mt-0.5 block text-body-sm text-on-surface-variant">{note}</span>
                      )}
                    </Td>
                    <Td><Badge tone="neutral" className="font-mono">{t.kernel}</Badge></Td>
                    <Td><Clause>{t.clause ?? "—"}</Clause></Td>
                    <Td>
                      <code className="text-label-sm font-mono text-on-surface-variant">
                        {applies ? JSON.stringify(applies) : "always"}
                      </code>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
        </Disclosure>

        {/* Kernel params */}
        {Object.keys(kernelParams).length > 0 && (
          <Disclosure summary={`Kernel parameters — the ${Object.keys(kernelParams).length} threshold groups the kernels read`}>
          <Card elevation="none">
            <CardHeader
              icon="tune"
              title="Kernel parameters"
              description="Thresholds the kernels read rather than hold — the difference between a rule pack and a constant"
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(kernelParams).map(([name, params]) => (
                <div key={name} className="rounded-xl border border-outline-variant/50 p-3.5">
                  <p className="text-label-lg text-on-surface">{name.replace(/_/g, " ")}</p>
                  {typeof params["clause"] === "string" && <Clause>{params["clause"]}</Clause>}
                  <dl className="mt-2 flex flex-col gap-1">
                    {Object.entries(params)
                      .filter(([k]) => k !== "clause" && k !== "note")
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 text-body-sm">
                          <dt className="text-on-surface-variant">{k.replace(/_/g, " ")}</dt>
                          <dd className="font-mono text-on-surface text-right">
                            {typeof v === "object" ? JSON.stringify(v) : String(v)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {typeof params["note"] === "string" && (
                    <p className="mt-2 text-body-sm text-on-surface-variant">{params["note"]}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
          </Disclosure>
        )}
      </div>
    </>
  );
}
