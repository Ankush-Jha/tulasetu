/**
 * First-run onboarding.
 *
 * Someone opening this prototype cold — a judge, a metrologist, a teammate — needs three things
 * in the first minute: what problem it solves, what they are looking at, and where to click.
 * An empty dashboard supplies none of them.
 *
 * Two deliberate choices:
 *
 *  - **It is skippable and it stays skipped.** Onboarding that reappears is a nuisance; the
 *    dismissal is remembered, and there is a way back to it from the header so nothing is lost
 *    by skipping.
 *  - **The tour narrates the metrology, not the interface.** "This is the sidebar" is worthless.
 *    "The permissible-error band changes part-way up a weighing range, and here is where you
 *    watch it happen" is the thing worth ninety seconds of a visitor's attention.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Icon } from "../ui";
import { cn } from "../../lib/cn";

const SEEN_KEY = "tulasetu.onboarding.seen";

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private browsing, or storage blocked. Showing the welcome again is a much smaller cost
    // than crashing the application over a preference.
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------

interface Step {
  title: string;
  body: string;
  aside?: string;
  route?: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    icon: "help",
    title: "The problem, in one paragraph",
    body:
      "Before a weighing instrument can be sold in India it needs central model approval — a legal " +
      "gate under section 22 of the Legal Metrology Act. Approval requires a laboratory to run " +
      "around seventeen tests from OIML R 76 and record them on a standardised 62-page form. " +
      "Today that form is filled in spreadsheets. The problem statement's own words: " +
      "“time-consuming, prone to calculation errors and lacking uniformity.”",
    aside: "Problem statement SIH26035 · Department of Consumer Affairs",
  },
  {
    icon: "calculate",
    title: "Every cell of that form is a computed value",
    body:
      "The error is E = I + ½e − ΔL − L, corrected to Ec = E − E₀, and the row passes if " +
      "|Ec| ≤ mpe. Seventeen forms reduce to six calculation kernels. So we do not help someone " +
      "fill the form — we compute the report, and the form becomes a rendering of it.",
    aside: "The engine is 420 tests, built from the standards' own worked examples.",
  },
  {
    icon: "trending_up",
    title: "The error a spreadsheet makes",
    body:
      "On a multi-interval instrument the scale interval changes with the load, so the permissible " +
      "error can widen part-way up a range with nothing changing on the display. On the standard's " +
      "worked example the limit walks ±0.5 g, ±1 g, ±2 g, ±3 g, ±10 g — and the jump to ±3 g " +
      "happens at 4 kg, mid-range. One e for the whole instrument gets every row after that wrong.",
    aside: "Watch for it: the observation table announces the shoulder at the row where it happens.",
  },
  {
    icon: "route",
    title: "Walk a report from bench to certificate",
    body:
      "Sign in as the Metrological Assistant to record observations, as the Assistant Director to " +
      "review, as the Director to lock and sign. No single account can do all three — that " +
      "separation is the approval chain the Approval of Models Rules describe, enforced rather " +
      "than drawn.",
    route: "/reports/new",
    aside: "Load the worked example on the profile step and the numbers will match the standard.",
  },
  {
    icon: "verified",
    title: "Check anything you doubt",
    body:
      "Every threshold traces to a page of the standard, and the standards ship with the " +
      "repository as searchable text. The briefing carries the problem, the requirement coverage " +
      "including what is not built, the integrations, and where each figure came from.",
    route: "/brief",
    aside: "Nothing here asks to be taken on trust.",
  },
];

export function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" && !isLast) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function finish(goTo?: string) {
    markOnboardingSeen();
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
        {/* The spectrum strip is the one place the brand gradient earns its keep. */}
        <div className="gradient-spectrum h-1.5" aria-hidden="true" />

        <div className="p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed text-on-primary-fixed">
              <Icon name={current.icon} size={24} />
            </span>
            <button
              onClick={() => finish()}
              aria-label="Skip the introduction"
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <p className="mt-5 text-label-sm uppercase tracking-wider text-on-surface-variant">
            {step + 1} of {STEPS.length}
          </p>
          <h2 id="onboarding-title" className="text-headline-lg text-on-surface mt-1">
            {current.title}
          </h2>
          <p className="text-body-lg text-on-surface-variant mt-3">{current.body}</p>
          {current.aside && (
            <p className="mt-4 rounded-2xl bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
              <Icon name="lightbulb" size={16} className="mr-1.5 inline align-[-3px] text-primary" />
              {current.aside}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Introduction progress">
              {STEPS.map((_, i) => (
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
                  Start looking around
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

/**
 * The persistent way back in.
 *
 * Sits in the header so someone who skipped the introduction, or who arrived at a deep link, is
 * never more than one click from the briefing.
 */
export function BriefingLink({ onReplay }: { onReplay: () => void }) {
  return (
    <button
      onClick={onReplay}
      title="Replay the introduction"
      className={cn(
        "hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary-fixed px-3 py-1.5 md:inline-flex",
        "text-label-md font-semibold text-on-primary-fixed transition-colors hover:bg-primary-fixed-dim",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
    >
      <Icon name="menu_book" size={16} />
      New here?
    </button>
  );
}
