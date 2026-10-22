import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { AppShell } from './layouts/AppShell';
import { Spinner } from './components/Spinner';
import { useDelayedFlag } from './hooks/useDelayedFlag';

// Route Code-Splitting (SAC-10): LoginPage giữ eager (trang vào đầu), các route khác lazy load
const RegisterPage = React.lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const DashboardPage = React.lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const GoalPlannerWizard = React.lazy(() =>
  import('./pages/GoalPlannerWizard').then((m) => ({ default: m.GoalPlannerWizard })),
);

// Fallback trì hoãn 150 ms để tránh nháy spinner khi chunk tải nhanh (SAC-1, SAC-2)
const PageFallback: React.FC = () => {
  const show = useDelayedFlag(true, 150);
  if (!show) {
    return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  }
  return (
    <div
      aria-busy="true"
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3"
    >
      <Spinner size="lg" label="Đang tải trang..." />
      <p className="text-xs text-slate-500 font-medium">Đang tải trang…</p>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Tuyến đường chỉ dành cho khách (Public Only) */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Tuyến đường được bảo vệ (Protected Routes) nằm trong AppShell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/goal-setup" element={<GoalPlannerWizard />} />
          </Route>
        </Route>

        {/* Điều hướng mặc định */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
