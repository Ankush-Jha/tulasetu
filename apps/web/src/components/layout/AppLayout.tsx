/**
 * Application shell, and the gate in front of it.
 *
 * Two things were wrong before: the layout wrapped every page in a second white card, so a
 * page's own cards sat on white-on-white with only shadows to separate them; and nothing
 * checked whether anyone was signed in, so `/` rendered the full application to an anonymous
 * visitor. The canvas is now the coloured ground and each page's cards sit directly on it,
 * which is what gives the surfaces an edge to be read against.
 */

import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { LoadingState } from "../ui";
import { cn } from "../../lib/cn";
import { useAuth } from "../../lib/auth";
import { OnboardingDialog, hasSeenOnboarding } from "../onboarding/Tour";

export function AppLayout() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // The introduction runs once. Someone arriving on a deep link gets it too — they have no
  // more context than someone landing on the dashboard.
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (session && !hasSeenOnboarding()) setShowIntro(true);
  }, [session]);

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
      <Header onReplayIntro={() => setShowIntro(true)} />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {showIntro && <OnboardingDialog onClose={() => setShowIntro(false)} />}
      <main
        className={cn(
          "min-h-screen pt-[92px] pb-8 pr-4 transition-[padding] duration-200",
          collapsed ? "pl-[92px]" : "pl-[236px]",
        )}
      >
        <div className="mx-auto w-full max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
