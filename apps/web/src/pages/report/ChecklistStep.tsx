/**
 * R 76-2 §17 checklists.
 *
 * 363 yes/no items across four checklists, transcribed from the standard. Which of the four
 * apply is decided by the instrument, not by the officer: 17.1 covers everything except
 * non-self-indicating instruments, 17.2 direct sales and price computing, 17.3 electronic
 * instruments, 17.4 software-controlled ones.
 *
 * Answers are written to the append-only log, so they appear on the generated report and carry
 * the date and person who recorded them. Changing an answer appends a new entry rather than
 * overwriting the old one — the amendment is dated and attributed, and the original survives
 * (ISO/IEC 17025 §7.8).
 *
 * Items are addressed by their position within the checklist, not by the clause they cite:
 * several items legitimately cite the same clause, and keying on the reference would let one
 * answer stand for questions nobody answered.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Clause,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Stat,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api } from "../../lib/api";
import { useApi, useMutation } from "../../lib/useApi";
import { NeedsProfile, useReport, type InstrumentProfileShape } from "./ReportLayout";

interface ChecklistItem {
  ref: string;
  section?: string;
  text: string;
  answerType?: string;
  _uncertain?: boolean;
}
interface ChecklistBank {
  source: string;
  checklists: { id: string; title: string; items: ChecklistItem[] }[];
}

type Answer = "yes" | "no" | "na";

/** Which checklists this instrument attracts. Mirrors the pack's `checklist_rules`. */
function applicableChecklists(p: InstrumentProfileShape): Record<string, string | null> {
  return {
    "17.1":
      p.indicatingType === "non-self"
        ? "Excludes non-self-indicating instruments (R 76-2 §17.1)."
        : null,
    "17.2":
      p.directSalesToPublic || p.priceComputing
        ? null
        : "Applies only to instruments for direct sales to the public, or price-computing and labelling instruments (R 76-2 §17.2).",
    "17.3": p.electronic ? null : "Applies only to electronic weighing instruments (R 76-2 §17.3).",
    "17.4": p.softwareControlled
      ? null
      : "Applies only to software-controlled digital devices and instruments (R 76-2 §17.4).",
  };
}

export function ChecklistStep() {
  const { reportId, instrument } = useReport();

  const bank = useApi<ChecklistBank>(
    (s) =>
      fetch("/api/checklists", { signal: s }).then((r) => {
        if (!r.ok) throw new Error(`Checklist bank unavailable (${r.status}).`);
        return r.json() as Promise<ChecklistBank>;
      }),
    [],
  );
  const saved = useApi((s) => api.checklistAnswers(reportId, s), [reportId]);
  const save = useMutation(api.saveChecklistAnswers);

  /** Working answers, keyed `checklistId#index`. */
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<string | null>(null);

  // Seed from what is already recorded, so returning to the step shows the report's state.
  useEffect(() => {
    if (!saved.data) return;
    const seeded: Record<string, Answer> = {};
    for (const a of saved.data) seeded[`${a.checklist_id}#${a.item_index}`] = a.answer;
    setAnswers(seeded);
    setDirty(new Set());
  }, [saved.data]);

  const applicability = useMemo(
    () => (instrument ? applicableChecklists(instrument) : {}),
    [instrument],
  );

  if (!instrument) return <NeedsProfile />;
  if (bank.loading || saved.loading) return <LoadingState label="Loading the checklist…" />;
  if (bank.error) return <ErrorState error={bank.error} onRetry={bank.reload} />;
  if (!bank.data) return null;

  const lists = bank.data.checklists;
  const currentId = active ?? lists.find((l) => applicability[l.id] === null)?.id ?? lists[0]?.id ?? "";
  const current = lists.find((l) => l.id === currentId);
  const naReason = applicability[currentId];

  const indexed = (current?.items ?? []).map((item, index) => ({ item, index }));
  const items = indexed.filter(({ item }) =>
    filter
      ? item.text.toLowerCase().includes(filter.toLowerCase()) ||
        item.ref.toLowerCase().includes(filter.toLowerCase())
      : true,
  );

  const answered = indexed.filter(({ index }) => answers[`${currentId}#${index}`]).length;
  const totalApplicable = lists
    .filter((l) => applicability[l.id] === null)
    .reduce((n, l) => n + l.items.length, 0);
  const totalAnswered = Object.keys(answers).length;

  const dirtyHere = [...dirty].filter((k) => k.startsWith(`${currentId}#`));

  function setAnswer(key: string, value: Answer) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirty((d) => new Set(d).add(key));
  }

  async function saveCurrent() {
    if (!current || dirtyHere.length === 0) return;
    const payload = dirtyHere.map((key) => {
      const index = Number(key.split("#")[1]);
      return {
        index,
        ref: current.items[index]?.ref ?? "",
        answer: answers[key]!,
      };
    });
    const result = await save.run(reportId, currentId, payload);
    if (result) {
      setDirty((d) => {
        const next = new Set(d);
        for (const k of dirtyHere) next.delete(k);
        return next;
      });
      saved.reload();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Items in the bank" value={lists.reduce((n, l) => n + l.items.length, 0)} icon="fact_check" />
        <Stat label="Applicable to this instrument" value={totalApplicable} icon="checklist" tone="info" />
        <Stat
          label="Recorded"
          value={`${totalAnswered} / ${totalApplicable}`}
          icon="edit_note"
          tone={totalAnswered > 0 ? "pass" : "neutral"}
        />
      </div>

      {save.error && <Alert tone="fail" title="Could not save">{save.error}</Alert>}

      {/* Checklist tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {lists.map((l) => {
          const excluded = applicability[l.id];
          const isActive = l.id === currentId;
          const pending = [...dirty].some((k) => k.startsWith(`${l.id}#`));
          return (
            <button
              key={l.id}
              onClick={() => setActive(l.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3.5 py-2 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                isActive
                  ? "border-primary/40 bg-primary-fixed text-on-primary-fixed"
                  : "border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low",
              )}
            >
              <span className="font-mono text-label-md font-semibold">{l.id}</span>
              <span className="text-label-md">{l.items.length}</span>
              {excluded ? <Badge tone="neutral">– –</Badge> : <Badge tone="info">applies</Badge>}
              {pending && <Badge tone="warn" icon="edit">unsaved</Badge>}
            </button>
          );
        })}
      </div>

      <Card padded={false}>
        <div className="p-5 pb-3">
          <CardHeader
            icon="fact_check"
            title={`${currentId} — ${current?.title ?? ""}`}
            description={`${answered} of ${current?.items.length ?? 0} answered · transcribed verbatim from R 76-2 §17`}
            action={
              !naReason ? (
                <Button
                  variant="primary"
                  icon="save"
                  loading={save.pending}
                  disabled={dirtyHere.length === 0}
                  onClick={saveCurrent}
                >
                  {dirtyHere.length === 0
                    ? "Saved"
                    : `Record ${dirtyHere.length} answer${dirtyHere.length === 1 ? "" : "s"}`}
                </Button>
              ) : undefined
            }
          />
          {naReason ? (
            <Alert tone="neutral" icon="do_not_disturb_on" title="Not applicable to this instrument">
              {naReason}
            </Alert>
          ) : (
            <Field label="Filter items">
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search the item text or a clause reference…"
                type="search"
              />
            </Field>
          )}
        </div>

        {!naReason &&
          (items.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="search_off" title="No items match that filter" />
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/30 border-t border-outline-variant/40">
              {items.map(({ item, index }) => {
                const key = `${currentId}#${index}`;
                const answer = answers[key];
                const unsaved = dirty.has(key);
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex flex-wrap items-start gap-3 px-5 py-3",
                      unsaved && "bg-[#FEF3C7]/30",
                    )}
                  >
                    <span className="w-20 shrink-0 font-mono text-body-sm text-on-surface-variant">
                      {item.ref}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-md text-on-surface">{item.text}</span>
                      {item.section && (
                        <span className="block text-label-sm text-on-surface-variant mt-0.5">{item.section}</span>
                      )}
                      {item._uncertain && (
                        <Badge tone="warn" icon="help" className="mt-1">
                          transcription uncertain — verify against the PDF
                        </Badge>
                      )}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {(["yes", "no", "na"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setAnswer(key, v)}
                          aria-pressed={answer === v}
                          className={cn(
                            "h-8 min-w-[44px] rounded-lg border px-2 text-label-md font-semibold transition-colors",
                            answer === v
                              ? v === "yes"
                                ? "border-success/40 bg-success-container text-on-success"
                                : v === "no"
                                  ? "border-error/40 bg-error-container text-on-error-container"
                                  : "border-outline-variant bg-surface-container-high text-on-surface-variant"
                              : "border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-low",
                          )}
                        >
                          {v === "na" ? "– –" : v === "yes" ? "Yes" : "No"}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          ))}
      </Card>

      <p className="text-body-sm text-on-surface-variant">
        <Clause>{bank.data.source}</Clause> — answers are appended, never overwritten: changing
        one records a new, dated entry and the original stays in the log. Six items across the
        bank are marked uncertain where the PDF extraction was ambiguous; they are flagged in
        place rather than guessed.
      </p>
    </div>
  );
}
