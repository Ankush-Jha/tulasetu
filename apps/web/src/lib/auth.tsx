/**
 * Who is signed in, and what they are allowed to do.
 *
 * The header used to print "Priya Sharma, Chief Metrologist" as literal text on every screen,
 * for everybody. That is not a cosmetic problem: this application's whole compliance argument
 * rests on the approval chain being MA → AD/DD → Director, and a UI that shows one identity to
 * all users cannot express that chain. Worse, it invites a UI that shows every control to
 * every user and lets the server do the refusing — which teaches officers that half the
 * buttons fail.
 *
 * So identity comes from the server (`GET /me`), and capabilities come with it. `can()` is
 * the same capability vocabulary the API enforces, which keeps the two in step: the UI hides
 * what the server would refuse, and the server still refuses it if the UI is wrong.
 *
 * Authentication itself is a demonstration stub on both sides — the browser sends a user id,
 * the server trusts it. Replacing it with NIC SSO or a DSC-backed session touches this file
 * and `api.ts`, and nothing else.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setApiUser, type Me, type RoleId } from "./api";

const STORAGE_KEY = "tulasetu.userId";

export interface Session extends Me {
  /** Display name, resolved from the directory below. */
  displayName: string;
  roleLabel: string;
  labName: string;
}

interface AuthValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (userId: string) => Promise<boolean>;
  signOut: () => void;
  can: (capability: string) => boolean;
  hasRole: (...roles: RoleId[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export const ROLE_LABEL: Record<RoleId, string> = {
  MA: "Metrological Assistant",
  AD: "Assistant Director",
  DD: "Deputy Director",
  DIRECTOR: "Director (Legal Metrology)",
  ADMIN: "System Administrator",
};

/**
 * Seed accounts offered on the sign-in screen.
 *
 * These exist so the approval chain can actually be walked in a demo — one person cannot both
 * record observations and issue a certificate, by design. Names are placeholders for seeded
 * accounts, not real officers.
 */
export const DEMO_ACCOUNTS: { userId: string; name: string; role: RoleId; lab: string }[] = [
  { userId: "u-ma", name: "A. Assistant", role: "MA", lab: "RRSL Faridabad" },
  { userId: "u-ad", name: "B. Deputy", role: "AD", lab: "RRSL Faridabad" },
  { userId: "u-dir", name: "C. Director", role: "DIRECTOR", lab: "RRSL Faridabad" },
];

function decorate(me: Me): Session {
  const known = DEMO_ACCOUNTS.find((a) => a.userId === me.userId);
  return {
    ...me,
    displayName: known?.name ?? me.userId,
    roleLabel: ROLE_LABEL[me.role] ?? me.role,
    labName: known?.lab ?? me.labId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore the previous session on load, so a refresh mid-report does not sign the officer
  // out and lose where they were.
  useEffect(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!stored) {
      setLoading(false);
      return;
    }
    setApiUser(stored);
    api
      .me()
      .then((me) => setSession(decorate(me)))
      .catch(() => {
        // The stored id is no longer valid (account deactivated, database reset). Clear it
        // rather than leaving the app wedged against an identity the server rejects.
        setApiUser(null);
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (userId: string) => {
    setError(null);
    setApiUser(userId);
    try {
      const me = await api.me();
      setSession(decorate(me));
      localStorage.setItem(STORAGE_KEY, userId);
      return true;
    } catch (err: unknown) {
      setApiUser(null);
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setApiUser(null);
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      error,
      signIn,
      signOut,
      can: (capability: string) => session?.capabilities.includes(capability) ?? false,
      hasRole: (...roles: RoleId[]) => (session ? roles.includes(session.role) : false),
    }),
    [session, loading, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

/** Initials for the avatar, derived rather than stored. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
