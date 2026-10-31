import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { AppShell } from './layouts/AppShell';
import { BrandedStartup } from './components/BrandedStartup';
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
const ProgressAnalyticsPage = React.lazy(() => import('./pages/ProgressAnalyticsPage'));
const HabitPage = React.lazy(() => import('./pages/HabitPage'));
const MonthlyReportPage = React.lazy(() => import('./pages/MonthlyReportPage'));

import { apiClient } from './api/client';

// Route adapter: Kết nối trực tiếp với Backend API /api/v1/reports/monthly
const MonthlyReportRoute: React.FC = () => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const [month, setMonth] = React.useState(() => today.slice(0, 7));
  const [loadState, setLoadState] = React.useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [reportData, setReportData] = React.useState<any>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>(undefined);

  const fetchReport = React.useCallback(async (m: string) => {
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const [y, mNum] = m.split('-').map(Number);
      const res = await apiClient.get(`/reports/monthly?year=${y}&month=${mNum}`);
      setReportData(res.data);
      if (res.data.days && res.data.days.length > 0) {
        setLoadState('ready');
      } else {
        setLoadState('empty');
      }
    } catch (err: any) {
      setLoadState('error');
      setErrorMessage(err.response?.data?.detail || 'Không tải được báo cáo tháng');
    }
  }, []);

  React.useEffect(() => {
    fetchReport(month);
  }, [month, fetchReport]);

  return (
    <div className="space-y-6">
      <MonthlyReportView
        month={month}
        today={today}
        loadState={loadState}
        data={reportData}
        errorMessage={errorMessage}
        onMonthChange={setMonth}
        onRetry={() => fetchReport(month)}
      />
    </div>
  );
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
  return <BrandedStartup announce={show} label="Đang tải trang…" />;
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
              <Route path="/progress" element={<ProgressAnalyticsPage />} />
              <Route path="/goal-setup" element={<GoalPlannerWizard />} />
              <Route path="/habits" element={<HabitPage />} />
              <Route path="/reports" element={<MonthlyReportPage />} />
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
