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
const HabitPage = React.lazy(() => import('./pages/HabitPage'));
const MonthlyReportPage = React.lazy(() => import('./pages/MonthlyReportPage'));
const MealPlanPage = React.lazy(() => import('./pages/MealPlanPage'));
const OnboardingSurvey = React.lazy(() => import('./pages/OnboardingSurvey'));
const AdminPage = React.lazy(() => import('./pages/AdminPage'));


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
            <Route path="/onboarding" element={<OnboardingSurvey />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<BasicDashboard />} />
              <Route path="/capture" element={<MealCaptureFlow />} />
              <Route path="/progress" element={<Navigate to="/" replace />} />
              <Route path="/goal-setup" element={<GoalPlannerWizard />} />
              <Route path="/habits" element={<HabitPage />} />
              {/* Báo cáo tháng dùng chung một màn hình; đường dẫn cũ /reports chuyển về đây */}
              <Route path="/monthly-report" element={<MonthlyReportPage />} />
              <Route path="/reports" element={<Navigate to="/monthly-report" replace />} />
              <Route path="/meal-plan" element={<MealPlanPage />} />
              <Route path="/admin" element={<AdminPage />} />
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
