/**
 * The briefing.
 *
 * A judge arriving here has ten minutes and no context. This page carries the problem, the
 * evidence, what is built and what is not, and links into the running application at the point
 * each claim can be checked.
 *
 * It is organised as tabs rather than one long scroll because the questions are different:
 * "what is the problem" and "does it cover the requirement" and "what does it integrate with"
 * are asked by different people at different moments, and a reader who wants one should not
 * have to scroll past the others.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  Icon,
  PageHeader,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import {
  ANCHOR_STATISTIC,
  CORRECTIONS,
  DIFFERENTIATORS,
  EVIDENCE,
  FUNCTIONAL_REQUIREMENTS,
  HONEST_LIMITS,
  HOW_IT_WORKS_TODAY,
  INTEGRATIONS,
  PROBLEM_STATEMENT,
  SCALE,
  THESIS,
  THE_TRAP,
  WHY_NOW,
  type FrState,
} from "../../content/brief";

const TABS = [
  { id: "problem", label: "The problem", icon: "help" },
  { id: "solution", label: "What we built", icon: "precision_manufacturing" },
  { id: "coverage", label: "Requirement coverage", icon: "checklist" },
  { id: "integrations", label: "Integrations", icon: "hub" },
  { id: "evidence", label: "Evidence", icon: "verified" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function BriefPage() {
  const [tab, setTab] = useState<TabId>("problem");

  return (
    <>
      <PageHeader
        eyebrow={`Smart India Hackathon 2026 · ${PROBLEM_STATEMENT.id}`}
        title="TulaSetu — the briefing"
        description={PROBLEM_STATEMENT.title}
        actions={
          <Link to="/dashboard">
            <Button variant="primary" icon="arrow_forward">Open the application</Button>
          </Link>
        }
      />

      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Briefing sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              tab === t.id
                ? "bg-surface-container-lowest text-on-surface card-shadow"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            <Icon name={t.icon} size={18} />
            <span className="text-label-lg font-semibold">{t.label}</span>
          </button>
        ))}
      </nav>

      {tab === "problem" && <ProblemTab />}
      {tab === "solution" && <SolutionTab />}
      {tab === "coverage" && <CoverageTab />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "evidence" && <EvidenceTab />}
    </>
  );
}

// ---------------------------------------------------------------------------

function ProblemTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card elevation="raised">
        <CardHeader icon="gavel" title="What the problem statement asks" description={PROBLEM_STATEMENT.organisation} />
        <p className="text-body-lg text-on-surface">{PROBLEM_STATEMENT.title}</p>
        <blockquote className="mt-4 rounded-2xl border-l-[3px] border-error bg-error-container/30 p-4">
          <p className="text-body-lg italic text-on-surface">“{PROBLEM_STATEMENT.quotedGrievance}”</p>
          <footer className="mt-2 text-body-sm text-on-surface-variant">
            The problem statement, on why it exists
          </footer>
        </blockquote>
        <p className="mt-3 text-body-sm text-on-surface-variant">
          Category: {PROBLEM_STATEMENT.category} · Dataset pointer: {PROBLEM_STATEMENT.datasetPointer}
        </p>
      </Card>

      {/* Where the time goes */}
      <Card>
        <CardHeader
          icon="conversion_path"
          title="Half the process is already digital"
          description="The application side went online. Everything from “model received” to “certificate” did not."
        />
        <ol className="flex flex-col">
          {HOW_IT_WORKS_TODAY.map((s, i) => (
            <li key={s.step} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-sm font-bold",
                    s.state === "digital"
                      ? "bg-success-container text-on-success"
                      : "bg-error-container text-on-error-container",
                  )}
                >
                  <Icon name={s.state === "digital" ? "check" : "edit_note"} size={16} />
                </span>
                {i < HOW_IT_WORKS_TODAY.length - 1 && (
                  <span className="w-px flex-1 bg-outline-variant/60" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 pb-4">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-label-lg text-on-surface">{s.step}</span>
                  <Badge tone={s.state === "digital" ? "pass" : "fail"}>
                    {s.state === "digital" ? "digital" : "manual"}
                  </Badge>
                </span>
                <span className="block text-body-md text-on-surface-variant">{s.note}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* The number */}
      <Card elevation="raised" className="bg-gradient-to-br from-primary-fixed/50 to-transparent">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">The anchor number</p>
            <p className="text-display-lg text-on-surface">{ANCHOR_STATISTIC.claim}</p>
          </div>
          <p className="min-w-[260px] flex-1 text-body-lg text-on-surface-variant">{ANCHOR_STATISTIC.detail}</p>
        </div>
        <p className="mt-3 text-body-sm text-on-surface-variant">
          <Icon name="source" size={14} className="mr-1 inline align-[-2px]" />
          {ANCHOR_STATISTIC.source}
        </p>
      </Card>

      <Card>
        <CardHeader icon="query_stats" title="Scale and stakes" description="Every figure carries its source" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SCALE.map((s) => (
            <div key={s.claim} className="rounded-2xl border border-outline-variant/50 p-4">
              <p className="text-headline-sm text-on-surface">{s.claim}</p>
              {s.detail && <p className="mt-1 text-body-sm text-on-surface-variant">{s.detail}</p>}
              <p className="mt-2 text-label-sm text-on-surface-variant">{s.source}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon="schedule" title="Why now" />
        <ul className="flex flex-col gap-3">
          {WHY_NOW.map((w) => (
            <li key={w.claim} className="flex gap-3">
              <Icon name="bolt" size={18} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="block text-label-lg text-on-surface">{w.claim}</span>
                <span className="block text-body-md text-on-surface-variant">{w.detail}</span>
                <Clause>{w.source}</Clause>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SolutionTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card elevation="raised">
        <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">The idea</p>
        <h2 className="text-headline-lg text-on-surface mt-1">{THESIS.headline}</h2>
        <p className="text-body-lg text-on-surface-variant mt-2 max-w-3xl">{THESIS.body}</p>
        <p className="text-body-md text-on-surface-variant mt-3 max-w-3xl italic">{THESIS.analogy}</p>
        <div className="mt-4 rounded-2xl bg-surface-container-low px-4 py-3">
          <p className="font-mono text-body-md text-on-surface">
            P = I + ½e − ΔL &nbsp;·&nbsp; E = I + ½e − ΔL − L &nbsp;·&nbsp; Ec = E − E₀ &nbsp;·&nbsp; pass if |Ec| ≤ mpe
          </p>
        </div>
      </Card>

      <Card className="border-error/30 bg-error-container/20">
        <CardHeader icon="warning" title={THE_TRAP.title} />
        <p className="text-body-lg text-on-surface max-w-3xl">{THE_TRAP.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { load: "0 – 500 g", mpe: "± 0.5 g", e: "e₁" },
            { load: "500 – 2 000 g", mpe: "± 1 g", e: "e₁" },
            { load: "2 – 4 kg", mpe: "± 2 g", e: "e₂" },
            { load: "4 – 5 kg", mpe: "± 3 g", e: "e₂" },
            { load: "5 – 15 kg", mpe: "± 10 g", e: "e₃" },
          ].map((b, i) => (
            <div key={b.load} className="flex items-center gap-2">
              <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2">
                <p className="text-label-sm text-on-surface-variant">{b.load}</p>
                <p className="text-headline-sm text-on-surface tabular-nums">{b.mpe}</p>
                <p className="text-label-sm text-on-surface-variant">{b.e}</p>
              </div>
              {i < 4 && <Icon name="chevron_right" size={16} className="text-on-surface-variant" />}
            </div>
          ))}
        </div>
        <p className="mt-3 text-body-sm text-on-surface-variant">
          <Clause>{THE_TRAP.source}</Clause> — {THE_TRAP.seeItAt}
        </p>
      </Card>

      <Card>
        <CardHeader
          icon="fact_check"
          title="What reading the standard actually turned up"
          description="Places where the primary source differs from a summary written from memory. The code follows the standard, and each is covered by a test."
        />
        <ul className="flex flex-col gap-3">
          {CORRECTIONS.map((c) => (
            <li key={c.claim} className="rounded-2xl border border-outline-variant/50 p-4">
              <p className="text-label-lg text-on-surface">{c.claim}</p>
              <p className="text-body-md text-on-surface-variant mt-1">{c.detail}</p>
              <Clause>{c.source}</Clause>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {DIFFERENTIATORS.map((d) => (
          <Card key={d.title} className="flex flex-col">
            <h3 className="text-headline-sm text-on-surface">{d.title}</h3>
            <p className="text-body-md text-on-surface-variant mt-2 flex-1">{d.body}</p>
            <p className="text-body-sm text-on-surface-variant mt-3">
              <Icon name="verified" size={14} className="mr-1 inline align-[-2px] text-on-success" />
              {d.evidence}
            </p>
            {d.route && (
              <Link to={d.route} className="mt-3">
                <Button size="sm" variant="secondary" icon="arrow_forward">{d.routeLabel}</Button>
              </Link>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const FR_TONE: Record<FrState, { tone: "pass" | "warn" | "neutral"; label: string }> = {
  done: { tone: "pass", label: "built" },
  partial: { tone: "warn", label: "partial" },
  planned: { tone: "neutral", label: "not built" },
};

function CoverageTab() {
  const counts = FUNCTIONAL_REQUIREMENTS.reduce(
    (acc, f) => ({ ...acc, [f.state]: (acc[f.state] ?? 0) + 1 }),
    {} as Record<FrState, number>,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Requirements built" value={counts.done ?? 0} icon="task_alt" tone="pass" />
        <Stat label="Partial" value={counts.partial ?? 0} icon="pending" tone="warn" hint="Stated, not glossed" />
        <Stat label="Tests" value="420" icon="science" hint="From the standards' worked examples" />
      </div>

      <Card padded={false}>
        <div className="p-6 pb-0">
          <CardHeader
            icon="checklist"
            title="The 18 functional requirements"
            description="Mapped one-to-one to the problem statement. “Partial” means partial — the honest state is more useful to you than a green tick."
          />
        </div>
        <TableWrap className="rounded-t-none border-x-0 border-b-0">
          <thead>
            <tr>
              <Th className="w-16">#</Th>
              <Th>Requirement</Th>
              <Th className="w-28">Asked</Th>
              <Th className="w-24">State</Th>
              <Th>What exists</Th>
              <Th align="right" className="w-32"></Th>
            </tr>
          </thead>
          <tbody>
            {FUNCTIONAL_REQUIREMENTS.map((f) => (
              <tr key={f.id} className="align-top">
                <Td className="font-mono text-body-sm font-semibold">{f.id}</Td>
                <Td className="text-on-surface">{f.requirement}</Td>
                <Td>
                  <Badge tone={f.askedBy === "differentiator" ? "info" : "neutral"}>
                    {f.askedBy === "explicit" ? "explicit" : f.askedBy === "implied" ? "implied" : "ours"}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={FR_TONE[f.state].tone}>{FR_TONE[f.state].label}</Badge>
                </Td>
                <Td className="text-body-sm text-on-surface-variant">{f.built}</Td>
                <Td align="right" className="whitespace-nowrap">
                  {f.route && (
                    <Link to={f.route}>
                      <Button size="sm" variant="ghost" icon="open_in_new">Open</Button>
                    </Link>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card className="border-[#F59E0B]/30 bg-[#FEF3C7]/30">
        <CardHeader icon="report" title="What this prototype does not do" description="Stated here so you do not have to find it by clicking" />
        <ul className="flex flex-col gap-2">
          {HONEST_LIMITS.map((l) => (
            <li key={l} className="flex gap-2.5">
              <Icon name="remove" size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <span className="text-body-md text-on-surface-variant">{l}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

const INTEGRATION_TONE = {
  built: { tone: "pass" as const, label: "working" },
  ready: { tone: "info" as const, label: "seam built" },
  roadmap: { tone: "neutral" as const, label: "roadmap" },
};

function IntegrationsTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card elevation="raised">
        <CardHeader
          icon="hub"
          title="Where this sits in the system around it"
          description="The engine is an HTTP API and the browser computes nothing, so capture and report generation are already decoupled — which is what makes each of these a connection rather than a rewrite."
        />
        <p className="text-body-md text-on-surface-variant">
          <strong className="text-on-surface">“Seam built”</strong> means the interface exists and is
          tested but the counterparty is not connected — usually because it needs credentials or a
          published schema we do not have. It is not a synonym for planned.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <Card key={i.name} className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-headline-sm text-on-surface">{i.name}</h3>
                <p className="text-label-sm uppercase tracking-wider text-on-surface-variant mt-0.5">{i.where}</p>
              </div>
              <Badge tone={INTEGRATION_TONE[i.status].tone}>{INTEGRATION_TONE[i.status].label}</Badge>
            </div>
            <p className="text-body-md text-on-surface-variant mt-2.5 flex-1">{i.what}</p>
            <p className="text-body-sm text-on-surface-variant mt-3 rounded-xl bg-surface-container-low px-3 py-2">
              {i.statusNote}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EvidenceTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card elevation="raised">
        <CardHeader
          icon="verified"
          title="Every number can be checked"
          description="The standards ship with the repository as greppable text with page markers, so a citation is not a promise."
        />
        <p className="text-body-md text-on-surface-variant">
          The working rule was: verify against the primary source before implementing, and never
          invent a statistic. Where a figure is an estimate — the ~645 certificates a year is a
          run-rate, not a published figure — it says so.
        </p>
        <div className="mt-4 rounded-2xl bg-surface-container-low p-4">
          <p className="text-label-md text-on-surface mb-1.5">Check a threshold yourself:</p>
          <code className="block font-mono text-body-sm text-on-surface-variant">
            grep -n "Table 6" docs/standards/extracted/OIML_R76-1_2006_requirements.txt
          </code>
        </div>
      </Card>

      <Card>
        <CardHeader icon="folder_open" title="Where the evidence lives" />
        <ul className="flex flex-col gap-2.5">
          {EVIDENCE.map((e) => (
            <li key={e.file} className="flex flex-wrap gap-x-3 gap-y-1 rounded-2xl border border-outline-variant/50 p-3.5">
              <code className="font-mono text-body-sm font-semibold text-primary">{e.file}</code>
              <span className="min-w-0 flex-1 text-body-md text-on-surface-variant">{e.what}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader icon="psychology_alt" title="Why there is no AI in the calculation path" />
        <p className="text-body-lg text-on-surface max-w-3xl">
          OIML's own Digital Transformation group position is that AI is not yet court-proof for
          legal metrology. Every value this system produces comes from a deterministic function,
          unit-tested against the standards&rsquo; own worked examples. The multi-interval walk,
          Table 8&rsquo;s family selection and Annex F.6.1&rsquo;s worked example are all
          reproduced exactly.
        </p>
        <p className="text-body-md text-on-surface-variant mt-3 max-w-3xl">
          That is not a missing feature. A model approval is a legal gate under section 22 of the
          Legal Metrology Act — no state licence without it — and a number on that report has to
          be defensible in a way that a probabilistic output is not. AI belongs outside the legal
          path: explaining a deficiency in plain language, for instance, where being wrong is
          embarrassing rather than actionable.
        </p>
        <Badge tone="info" icon="verified" className="mt-4">
          420 tests · every threshold traced to a page of the standard
        </Badge>
      </Card>
    </div>
  );
}
