/**
 * Primary navigation.
 *
 * Labelled, not icon-only. The previous version was a 64px rail of bare glyphs whose meaning
 * lived in a `title` attribute — which is unreachable by keyboard and invisible on touch. For
 * an application whose sections are "Family solver" and "Module compatibility", an icon alone
 * is a guessing game.
 *
 * Collapsible for officers who want the width back, and the collapsed state keeps the icons'
 * accessible names.
 *
 * Below `md` this is a fixed, always-212px rail that a viewport 390px wide cannot afford: it
 * used to sit on screen permanently, leaving under 160px for the actual page (F11/V-02). The
 * same `<aside>` now doubles as an off-canvas drawer at that width — translated fully off the
 * left edge until `mobileOpen`, sliding in over a backdrop rather than sharing the row with the
 * content. `md:` classes below restore the original fixed-rail behaviour untouched once there
 * is room for it.
 */

import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Icon } from "../ui";
import { cn } from "../../lib/cn";
import { NAV_GROUPS, NAV_SECTIONS, isSectionActive } from "../../lib/nav";
import { useAuth } from "../../lib/auth";

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** Whether the phone-width drawer is slid into view. Has no effect at `md` and above. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { pathname } = useLocation();
  const { can } = useAuth();

  const sections = NAV_SECTIONS.filter((s) => !s.capability || can(s.capability));

  // Esc closes the drawer, matching every other overlay in the application (the onboarding
  // dialog, the identity menu). Harmless to attach unconditionally below md — it only ever
  // fires while `mobileOpen` is true.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseMobile();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Backdrop: below md only, and only while the drawer is open. Clicking it is the same
          dismissal as the header's hamburger, Esc, or following a link. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-on-surface/40 md:hidden"
          aria-hidden="true"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          "fixed z-[60] flex flex-col bg-surface-container-lowest transition-transform duration-200 ease-out",
          "inset-y-0 left-0 w-72 max-w-[85vw] rounded-none shadow-2xl",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // md and up: the original fixed rail, its own width driven by `collapsed` rather than
          // the drawer's open state, and always in view (never translated away).
          "md:translate-x-0 md:inset-y-auto md:top-[76px] md:bottom-4 md:left-4 md:max-w-none",
          "md:rounded-2xl md:card-shadow md:shadow-none md:transition-[width]",
          collapsed ? "md:w-[68px]" : "md:w-[212px]",
        )}
      >
        {/* Closing on every link click matters only below md, where the drawer would otherwise
            stay open over whatever page it navigated to; harmless at md and up, where the
            drawer state this calls into has no visual effect. */}
        <nav
          className="flex-1 overflow-y-auto p-2.5"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) onCloseMobile();
          }}
        >
        {NAV_GROUPS.map((group) => {
          const items = sections.filter((s) => s.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="mb-3 last:mb-0">
              {!collapsed && (
                <p className="px-3 pb-1 pt-2 text-label-sm uppercase tracking-wider text-on-surface-variant/70">
                  {group.label}
                </p>
              )}
              {collapsed && group.id !== "work" && (
                <div className="mx-3 my-2 border-t border-outline-variant/40" aria-hidden="true" />
              )}
              <ul className="flex flex-col gap-1">
                {items.map((section) => {
                  const active = isSectionActive(section, pathname);
                  return (
                    <li key={section.path}>
                      <NavLink
                        to={section.path}
                        title={collapsed ? section.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 h-10 transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                          active
                            ? "bg-primary-fixed text-on-primary-fixed font-semibold"
                            : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <Icon name={section.icon} size={20} filled={active} />
                        {!collapsed && <span className="text-label-md truncate">{section.label}</span>}
                        {collapsed && <span className="sr-only">{section.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* The collapse-to-icons control only means something on the fixed desktop rail — the
          drawer is always full width, so it is hidden rather than shown with no visible effect. */}
      <div className="hidden border-t border-outline-variant/40 p-2.5 md:block">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-on-surface-variant transition-colors",
            "hover:bg-surface-container-low hover:text-on-surface",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            collapsed && "justify-center px-0",
          )}
        >
          <Icon name={collapsed ? "chevron_right" : "chevron_left"} size={20} />
          {!collapsed && <span className="text-label-md">Collapse</span>}
        </button>
      </div>
      </aside>
    </>
  );
}
