/**
 * Header: brand, context, identity.
 *
 * It no longer carries a second navigation. It used to duplicate the sidebar with eight pill
 * links, which meant two places to look for the same thing and two places for them to
 * disagree — and they did disagree.
 *
 * The user cluster shows who is actually signed in and what they may do, because the approval
 * chain (MA → AD/DD → Director) is the point of the product and a header that shows one
 * hard-coded name to everybody cannot express it.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Icon } from "../ui";
import { cn } from "../../lib/cn";
import { initialsOf, useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";

export function Header() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Which rule pack is in force. Shown in the chrome because every number the application
  // produces depends on it, and "which edition computed this" is the first question a
  // metrology reviewer asks.
  const { data: health } = useApi((signal) => api.health(signal), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[76px] border-b border-outline-variant/40 bg-canvas/85 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-grad-cyan))" }}
            >
              <Icon name="balance" size={18} />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-headline-sm font-bold text-on-surface">TulaSetu</span>
              <span className="truncate text-label-sm text-on-surface-variant">
                NAWI type evaluation · OIML R 76
              </span>
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {health && (
            // A draft edition announces itself in the chrome. A report computed against a
            // committee draft is indistinguishable from one computed against the standard in
            // force unless the application says so.
            <Badge
              tone={health.draftEdition ? "warn" : "neutral"}
              icon={health.draftEdition ? "science" : "gavel"}
              className="hidden lg:inline-flex"
              {...(health.rulesetStatus ? { title: health.rulesetStatus } : {})}
            >
              {health.rulesetId}
              {health.rulesetVersion ? ` v${health.rulesetVersion}` : ""}
              {health.draftEdition ? " · DRAFT" : ""}
            </Badge>
          )}

          {session && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn(
                  "flex items-center gap-2.5 rounded-full border border-outline-variant/50 bg-surface-container-lowest py-1.5 pl-1.5 pr-3",
                  "transition-colors hover:bg-surface-container-low",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary text-label-md font-bold">
                  {initialsOf(session.displayName)}
                </span>
                <span className="hidden text-left md:flex md:flex-col md:leading-tight">
                  <span className="text-label-md font-semibold text-on-surface">{session.displayName}</span>
                  <span className="text-label-sm text-on-surface-variant">
                    {session.roleLabel} · {session.labName}
                  </span>
                </span>
                <Icon name="expand_more" size={18} className="text-on-surface-variant" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] w-72 rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-2 card-shadow-lg"
                >
                  <div className="border-b border-outline-variant/40 px-3 py-2.5">
                    <p className="text-label-lg text-on-surface">{session.displayName}</p>
                    <p className="text-body-sm text-on-surface-variant">{session.roleLabel}</p>
                    <p className="text-body-sm text-on-surface-variant">{session.labName}</p>
                    <p className="mt-1.5 text-label-sm text-on-surface-variant">
                      {session.capabilities.length} capabilities granted
                    </p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/settings");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-body-md text-on-surface transition-colors hover:bg-surface-container-low"
                  >
                    <Icon name="badge" size={18} className="text-on-surface-variant" />
                    Profile and permissions
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                      navigate("/login");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-body-md text-error transition-colors hover:bg-error-container/50"
                  >
                    <Icon name="logout" size={18} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
