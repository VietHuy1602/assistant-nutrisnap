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
const BasicDashboard = React.lazy(() =>
  import('./pages/BasicDashboard').then((m) => ({ default: m.BasicDashboard })),
);
const MealCaptureFlow = React.lazy(() =>
  import('./pages/MealCaptureFlow').then((m) => ({ default: m.MealCaptureFlow })),
);
const GoalPlannerWizard = React.lazy(() =>
  import('./pages/GoalPlannerWizard').then((m) => ({ default: m.GoalPlannerWizard })),
);
const MonthlyReportView = React.lazy(() => import('./pages/MonthlyReportView'));

// Route adapter only: no monthly API contract or report data is assumed.
const MonthlyReportRoute: React.FC = () => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const [month, setMonth] = React.useState(() => today.slice(0, 7));

  return <MonthlyReportView month={month} today={today} loadState="empty" onMonthChange={setMonth} />;
};

// Chỉ import ApiStatusBadge trong môi trường phát triển (DEV)
const DevApiStatusBadge = import.meta.env.DEV
  ? React.lazy(() =>
      import('./components/dev/ApiStatusBadge').then((m) => ({ default: m.ApiStatusBadge })),
    )
  : null;

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
    <>
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
              <Route path="/" element={<BasicDashboard />} />
              <Route path="/capture" element={<MealCaptureFlow />} />
              <Route path="/goal-setup" element={<GoalPlannerWizard />} />
              <Route path="/monthly-report" element={<MonthlyReportRoute />} />
            </Route>
          </Route>

          {/* Điều hướng mặc định */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {import.meta.env.DEV && DevApiStatusBadge && (
        <Suspense fallback={null}>
          <DevApiStatusBadge />
        </Suspense>
      )}
    </>
  );
};

export default App;
