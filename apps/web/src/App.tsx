/**
 * Routes.
 *
 * The shape mirrors the domain: a report is an entity with steps beneath it, not a set of
 * loose pages that happen to share a wizard. That is why the steps live under
 * `/reports/:reportId/…` — the report id is in the URL, so a link to an observation form is a
 * link to *that* report's form, and refreshing does not lose which report is open.
 *
 * The previous routing had `/observations` and `/test-matrix` as standalone pages with no
 * report attached, which meant they could only ever show fixed content.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./lib/auth";

import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ReportsPage } from "./pages/ReportsPage";
import { NewReportPage } from "./pages/NewReportPage";
import { FamilySolverPage } from "./pages/FamilySolverPage";
import { ModulesPage } from "./pages/ModulesPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { RulePackPage } from "./pages/RulePackPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

import { ReportLayout } from "./pages/report/ReportLayout";
import { ProfileStep } from "./pages/report/ProfileStep";
import { TestsStep } from "./pages/report/TestsStep";
import { ObservationsStep } from "./pages/report/ObservationsStep";
import { ChecklistStep } from "./pages/report/ChecklistStep";
import { AttachmentsStep } from "./pages/report/AttachmentsStep";
import { AuditStep } from "./pages/report/AuditStep";
import { OutputStep } from "./pages/report/OutputStep";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Everything below requires a session; AppLayout redirects if there is none. */}
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/new" element={<NewReportPage />} />

            <Route path="/reports/:reportId" element={<ReportLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfileStep />} />
              <Route path="tests" element={<TestsStep />} />
              <Route path="observations" element={<ObservationsStep />} />
              <Route path="checklist" element={<ChecklistStep />} />
              <Route path="attachments" element={<AttachmentsStep />} />
              <Route path="audit" element={<AuditStep />} />
              <Route path="report" element={<OutputStep />} />
            </Route>

            <Route path="/tools/family" element={<FamilySolverPage />} />
            <Route path="/tools/modules" element={<ModulesPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/rulepack" element={<RulePackPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
