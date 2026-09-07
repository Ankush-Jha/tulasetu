import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InstrumentProfilePage from './pages/InstrumentProfilePage';
import TestListPage from './pages/TestListPage';
import ObservationEntryPage from './pages/ObservationEntryPage';
import FamilySolverPage from './pages/FamilySolverPage';
import ReportGenerationPage from './pages/ReportGenerationPage';
import ReportsRepositoryPage from './pages/ReportsRepositoryPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        
        {/* Protected Routes inside AppLayout */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          
          {/* Wizard Routes */}
          <Route path="/new">
             <Route index element={<Navigate to="profile" replace />} />
             <Route path="profile" element={<InstrumentProfilePage />} />
             <Route path="tests" element={<TestListPage />} />
             <Route path="observations" element={<ObservationEntryPage />} />
          </Route>
          
          <Route path="/family-solver" element={<FamilySolverPage />} />
          <Route path="/report/generate" element={<ReportGenerationPage />} />
          <Route path="/reports" element={<ReportsRepositoryPage />} />
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
