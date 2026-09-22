/**
 * Role-aware first-run onboarding.
 *
 * The previous tour (removed in 80cb7a0, "cut what the problem statement never asked for") sold
 * the pitch — the problem statement, the kernel count, the hackathon name. What is missing now
 * is not a pitch, it is orientation: an officer who has never opened this application does not
 * know that a Metrological Assistant cannot see the Director's buttons, or that a submitted
 * report stops taking edits from anyone. That is what these steps say, and only that — no SIH,
 * no DoCA, no logos, nothing a Director reviewing a real report would find out of place.
 *
 * The dialog mechanics (skippable, Esc, backdrop, a dot-per-step progress row) are carried over
 * from that removed `Tour.tsx` — `git show 80cb7a0^:apps/web/src/components/onboarding/Tour.tsx`
 * — because the interaction was never the problem, only the words.
 *
 * Content is role-aware because the three seats see different applications: a common first step
 * says what every role should trust (the verdict is computed, not theirs to re-check by hand),
 * and two more steps cover what *this* role actually does. The Assistant/Deputy Director copy
 * is deliberately silent on report:create — AD/DD hold that capability in rbac.ts as a fallback,
 * but advertising "you can also start a report" would misrepresent the review seat the product
 * argues for.
 *
 * Two copy points were checked against the actual guards rather than assumed, and are worth
 * keeping checked:
 *  - The Metrological Assistant's submit step does not say a failing result blocks submission,
 *    and does not say "passing" anywhere. What actually blocks SUBMITTED_FOR_REVIEW is missing
 *    readings or a blocking data-validation issue (`all_applicable_forms_complete`,
 *    `no_blocking_validation_issues` in apps/api/src/domain/lifecycle.ts) — confirmed against
 *    TS-DEMO-0002, which fails every form it carries and still reaches SUBMITTED. A failing row
 *    is a legitimate result, not an error to clear first.
 *  - The Director's step does not assert that the application itself checks whether three
 *    months have passed before offering a provisional certificate — it does not; the Director
 *    can issue one on any RECOMMENDED report, and three months is the legal condition Rule 6(8)
 *    states, not a gate this build enforces. "Where AoM Rule 6(8) allows one" is the phrase that
 *    stays true either way.
 * Both steps also say the freeze rule out loud: SUBMITTED, DEFICIENCY, RECOMMENDED, REMITTED and
 * PROVISIONAL are all read-only for every role. A remitted report only becomes editable again
 * once the Metrological Assistant clicks Reopen for further tests; a report with a deficiency,
 * once the Assistant/Deputy Director clicks Return to Metrological Assistant. Either way the
 * correction reaches the Metrological Assistant through the reviewer, never as a direct edit.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Icon } from "../ui";
import { cn } from "../../lib/cn";
import type { RoleId } from "../../lib/api";

interface Step {
  icon: string;
  title: string;
  body: string;
  /** Offered as "Take me there" — every value here must be a route that exists in App.tsx. */
  route?: string;
}

const VERDICT_STEP: Step = {
  icon: "calculate",
  title: "The verdict is computed, not your job to check by hand",
  body:
    "Every error and pass/fail you see comes from the same engine, run the same way, for " +
    "every report. Your job is the readings that go in — the instrument's class, the loads, " +
    "the displayed value — not the arithmetic that comes out. If a number on screen looks " +
    "wrong, check what was typed in first.",
};

const MA_STEPS: Step[] = [
  VERDICT_STEP,
  {
    icon: "edit_note",
    title: "Record a report",
    body:
      "Start from New report in the sidebar. Fill in the instrument's profile once — class, " +
      "Max, e, d — and the applicable tests fill themselves in below it. Enter each reading; " +
      "pass or fail appears next to it as you go.",
    route: "/reports/new",
  },
  {
    icon: "send",
    title: "Submit when it's ready",
    body:
      "Once every applicable form has its readings and no data errors remain, the report's " +
      "overview page offers Mark observations complete, then Submit to AD/DD. A failing " +
      "result is a legitimate outcome on its own — it does not hold a report back. From the " +
      "moment it is submitted the report stops taking edits from anyone, including you; if " +
      "something needs fixing, it comes back to you through the reviewer as a deficiency, not " +
      "as a change you make directly.",
  },
];

const AD_STEPS: Step[] = [
  VERDICT_STEP,
  {
    icon: "fact_check",
    title: "Review what's waiting on you",
    body:
      "Your dashboard's Waiting on you card lists only reports in a state you can move — " +
      "today, reports a Metrological Assistant has submitted. Open one to see every reading " +
      "and its verdict before deciding.",
  },
  {
    icon: "call_split",
    title: "Recommend it, or send it back",
    body:
      "On a submitted report you can Recommend to Director if it's clean, or Record a " +
      "deficiency if something needs fixing first — that sends it back to the Metrological " +
      "Assistant with your note attached. You cannot skip straight to issuing a certificate; " +
      "that is the Director's step alone.",
  },
];

const DIRECTOR_STEPS: Step[] = [
  VERDICT_STEP,
  {
    icon: "gavel",
    title: "Decide what's recommended",
    body:
      "Your dashboard's Waiting on you card lists reports an Assistant/Deputy Director has " +
      "recommended, plus anything else you can act on directly. Open one to see the full " +
      "record before deciding.",
  },
  {
    icon: "lock",
    title: "Lock, sign, and issue",
    body:
      "A recommended report can be remitted back for further tests, given a provisional " +
      "certificate where AoM Rule 6(8) allows one, or locked — which fixes the record copy " +
      "and starts the certificate. No Metrological Assistant or Assistant/Deputy Director " +
      "account can take this step; it is yours alone.",
    route: "/reports",
  },
];

function stepsForRole(role: RoleId | undefined): Step[] | null {
  switch (role) {
    case "MA":
      return MA_STEPS;
    case "AD":
    case "DD":
      return AD_STEPS;
    case "DIRECTOR":
      return DIRECTOR_STEPS;
    default:
      // ADMIN, or a role this walkthrough has no seat-specific copy for yet.
      return null;
  }
}

function storageKey(role: string): string {
  return `taraazu.onboarding.seen.${role}`;
}

function hasSeen(role: string): boolean {
  try {
    return localStorage.getItem(storageKey(role)) === "1";
  } catch {
    // Private browsing, or storage blocked. Showing the introduction again costs an officer a
    // few seconds; silently swallowing the first-run guidance would cost more.
    return false;
  }
}

function markSeen(role: string): void {
  try {
    localStorage.setItem(storageKey(role), "1");
  } catch {
    /* ignore */
  }
}

/**
 * Owns whether the dialog is open and which role's steps it shows.
 *
 * Two ways in: automatically, once, the first time a role's session lands on `/dashboard`; or
 * manually, at any time and from any page, through the header's replay control — which is why
 * `replay` does not check the pathname the way the automatic effect does.
 */
export function useOnboarding(
  session: { role: RoleId } | null,
  pathname: string,
): { visible: boolean; steps: Step[]; dismiss: () => void; replay: () => void; canReplay: boolean } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    if (pathname !== "/dashboard") return;
    if (hasSeen(session.role)) return;
    if (!stepsForRole(session.role)) return;
    setOpen(true);
  }, [session, pathname]);

  const steps = stepsForRole(session?.role) ?? [];

  function dismiss() {
    if (session) markSeen(session.role);
    setOpen(false);
  }

  function replay() {
    setOpen(true);
  }

  return { visible: open && steps.length > 0, steps, dismiss, replay, canReplay: steps.length > 0 };
}

export function OnboardingDialog({ steps, onClose }: { steps: Step[]; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" && !isLast) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  function finish(goTo?: string) {
    onClose();
    if (goTo) navigate(goTo);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && finish()}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-surface-container-lowest card-shadow-lg">
        <div className="gradient-spectrum h-1.5" aria-hidden="true" />

        <div className="p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed text-on-primary-fixed">
              <Icon name={current.icon} size={24} />
            </span>
            <button
              onClick={() => finish()}
              aria-label="Skip the introduction"
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <p className="mt-5 text-label-sm uppercase tracking-wider text-on-surface-variant">
            {step + 1} of {steps.length}
          </p>
          <h2 id="onboarding-title" className="text-headline-lg text-on-surface mt-1">
            {current.title}
          </h2>
          <p className="text-body-lg text-on-surface-variant mt-3">{current.body}</p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Introduction progress">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}`}
                  aria-selected={i === step}
                  role="tab"
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step ? "w-6 bg-primary" : "w-1.5 bg-outline-variant hover:bg-outline",
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" icon="arrow_back" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              {!isLast && (
                <Button variant="ghost" onClick={() => finish()}>
                  Skip
                </Button>
              )}
              {current.route && (
                <Button variant="secondary" icon="open_in_new" onClick={() => finish(current.route)}>
                  Take me there
                </Button>
              )}
              {isLast ? (
                <Button variant="primary" icon="check" onClick={() => finish()}>
                  Got it
                </Button>
              ) : (
                <Button variant="primary" icon="arrow_forward" onClick={() => setStep((s) => s + 1)}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
