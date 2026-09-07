/**
 * Sign in.
 *
 * The seed accounts are listed openly because they are the point of the demonstration: the
 * approval chain is MA → AD/DD → Director, and no single account can walk a report from bench
 * to certificate. Signing in as each in turn is how that separation is shown to be real
 * rather than asserted.
 *
 * The page is honest that this is not authentication. Pretending otherwise — a password box
 * that accepts anything — would be worse than saying so.
 */

import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Card, Icon, Spinner } from "../components/ui";
import { cn } from "../lib/cn";
import { DEMO_ACCOUNTS, ROLE_LABEL, initialsOf, useAuth } from "../lib/auth";

export function LoginPage() {
  const { session, loading, signIn, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner size={28} />
      </div>
    );
  }
  if (session) return <Navigate to={from} replace />;

  async function choose(userId: string) {
    setPending(userId);
    const ok = await signIn(userId);
    setPending(null);
    if (ok) navigate(from, { replace: true });
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="flex flex-col items-center text-center">
          <span
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
            style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-grad-cyan))" }}
          >
            <Icon name="balance" size={28} />
          </span>
          <h1 className="text-display-lg text-on-surface">TulaSetu</h1>
          <p className="text-body-lg text-on-surface-variant mt-2 max-w-xl">
            Type-evaluation test reports for non-automatic weighing instruments, under OIML R 76
            and the Seventh Schedule to the Legal Metrology (General) Rules, 2011.
          </p>
          <p className="text-body-sm text-on-surface-variant mt-3 max-w-xl">
            The report is computed, not filled in. Every error, permissible-error band and
            verdict comes from a deterministic engine tested against the standards&rsquo; own
            worked examples.
          </p>
        </div>

        {error && <Alert tone="fail" title="Could not sign in">{error}</Alert>}

        <Card elevation="raised" className="p-6">
          <h2 className="text-headline-sm text-on-surface">Choose an officer</h2>
          <p className="text-body-md text-on-surface-variant mt-1">
            Each role sees a different application. A Metrological Assistant records
            observations but cannot issue a certificate; the Director issues certificates but
            does not record bench readings.
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.userId}>
                <button
                  onClick={() => choose(account.userId)}
                  disabled={pending !== null}
                  className={cn(
                    "flex w-full flex-col items-start gap-2 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-4 text-left",
                    "transition-colors hover:border-primary/50 hover:bg-surface-container-low",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary text-label-lg font-bold">
                      {initialsOf(account.name)}
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-label-lg text-on-surface">{account.name}</span>
                      <span className="text-body-sm text-on-surface-variant">{ROLE_LABEL[account.role]}</span>
                    </span>
                  </span>
                  <span className="text-body-sm text-on-surface-variant">{account.lab}</span>
                  {pending === account.userId && (
                    <span className="flex items-center gap-2 text-body-sm text-primary">
                      <Spinner size={13} /> Signing in…
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Alert tone="warn" title="This is a demonstration sign-in, not authentication">
          The browser sends a user id and the server trusts it. A deployment replaces this with
          NIC single sign-on or a DSC-backed session; sections 4 and 5 of the Information
          Technology Act, 2000 give those the same standing as writing and a handwritten
          signature. The API refuses to start under <code className="font-mono">NODE_ENV=production</code>{" "}
          while this stub is in place.
        </Alert>
      </div>
    </div>
  );
}
