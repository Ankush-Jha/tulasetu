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
 */

import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Icon } from "../ui";
import { cn } from "../../lib/cn";
import { NAV_GROUPS, NAV_SECTIONS, isSectionActive } from "../../lib/nav";
import { useAuth } from "../../lib/auth";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const { can } = useAuth();

  const sections = NAV_SECTIONS.filter((s) => !s.capability || can(s.capability));

  return (
    <aside
      className={cn(
        "fixed left-4 top-[76px] bottom-4 z-40 flex flex-col rounded-2xl bg-surface-container-lowest card-shadow",
        "transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-[212px]",
      )}
    >
      <nav className="flex-1 overflow-y-auto p-2.5">
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

      <div className="border-t border-outline-variant/40 p-2.5">
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
  );
}
