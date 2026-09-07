/**
 * Profile and permissions.
 *
 * Shows the signed-in officer what they may actually do, and — as importantly — what they may
 * not. In an application built around a separation of duties, "why is that button not there"
 * is a question the software should answer plainly rather than by silence.
 *
 * The lifecycle table is here for the same reason: it shows every transition, who may take it,
 * and the provision it comes from, so the approval chain is inspectable rather than folklore.
 */

import {
  Badge,
  Card,
  CardHeader,
  Disclosure,
  ErrorState,
  Icon,
  KeyValue,
  LoadingState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { cn } from "../lib/cn";
import { api, type RoleId } from "../lib/api";
import { useApi } from "../lib/useApi";
import { initialsOf, useAuth } from "../lib/auth";

/** Every capability the server defines, so absences are visible rather than merely missing. */
const ALL_CAPABILITIES: { id: string; label: string }[] = [
  { id: "report:create", label: "Create reports" },
  { id: "report:read_own_lab", label: "Read own laboratory's reports" },
  { id: "report:read_any_lab", label: "Read any laboratory's reports" },
  { id: "report:record_observations", label: "Record observations" },
  { id: "report:edit_profile", label: "Edit the instrument profile" },
  { id: "report:submit", label: "Submit for review" },
  { id: "report:review", label: "Review" },
  { id: "report:raise_deficiency", label: "Raise a deficiency" },
  { id: "report:recommend", label: "Recommend to the Director" },
  { id: "report:remit", label: "Remit back for further tests" },
  { id: "report:lock", label: "Lock the record copy" },
  { id: "report:issue_certificate", label: "Issue a certificate" },
  { id: "report:publish", label: "Publish" },
  { id: "report:revoke", label: "Revoke an approval" },
  { id: "attachment:upload", label: "Upload attachments" },
  { id: "attachment:read_confidential", label: "Read confidential attachments" },
  { id: "rulepack:load", label: "Load rule packs" },
  { id: "stats:read_own_lab", label: "Read own laboratory's statistics" },
  { id: "stats:read_national", label: "Read the national roll-up" },
  { id: "user:manage", label: "Manage users" },
  { id: "audit:verify", label: "Verify the audit trail" },
];

export function SettingsPage() {
  const { session } = useAuth();
  const lifecycle = useApi((s) => api.lifecycle(s), []);

  if (!session) return null;

  const held = new Set(session.capabilities);

  return (
    <>
      <PageHeader
        eyebrow="Your account"
        title="Profile and permissions"
        description="What this role may do, and the provision behind each step of the approval chain."
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3.5">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary text-headline-sm font-bold">
              {initialsOf(session.displayName)}
            </span>
            <div className="min-w-0">
              <p className="text-headline-sm text-on-surface truncate">{session.displayName}</p>
              <p className="text-body-md text-on-surface-variant">{session.roleLabel}</p>
            </div>
          </div>
          <dl className="mt-4">
            <KeyValue label="User id"><span className="font-mono text-body-sm">{session.userId}</span></KeyValue>
            <KeyValue label="Laboratory">{session.labName}</KeyValue>
            <KeyValue label="Laboratory id"><span className="font-mono text-body-sm">{session.labId}</span></KeyValue>
            <KeyValue label="Role"><Badge tone="info">{session.role}</Badge></KeyValue>
            <KeyValue label="Capabilities held">
              {held.size} of {ALL_CAPABILITIES.length}
            </KeyValue>
          </dl>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            icon="key"
            title="Capabilities"
            description="Held in green, withheld in grey. The server enforces the same list."
          />
          <p className="mb-3 text-body-md text-on-surface">
            This role holds <strong>{held.size}</strong> of {ALL_CAPABILITIES.length} capabilities.
            The ones that matter most for daily work:{" "}
            {ALL_CAPABILITIES.filter((c) => held.has(c.id)).slice(0, 3).map((c) => c.label.toLowerCase()).join(", ")}.
          </p>
          <Disclosure summary="Every capability, held and withheld">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {ALL_CAPABILITIES.map((c) => {
              const has = held.has(c.id);
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5",
                    has ? "bg-success-container/50" : "bg-surface-container-low/60",
                  )}
                >
                  <Icon
                    name={has ? "check_circle" : "remove_circle_outline"}
                    size={16}
                    className={has ? "text-on-success" : "text-on-surface-variant/60"}
                  />
                  <span className={cn("text-body-sm", has ? "text-on-surface" : "text-on-surface-variant/70")}>
                    {c.label}
                  </span>
                </li>
              );
            })}
          </ul>
          </Disclosure>
          <p className="mt-3 text-body-sm text-on-surface-variant">
            The system administrator deliberately holds no statutory power — it can manage the
            installation but cannot issue, publish or revoke an approval. Separating the person
            who runs the software from the authority who approves a model is the reason roles
            exist at all.
          </p>
        </Card>
      </div>

      <Card padded={false} className="mt-5">
        <div className="p-5 pb-0">
          <CardHeader
            icon="account_tree"
            title="The approval chain"
            description="Every transition, who may take it, and the provision it implements"
          />
        </div>
        <div className="px-6 pb-2">
          <Disclosure summary={`All ${lifecycle.data?.transitions.length ?? ""} transitions, who may take each, and its legal basis`}>
        {lifecycle.error ? (
          <div className="p-5"><ErrorState error={lifecycle.error} onRetry={lifecycle.reload} /></div>
        ) : lifecycle.loading ? (
          <LoadingState />
        ) : (
          <TableWrap className="rounded-t-none border-x-0 border-b-0">
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Action</Th>
                <Th>To</Th>
                <Th>Roles</Th>
                <Th>Basis</Th>
              </tr>
            </thead>
            <tbody>
              {lifecycle.data?.transitions.map((t, i) => {
                const mine = t.roles.includes(session.role as RoleId);
                return (
                  <tr key={i} className={cn(mine && "bg-primary-fixed/25")}>
                    <Td className="font-mono text-body-sm">{t.from}</Td>
                    <Td>
                      {t.label}
                      {t.requires.length > 0 && (
                        <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                          requires: {t.requires.join(", ").replace(/_/g, " ")}
                        </span>
                      )}
                    </Td>
                    <Td className="font-mono text-body-sm">{t.to}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {t.roles.map((r) => (
                          <Badge key={r} tone={r === session.role ? "info" : "neutral"}>
                            {r}
                          </Badge>
                        ))}
                      </span>
                    </Td>
                    <Td className="text-body-sm text-on-surface-variant">{t.basis}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
          </Disclosure>
        </div>
        <p className="p-6 pt-3 text-body-sm text-on-surface-variant">
          Rows your role can take are highlighted. Note that{" "}
          <span className="text-on-surface">Recommended → Remitted</span> exists because AoM
          Rule 8 lets the Director send a report back for further tests — a one-way pipeline
          would model the happy path and misstate the law.
        </p>
      </Card>
    </>
  );
}
