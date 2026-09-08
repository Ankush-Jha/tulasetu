/**
 * Application shell, and the gate in front of it.
 *
 * Two things were wrong before: the layout wrapped every page in a second white card, so a
 * page's own cards sat on white-on-white with only shadows to separate them; and nothing
 * checked whether anyone was signed in, so `/` rendered the full application to an anonymous
 * visitor. The canvas is now the coloured ground and each page's cards sit directly on it,
 * which is what gives the surfaces an edge to be read against.
 */

import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { LoadingState } from "../ui";
import { cn } from "../../lib/cn";
import { useAuth } from "../../lib/auth";

export function AppLayout() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

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
      <Header />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main
        className={cn(
          "min-h-screen pt-[92px] pb-8 pr-4 transition-[padding] duration-200",
          collapsed ? "pl-[92px]" : "pl-[236px]",
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
    </div>
  );
}
