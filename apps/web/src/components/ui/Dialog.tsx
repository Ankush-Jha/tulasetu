/**
 * The one modal primitive.
 *
 * Before this there was no dialog anywhere in the app: "Record deficiency" moved a report
 * straight from SUBMITTED to DEFICIENCY on a single click, and Lock/Issue/Publish did the
 * same for an irreversible sign-off. A confirmation step and a form-in-a-dialog are the same
 * shape of problem — stop, ask, then act — so one component serves both call sites (and any
 * future one: streams other than this can reuse it as-is).
 *
 * Accessibility is not optional here: an officer using a screen reader or a keyboard is
 * signing a legal record exactly as much as anyone using a mouse.
 *
 *  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` so assistive tech announces it
 *    as a dialog and reads its title.
 *  - Focus moves into the dialog on open (the first focusable element, or the panel itself if
 *    it has none) and is trapped inside it with Tab/Shift+Tab while it is open.
 *  - Esc closes it, calling `onClose` — the same function the visible close affordance calls,
 *    so both paths behave identically.
 *  - Focus returns to whatever triggered the dialog when it closes, so a keyboard user is not
 *    dropped back at the top of the page.
 *  - The page behind it is inert to pointer and scroll: a click on the dimmed backdrop closes
 *    the dialog rather than reaching through to whatever is under it.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Record deficiency">
 *     ...body...
 *     <DialogActions>
 *       <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button variant="primary" onClick={submit}>Record</Button>
 *     </DialogActions>
 *   </Dialog>
 *
 * `onClose` is called for Esc, the backdrop and the built-in close button alike — callers
 * that need to block closing mid-submit simply do not unmount / do not call `setOpen(false)`
 * from a `pending` guard before calling `onClose` themselves.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

// Not imported from "./index" — that module re-exports this file, and importing back from it
// would make the two files a circular pair. A single glyph does not need the shared Icon.

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`).current;
  // Focus returns here on close — captured at open time, since by close time `document.activeElement`
  // may already have moved to whatever is inside the dialog.
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    // Move focus into the panel. A timeout of 0 waits for the panel to be in the DOM, since
    // this effect and the render that mounts it commit together.
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      // Wrap the trap at both ends, so Tab/Shift+Tab never escapes to the page behind it.
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* The backdrop is the click target that closes the dialog; it carries no content of
          its own, so `aria-hidden` keeps assistive tech from ever landing on it. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#0b1c30]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-3xl bg-surface-container-lowest p-6 card-shadow-lg",
          "max-h-[85vh] overflow-y-auto focus:outline-none",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-headline-sm text-on-surface">{title}</h2>
            {description && <p className="mt-1 text-body-sm text-on-surface-variant">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined leading-none select-none" style={{ fontSize: 18 }} aria-hidden="true">
              close
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Bottom action row: Cancel on the left, the committing action anchored right. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex items-center justify-end gap-2">{children}</div>;
}
