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
}

export const NAV_SECTIONS: NavSection[] = [
  // First, deliberately. Someone opening this cold needs the problem before the workspace.
  { path: "/brief", label: "Briefing", icon: "menu_book" },
  { path: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
  { path: "/reports", label: "Reports", icon: "folder_open", prefix: true },
  { path: "/tools/family", label: "Family solver", icon: "account_tree" },
  { path: "/tools/modules", label: "Modules", icon: "memory" },
  { path: "/statistics", label: "Statistics", icon: "monitoring", capability: "stats:read_own_lab" },
  { path: "/rulepack", label: "Rule pack", icon: "gavel" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

/** Is `pathname` inside `section`? */
export function isSectionActive(section: NavSection, pathname: string): boolean {
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

export const REPORT_STEPS: ReportStep[] = [
  { slug: "profile", label: "Instrument profile", icon: "precision_manufacturing", hint: "Identity, class, ranges" },
  { slug: "tests", label: "Applicable tests", icon: "checklist", hint: "Resolved from the rule pack" },
  { slug: "observations", label: "Observations", icon: "edit_note", hint: "Bench readings and verdicts" },
  { slug: "checklist", label: "Checklist", icon: "fact_check", hint: "R 76-2 §17" },
  { slug: "attachments", label: "Attachments", icon: "attachment", hint: "Figures and drawings" },
  { slug: "audit", label: "Audit trail", icon: "verified_user", hint: "Append-only record" },
  { slug: "report", label: "Report", icon: "description", hint: "PDF, DOCX, JSON" },
];

export function reportPath(reportId: string, slug?: string): string {
  return `/reports/${encodeURIComponent(reportId)}${slug ? `/${slug}` : ""}`;
}
