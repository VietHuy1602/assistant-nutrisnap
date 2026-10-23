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
      {/* Week 6 Habit & Monthly Strengths Summary Card */}
      {reportData?.habit_summary && (
        <div className="max-w-6xl mx-auto px-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Streak & Challenge */}
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-emerald-100">Chuỗi ngày duy trì</span>
                  <span className="text-2xl">🔥</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold">{reportData.habit_summary.current_streak}</span>
                  <span className="text-sm text-emerald-100">ngày liên tiếp</span>
                </div>
                <p className="mt-1 text-xs text-emerald-100">
                  Kỷ lục cao nhất: <strong className="text-white">{reportData.habit_summary.longest_streak} ngày</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-400/30">
                <div className="flex items-center justify-between text-xs">
                  <span>Thử thách 7 ngày</span>
                  <span className="font-bold">{reportData.habit_summary.seven_day_challenge?.completed_days ?? 0}/7 ngày</span>
                </div>
                <div className="mt-1 w-full bg-emerald-800/40 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-white h-full rounded-full transition-all duration-500"
                    style={{ width: `${reportData.habit_summary.seven_day_challenge?.progress_pct ?? 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs font-semibold text-emerald-100">
                  Huy hiệu: 🏆 {reportData.habit_summary.seven_day_challenge?.badge_name ?? 'Hành Trình Mới'}
                </p>
              </div>
            </div>

            {/* Weight Summary & EMA */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Biến động cân nặng & EMA</span>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-slate-400">Đầu kỳ</span>
                    <p className="text-xl font-bold text-slate-700">{reportData.weight_summary?.start_weight_kg ?? '--'} kg</p>
                  </div>
                  <span className="text-slate-300">→</span>
                  <div>
                    <span className="text-xs text-slate-400">Hiện tại</span>
                    <p className="text-xl font-bold text-slate-900">{reportData.weight_summary?.end_weight_kg ?? '--'} kg</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Thay đổi</span>
                    <p className={`text-xl font-extrabold ${
                      (reportData.weight_summary?.raw_weight_change_kg ?? 0) < 0
                        ? 'text-emerald-600'
                        : (reportData.weight_summary?.raw_weight_change_kg ?? 0) > 0
                        ? 'text-amber-600'
                        : 'text-slate-700'
                    }`}>
                      {(reportData.weight_summary?.raw_weight_change_kg ?? 0) > 0 ? '+' : ''}
                      {reportData.weight_summary?.raw_weight_change_kg ?? 0} kg
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                <span className="font-medium">Xu hướng làm mịn (EMA α=0.1): </span>
                <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${
                  reportData.weight_summary?.trend_direction === 'decreasing'
                    ? 'bg-emerald-50 text-emerald-700'
                    : reportData.weight_summary?.trend_direction === 'increasing'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {reportData.weight_summary?.trend_direction === 'decreasing' ? '📉 Đang giảm đều đặn'
                    : reportData.weight_summary?.trend_direction === 'increasing' ? '📈 Đang tăng cơ/cân'
                    : '⚖️ Duy trì ổn định'}
                </span>
              </div>
            </div>

            {/* Back on track & Strengths */}
            <div className={`rounded-2xl p-5 shadow-xs border flex flex-col justify-between ${
              reportData.habit_summary.back_on_track?.back_on_track_active
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-emerald-50/50 border-emerald-200'
            }`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs uppercase font-bold tracking-wider ${
                    reportData.habit_summary.back_on_track?.back_on_track_active ? 'text-amber-800' : 'text-emerald-800'
                  }`}>
                    {reportData.habit_summary.back_on_track?.back_on_track_active ? 'Quay lại đường đua' : 'Trạng thái phong độ'}
                  </span>
                  <span className="text-xl">
                    {reportData.habit_summary.back_on_track?.back_on_track_active ? '🌱' : '⭐'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700">
                  {reportData.habit_summary.back_on_track?.encouragement_message}
                </p>
                <div className="mt-2 p-2 rounded-xl bg-white/80 border border-slate-200/50 text-xs text-slate-600">
                  💡 <strong>Gợi ý:</strong> {reportData.habit_summary.back_on_track?.suggested_micro_action}
                </div>
              </div>
              <div className="mt-3 pt-2 text-[11px] text-slate-500 font-medium">
                Khóa calo an toàn: Giữ nguyên mục tiêu ({reportData.habit_summary.back_on_track?.next_day_target_calories} kcal), không cắt giảm.
              </div>
            </div>
          </div>

          {/* Strengths Badges List */}
          {reportData.strengths && reportData.strengths.length > 0 && (
            <div className="mt-4 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
              <h3 className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-2">
                🌟 Điểm mạnh tích cực trong tháng được ghi nhận:
              </h3>
              <div className="flex flex-wrap gap-2">
                {reportData.strengths.map((str: string, idx: number) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
                    <span>✨</span>
                    <span>{str}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Report View Chart and Table */}
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
