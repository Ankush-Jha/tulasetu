/**
 * Application shell, and the gate in front of it.
 *
 * Two things were wrong before: the layout wrapped every page in a second white card, so a
 * page's own cards sat on white-on-white with only shadows to separate them; and nothing
 * checked whether anyone was signed in, so `/` rendered the full application to an anonymous
 * visitor. The canvas is now the coloured ground and each page's cards sit directly on it,
 * which is what gives the surfaces an edge to be read against.
 *
 * Three more additions live here rather than in a page, because all three are properties of the
 * shell, not of any one screen:
 *
 *  - **The phone-width nav drawer's open/closed state.** The sidebar renders differently below
 *    `md` (see Sidebar.tsx); this is what opens and closes that, and it closes automatically on
 *    every route change so a link followed from the drawer does not leave it sitting over the
 *    page it just navigated to (F11/V-02).
 *  - **The skip-to-content link (V-07).** First in the DOM, off-screen until focused, so a
 *    keyboard user is not forced through the header and sidebar's stops on every single page.
 *  - **Onboarding.** Triggered here, once, the first time a role's session reaches `/dashboard`
 *    — see `useOnboarding` for why this file rather than DashboardPage owns the automatic
 *    trigger (the header's replay control needs the same dialog reachable from every page, not
 *    just the dashboard).
 */

import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { LoadingState } from "../ui";
import { cn } from "../../lib/cn";
import { useAuth } from "../../lib/auth";
import { OnboardingDialog, useOnboarding } from "../onboarding/Onboarding";

export function AppLayout() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const onboarding = useOnboarding(session, location.pathname);

  // A link followed inside the drawer already closes it (Sidebar's own click handler), but the
  // browser back/forward buttons and any programmatic navigation do not go through that
  // handler — this catches those too.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Wait for the restore attempt before deciding. Redirecting first would sign out anyone
  // who refreshed the page.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingState label="Restoring your session…" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Header
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onReplayOnboarding={onboarding.replay}
        canReplayOnboarding={onboarding.canReplay}
      />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-h-screen pt-[92px] pb-8 pl-4 pr-4 transition-[padding] duration-200",
          collapsed ? "md:pl-[92px]" : "md:pl-[236px]",
        )}
      >
        <div className="mx-auto w-full max-w-[1400px]">
          <Outlet />

          {/*
            One line of attribution, not a board of logos. The authority strip that used to sit
            here restated on every screen what the sign-in page already says once, and it
            competed with the officer's actual work for the bottom of the page.
          */}
          <footer className="mt-10 border-t border-outline-variant/40 pt-4">
            <p className="text-center text-label-sm text-on-surface-variant/70">
              A Smart India Hackathon 2026 prototype, built to OIML R 76 and the Legal Metrology
              (General) Rules, 2011. Not an official publication of any department or standards body.
            </p>
          </footer>
        </div>
      </main>

      {onboarding.visible && (
        <OnboardingDialog steps={onboarding.steps} onClose={onboarding.dismiss} />
      )}
    </div>
  );
}
