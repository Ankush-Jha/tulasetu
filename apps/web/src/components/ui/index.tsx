/**
 * The primitive layer.
 *
 * Every page was carrying its own appearance: 376 inline `style={{…}}` blocks repeating the
 * same twenty hex values that `index.css` already defines as design tokens. Borders were the
 * worst of it — some cards had a hairline, some a 2px dashed rule, some only a shadow, some
 * both — so nothing on screen agreed with anything else.
 *
 * These components are the fix. A page composes them and never states a colour, a radius, a
 * border or a shadow of its own. That is what makes the surface consistent, and it is also
 * what makes it *changeable*: the palette lives in `index.css`, the shapes live here, and a
 * page that wants a different look is a page with a bug.
 *
 * Two rules the whole system rests on:
 *
 *  - **One elevation scale.** `flat` (hairline border, no shadow) for anything sitting inside
 *    another surface; `raised` (shadow, no border) for anything floating above the canvas.
 *    Never both — a border plus a shadow reads as two competing edges.
 *  - **Tokens, not hex.** Tailwind 4 generates utilities from the `@theme` block, so
 *    `text-on-surface-variant` *is* `#434655`. Writing the hex again just hides it.
 */

import { useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export { Dialog, DialogActions } from "./Dialog";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

/** Material Symbols glyph. Sized in px because the icon font is optically sized. */
export function Icon({
  name,
  size = 20,
  className,
  filled,
}: {
  name: string;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={cn("material-symbols-outlined leading-none select-none", className)}
      style={{
        fontSize: size,
        ...(filled ? { fontVariationSettings: "'FILL' 1" } : null),
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export type Elevation = "flat" | "raised" | "none";

const ELEVATION: Record<Elevation, string> = {
  // Sits inside another surface: a hairline defines it, nothing more.
  flat: "border border-outline-variant/50 bg-surface-container-lowest",
  // Floats above the canvas: a soft shadow defines it, and it takes no border.
  raised: "bg-surface-container-lowest card-shadow",
  none: "",
};

export function Card({
  children,
  className,
  elevation = "flat",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  elevation?: Elevation;
  padded?: boolean;
}) {
  return (
    <section className={cn("rounded-3xl", ELEVATION[elevation], padded && "p-6", className)}>
      {children}
    </section>
  );
}

/** Card header. Keeps the title/description/action rhythm identical everywhere. */
export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-primary">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-headline-sm text-on-surface truncate">{title}</h2>
          {description && <p className="text-body-sm text-on-surface-variant mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

/**
 * The top of every page.
 *
 * Every page previously rewrote this block — eyebrow, title, description — with its own
 * spacing and its own colours. One component means the pages line up.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant mb-1">{eyebrow}</p>
        )}
        <h1 className="text-headline-lg text-on-surface">{title}</h1>
        {description && <p className="text-body-md text-on-surface-variant mt-1 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

/**
 * Variants.
 *
 * `primary` wears the obsidian anchor rather than the brand blue. DESIGN.md is explicit that
 * the anchor is what establishes call-to-action polarity against a pastel canvas — the blue is
 * an accent, and a blue button on a blue-tinted page is a weaker signal than a black one.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "cta-anchor",
  secondary:
    "bg-surface-container-lowest text-on-surface border border-outline-variant/60 hover:bg-surface-container-low",
  ghost: "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
  danger: "bg-error text-on-error hover:bg-error/90",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-4 text-label-md gap-1.5",
  md: "h-10 px-5 text-label-lg gap-2",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        // Full pill: DESIGN.md's shape language gives buttons, filters and chips complete
        // pill silhouettes, and cards the squircle.
        "inline-flex items-center justify-center rounded-full font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Verdict and status
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "pass" | "fail" | "warn" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-container-low text-on-surface-variant",
  pass: "bg-success-container text-on-success",
  fail: "bg-error-container text-on-error-container",
  warn: "bg-[#FEF3C7] text-[#92400E]",
  info: "bg-primary-fixed text-on-primary-fixed",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      {...(title ? { title } : {})}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-sm font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

/**
 * A verdict, rendered the way R 76-2 renders it.
 *
 * Not applicable prints as "– –", not as blank and not as "N/A". The convention is the
 * standard's, and a lab officer reads the report expecting it.
 */
export function Verdict({ value }: { value: string | null | undefined }) {
  if (value === "PASSED") return <Badge tone="pass" icon="check_circle">PASSED</Badge>;
  if (value === "FAILED") return <Badge tone="fail" icon="cancel">FAILED</Badge>;
  if (value === "NA") return <Badge tone="neutral">– –</Badge>;
  return <Badge tone="neutral">In progress</Badge>;
}

/** Report lifecycle state, coloured by how far along it is. */
export function StatusChip({ status }: { status: string }) {
  const tone: Tone =
    status === "PUBLISHED" || status === "CERTIFICATE_ISSUED" || status === "LOCKED"
      ? "pass"
      : status === "DEFICIENCY" || status === "WITHDRAWN" || status === "REMITTED"
        ? "fail"
        : status === "SUBMITTED" || status === "RECOMMENDED" || status === "PROVISIONAL"
          ? "info"
          : "neutral";
  return <Badge tone={tone}>{humanizeStatus(status)}</Badge>;
}

export function humanizeStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: string;
  tone?: Tone;
}) {
  return (
    <Card elevation="flat" className="flex items-start gap-3">
      {icon && (
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE[tone])}>
          <Icon name={icon} size={20} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="text-metric-display text-on-surface tabular-nums">{value}</p>
        {hint && <p className="text-body-sm text-on-surface-variant mt-0.5">{hint}</p>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-label-md text-on-surface">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </span>
      {children}
      {error ? (
        <span className="text-body-sm text-error">{error}</span>
      ) : (
        hint && <span className="text-body-sm text-on-surface-variant">{hint}</span>
      )}
    </label>
  );
}

const CONTROL =
  "h-10 w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 " +
  "text-body-md text-on-surface placeholder:text-on-surface-variant/60 " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 " +
  "disabled:bg-surface-container-low disabled:text-on-surface-variant transition-colors";

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={cn(CONTROL, invalid && "border-error focus:border-error focus:ring-error/20", className)} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CONTROL, "pr-8 appearance-none cursor-pointer", className)}>
      {children}
    </select>
  );
}

export function TextArea({
  className,
  invalid,
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      rows={rows}
      className={cn(
        CONTROL,
        "h-auto resize-y py-2",
        invalid && "border-error focus:border-error focus:ring-error/20",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/**
 * Table shell.
 *
 * Wide tables scroll inside their own container rather than pushing the page sideways —
 * the observation forms are genuinely wide (R 76-2's form 1 has ten columns) and the page
 * body must never scroll horizontally.
 */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-outline-variant/50", className)}>
      <table className="w-full border-collapse text-body-md">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className={cn(
        "bg-surface-container-low px-3 py-2.5 text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold",
        "border-b border-outline-variant/50 whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  colSpan,
  numeric,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
  numeric?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-3 py-2.5 border-b border-outline-variant/30 text-on-surface align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-container-low", className)} />;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
      <Spinner size={24} />
      <p className="text-body-md">{label}</p>
    </div>
  );
}

/**
 * Empty state.
 *
 * Uses the same hairline border as every other surface. The old pages drew a 2px dashed rule
 * here, which made "nothing to show" the loudest thing on the screen.
 */
export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/50 bg-surface-container-low/40 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-lowest text-on-surface-variant">
        <Icon name={icon} size={24} />
      </span>
      <div>
        <p className="text-headline-sm text-on-surface">{title}</p>
        {description && <p className="text-body-md text-on-surface-variant mt-1 max-w-md">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-error/30 bg-error-container/40 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error-container text-on-error-container">
        <Icon name="error" size={24} />
      </span>
      <div>
        <p className="text-headline-sm text-on-surface">Could not load this</p>
        <p className="text-body-md text-on-surface-variant mt-1 max-w-md">{error}</p>
      </div>
      {onRetry && <Button variant="secondary" icon="refresh" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Inline notice. `tone` carries the meaning; the icon just reinforces it. */
export function Alert({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  icon?: string;
}) {
  const ring: Record<Tone, string> = {
    neutral: "border-outline-variant/60 bg-surface-container-low",
    pass: "border-success/30 bg-success-container/50",
    fail: "border-error/30 bg-error-container/50",
    warn: "border-[#F59E0B]/30 bg-[#FEF3C7]/60",
    info: "border-primary/25 bg-primary-fixed/50",
  };
  const defaultIcon: Record<Tone, string> = {
    neutral: "info",
    pass: "check_circle",
    fail: "error",
    warn: "warning",
    info: "info",
  };
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5", ring[tone])}>
      <Icon name={icon ?? defaultIcon[tone]} size={18} className="mt-0.5 shrink-0 text-on-surface-variant" />
      <div className="min-w-0 text-body-md text-on-surface">
        {title && <p className="text-label-lg mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Key/value row, for the identity blocks that appear on almost every page. */
export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-outline-variant/30 last:border-0">
      <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</dt>
      <dd className="text-body-md text-on-surface">{children}</dd>
    </div>
  );
}

/** A clause reference. Monospaced so it reads as a citation, not as prose. */
export function Clause({ children }: { children: ReactNode }) {
  return <code className="text-body-sm text-on-surface-variant font-mono">{children}</code>;
}

/**
 * Detail that is available but not always on screen.
 *
 * Nielsen's eighth heuristic: a dialogue should not carry information that is irrelevant or
 * rarely needed, because every extra unit competes with the units that matter. Most of the
 * explanatory material in this application is genuinely useful *once* — the first time an
 * officer meets a choice — and is noise on the hundredth report.
 *
 * So it lives here: closed by default, one click away, and the summary line always says what is
 * inside so the reader can decide without opening it.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-outline-variant/50", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors",
          "hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          open ? "rounded-t-xl" : "rounded-xl",
        )}
      >
        <span className="text-label-md text-on-surface-variant">{summary}</span>
        <Icon
          name="expand_more"
          size={18}
          className={cn("shrink-0 text-on-surface-variant transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="border-t border-outline-variant/40 px-3 py-2.5">{children}</div>}
    </div>
  );
}

/**
 * A short definition attached to a term, revealed on demand.
 *
 * For the single word an officer might not know — "verification scale interval", "changeover
 * point" — where a sentence of explanation next to every one of them would drown the form.
 */
export function Explain({ children, term }: { children: ReactNode; term: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`What is ${term}?`}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition-colors hover:bg-primary hover:text-on-primary"
      >
        <Icon name="question_mark" size={11} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-20 w-64 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-3 text-body-sm font-normal text-on-surface-variant card-shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** Horizontal rule matching the table borders. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-outline-variant/40", className)} />;
}

// ---------------------------------------------------------------------------
// Extracted from the Stitch design suite
// ---------------------------------------------------------------------------

/**
 * Wizard stepper.
 *
 * A numbered rail with completed steps ticked. The Stitch screens use it to keep the officer
 * oriented across a long, multi-form procedure — which matters here more than in most wizards,
 * because a type evaluation is a dozen forms deep and there is no natural sense of "how far in
 * am I" from the data itself.
 */
export interface StepItem {
  id: string;
  label: string;
  hint?: string;
  state: "done" | "current" | "todo";
  href?: string;
}

export function Stepper({
  steps,
  onSelect,
  className,
}: {
  steps: StepItem[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Progress" className={cn("flex items-center gap-1 overflow-x-auto pb-1", className)}>
      {steps.map((s, i) => (
        <div key={s.id} className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onSelect?.(s.id)}
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-full px-3.5 py-2 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              s.state === "current"
                ? "bg-surface-container-lowest text-on-surface card-shadow"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-sm font-bold",
                s.state === "done"
                  ? "bg-success-container text-on-success"
                  : s.state === "current"
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {s.state === "done" ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="flex flex-col text-left leading-tight">
              <span className="text-label-md font-semibold whitespace-nowrap">{s.label}</span>
              {s.hint && <span className="text-label-sm opacity-75 whitespace-nowrap">{s.hint}</span>}
            </span>
          </button>
          {i < steps.length - 1 && (
            <span className="mx-0.5 h-px w-4 shrink-0 bg-outline-variant/60" aria-hidden="true" />
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * Segmented gauge.
 *
 * The Stitch design uses a run of coloured segments for "sub-range performance": one segment
 * per partial range, so a multi-interval instrument that passes in range 1 and fails in range 2
 * shows that at a glance rather than as a single averaged verdict.
 *
 * Segments carry a status colour *and* a label — never colour alone — and are separated by a
 * 2px surface gap so adjacent fills stay distinct.
 */
export interface GaugeSegment {
  label: string;
  sublabel?: string;
  state: "pass" | "fail" | "pending";
}

export function SegmentedGauge({ segments, className }: { segments: GaugeSegment[]; className?: string }) {
  const fill: Record<GaugeSegment["state"], string> = {
    pass: "bg-success",
    fail: "bg-error",
    pending: "bg-surface-container-high",
  };
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex gap-0.5" role="img" aria-label={segments.map((s) => `${s.label}: ${s.state}`).join("; ")}>
        {segments.map((s, i) => (
          <span
            key={i}
            className={cn("h-2 flex-1 rounded-full", fill[s.state])}
            title={`${s.label} — ${s.state}`}
          />
        ))}
      </div>
      <div className="flex justify-between gap-2">
        {segments.map((s, i) => (
          <span key={i} className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-label-sm text-on-surface truncate">{s.label}</span>
            {s.sublabel && (
              <span className="text-label-sm text-on-surface-variant truncate">{s.sublabel}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * An inline row inside a data table.
 *
 * The single best idea in the Stitch designs: rather than footnoting the range boundary, put a
 * banner *in the table* at the row where it happens — "e₁ = 2 g transitions to e₂ = 5 g, legal
 * tolerance widened to ±5.0 g". The event that a spreadsheet misses becomes the most visible
 * thing on the screen at exactly the point it occurs.
 *
 * Used for two things: the band shoulder, and a breach explained by how far over it went.
 */
export function TableCallout({
  tone = "info",
  icon,
  title,
  children,
  colSpan,
  action,
}: {
  tone?: Tone;
  icon?: string;
  title: string;
  children?: ReactNode;
  colSpan: number;
  action?: ReactNode;
}) {
  const skin: Record<Tone, string> = {
    neutral: "bg-surface-container-low",
    pass: "bg-success-container/40",
    fail: "bg-error-container/50",
    warn: "bg-[#FEF3C7]/60",
    info: "bg-primary-fixed/45",
  };
  const ink: Record<Tone, string> = {
    neutral: "text-on-surface-variant",
    pass: "text-on-success",
    fail: "text-on-error-container",
    warn: "text-[#92400E]",
    info: "text-on-primary-fixed",
  };
  return (
    <tr>
      <td colSpan={colSpan} className={cn("border-b border-outline-variant/30 px-3 py-2.5", skin[tone])}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn("flex items-center gap-2 text-label-lg", ink[tone])}>
            <Icon name={icon ?? "swap_vert"} size={17} />
            {title}
          </span>
          {children && <span className="text-body-sm text-on-surface-variant">{children}</span>}
          {action && <span className="ml-auto">{action}</span>}
        </div>
      </td>
    </tr>
  );
}

/**
 * Bottom action bar.
 *
 * The Stitch screens anchor the forward action to the foot of a long form, which is where an
 * officer's attention ends up after filling one. Secondary actions sit left, the anchor CTA
 * right.
 *
 * Deliberately *not* sticky. A pinned bar floats over whatever is beneath it, and on these
 * screens that is a table of observations — occluding a row of recorded measurements to keep a
 * button in view is the wrong trade on a compliance document.
 */
export function ActionBar({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-full",
        "border border-outline-variant/50 bg-surface-container-lowest/90 px-4 py-3 backdrop-blur-xl card-shadow",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}

/**
 * A recorded measurement environment, as the Stitch "ambient bench sensors" strip.
 *
 * R 76-2 puts temperature, humidity and pressure at the head of every environment-sensitive
 * form, and class I additionally requires barometric pressure — so this reads as instrument
 * context rather than decoration.
 */
export function AmbientStrip({
  temperatureC,
  relativeHumidityPct,
  pressureHPa,
  note,
  className,
}: {
  temperatureC?: number;
  relativeHumidityPct?: number;
  pressureHPa?: number;
  note?: string;
  className?: string;
}) {
  const items = [
    { icon: "thermostat", value: temperatureC, unit: "°C", label: "Temperature" },
    { icon: "humidity_percentage", value: relativeHumidityPct, unit: "%", label: "Relative humidity" },
    { icon: "compress", value: pressureHPa, unit: "hPa", label: "Barometric pressure" },
  ].filter((i) => i.value !== undefined);

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2", className)}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <Icon name={i.icon} size={17} className="text-on-surface-variant" />
          <span className="flex flex-col leading-tight">
            <span className="text-label-lg text-on-surface tabular-nums">
              {i.value} {i.unit}
            </span>
            <span className="text-label-sm text-on-surface-variant">{i.label}</span>
          </span>
        </span>
      ))}
      {note && <Badge tone="info" icon="sensors">{note}</Badge>}
    </div>
  );
}
