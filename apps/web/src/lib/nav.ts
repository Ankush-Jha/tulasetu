/**
 * Navigation, defined once.
 *
 * The header carried eight links and the sidebar six icons, and they pointed at different
 * places — the sidebar's six (`/transport`, `/billing`, `/inspectors`, …) were leftovers from
 * a logistics template and had no routes at all, so five of six sidebar icons went nowhere.
 * The first icon was also hard-coded to render as selected (`isActive || i === 0`), so the
 * sidebar showed the wrong page as current no matter where you were.
 *
 * One list fixes all of it. The sidebar renders the sections; the header carries identity and
 * context, not a second copy of the same links.
 *
 * `capability` filters the list against what the server says this user may do, so an officer
 * is never shown a section whose every action would be refused.
 */

export interface NavSection {
  path: string;
  label: string;
  icon: string;
  /** Hidden unless the signed-in user holds this capability. */
  capability?: string;
  /** Match child routes too (e.g. /reports/TS-1 highlights Reports). */
  prefix?: boolean;
  group: NavGroup;
}

/**
 * Grouped, because eight flat items say nothing about which of them an officer uses daily.
 *
 * Creating a report and browsing the ones that exist are different tasks — one is an action
 * taken a few times a week, the other is a place you look things up — and collapsing them into
 * a single "Reports" entry made the primary action of the whole application something you had
 * to find inside a list. They are separate entries now.
 *
 * The three tools below are genuinely occasional: a family is solved once per submission, a
 * module combination checked once per design, the rule pack read when someone doubts a number.
 * Grouping them says so, rather than giving them the same weight as the daily work.
 */
export type NavGroup = "work" | "tools";

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "tools", label: "Reference" },
];

/**
 * Three things an officer does, and four things they occasionally look up.
 *
 * The "Reference" group is deliberately below the fold of attention. The family solver, the
 * module compatibility check, the rule pack and the annual return are all real and all
 * correct, but none of them is daily work, and giving them the same weight as "record a
 * report" made a nine-item sidebar out of a three-item job.
 */
export const NAV_SECTIONS: NavSection[] = [
  { path: "/dashboard", label: "Dashboard", icon: "space_dashboard", group: "work" },
  // The primary action of the application, given its own entry rather than buried in a list.
  { path: "/reports/new", label: "New report", icon: "add_circle", group: "work", capability: "report:create" },
  { path: "/reports", label: "Reports", icon: "folder_open", group: "work", prefix: true },

  { path: "/tools/family", label: "Family solver", icon: "account_tree", group: "tools" },
  { path: "/tools/modules", label: "Modules", icon: "memory", group: "tools" },
  { path: "/rulepack", label: "Rule pack", icon: "gavel", group: "tools" },
  { path: "/statistics", label: "Statistics", icon: "monitoring", group: "tools", capability: "stats:read_own_lab" },
  { path: "/settings", label: "Settings", icon: "settings", group: "tools" },
];

/** Is `pathname` inside `section`? */
export function isSectionActive(section: NavSection, pathname: string): boolean {
  // An exact match always wins: /reports/new is its own entry, so it must not also light up
  // the /reports prefix and leave two items looking current.
  if (NAV_SECTIONS.some((s) => s.path === pathname && s.path !== section.path)) return false;
  if (section.prefix) return pathname === section.path || pathname.startsWith(`${section.path}/`);
  return pathname === section.path;
}

/**
 * The steps of a single report, in the order the standard implies.
 *
 * Endurance aside, R 76-2 does not mandate an order of work — but the data does: the mpe
 * cannot be resolved without the profile, and applicability cannot be resolved without it
 * either. So the wizard is a real dependency chain, not decoration, and the steps report
 * whether they are reachable yet.
 */
export interface ReportStep {
  slug: string;
  label: string;
  icon: string;
  /** Short description shown in the stepper. */
  hint: string;
}

/**
 * Six steps, of which five are things the officer fills in.
 *
 * The audit trail used to be a seventh. It is a *view* of the append-only log, not a step of
 * the work, and putting it in the sequence made a reader count seven places to enter data when
 * there are five. It now lives on the report step, beside the outputs it authenticates.
 */
export const REPORT_STEPS: ReportStep[] = [
  { slug: "profile", label: "Instrument", icon: "precision_manufacturing", hint: "Identity, class, ranges" },
  { slug: "tests", label: "Applicable tests", icon: "checklist", hint: "Resolved from the rule pack" },
  { slug: "observations", label: "Observations", icon: "edit_note", hint: "Bench readings and verdicts" },
  { slug: "checklist", label: "Checklist", icon: "fact_check", hint: "R 76-2 §17" },
  { slug: "attachments", label: "Attachments", icon: "attachment", hint: "Figures and drawings" },
  { slug: "report", label: "Report", icon: "description", hint: "PDF, DOCX, JSON" },
];

export function reportPath(reportId: string, slug?: string): string {
  return `/reports/${encodeURIComponent(reportId)}${slug ? `/${slug}` : ""}`;
}
