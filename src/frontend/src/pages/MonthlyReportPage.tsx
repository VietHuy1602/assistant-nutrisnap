/**
 * src/frontend/src/pages/MonthlyReportPage.tsx
 * Trang Báo cáo Dinh dưỡng & Thói quen Tháng (/reports) theo đặc tả Tuần 6 (Mục 9.2).
 * Tích hợp useMonthlyReport, ReportMetricCard, ReportNotice, LineChart và Bảng chi tiết.
 */

import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Utensils,
  Scale,
  Flame,
  Sparkles,
} from 'lucide-react';
import { WeeklyCaloriesChart } from '../components/analytics/WeeklyCaloriesChart';
import { useMonthlyReport } from '../hooks/useMonthlyReport';
import styles from '../components/report/ReportSurface.module.css';
import { ReportMetricCard } from '../components/report/ReportMetricCard';
import { ReportNotice } from '../components/report/ReportNotice';
import { ExportMenu } from '../components/report/ExportMenu';
import {
  currentMonthKey,
  shiftMonthKey,
  isFutureMonth,
  formatMonthDisplay,
} from '../utils/month';

export function MonthlyEnergyChart({ chartData, monthKey }: {
  chartData: { day: number; date: string; calories: number | null | undefined }[];
  monthKey: string;
}) {
  // Chỉ hiển thị các ngày backend đã có số liệu; không ước tính thêm ngày thiếu dữ liệu.
  const bars = chartData
    .filter((d): d is { day: number; date: string; calories: number } => typeof d.calories === 'number')
    .map((d) => ({ dateKey: d.date, label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`, calories: d.calories, daysLogged: 1 }));
  return (
    <div className="report-chart bg-white border border-slate-100 rounded-3xl p-5 shadow-lg shadow-slate-900/5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800">Năng lượng nạp vào</h2>
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-orange-50 ring-1 ring-orange-200">
          <Flame className="h-5 w-5 text-orange-500" />
        </span>
      </div>
      <p className="text-xs text-slate-400">
        Chỉ hiển thị ngày đã ghi nhận bữa ăn trong tháng {monthKey.slice(5)}/{monthKey.slice(0, 4)}. Ngày thiếu dữ liệu không được ước tính thêm.
      </p>
      <WeeklyCaloriesChart
        data={{ bars, targetCalories: null, mode: 'dailyFallback', warnings: [] }}
        ariaLabel={`Biểu đồ tròn năng lượng theo ngày trong tháng, ${bars.length} ngày có dữ liệu`}
        hideModeNote
      />
    </div>
  );
}

export const MonthlyReportPage: React.FC = () => {
  const currentKey = currentMonthKey();
  const { report, loadState, errorMessage, monthKey, setMonthKey, refetch, isFuture } =
    useMonthlyReport(currentKey);

  const prevMonthKey = shiftMonthKey(monthKey, -1);
  const nextMonthKey = shiftMonthKey(monthKey, 1);
  const canGoNext = !isFutureMonth(nextMonthKey, currentKey);


  const chartData = (report?.days || [])
    .filter((d) => d.state === 'available' && typeof d.calories === 'number')
    .map((d) => ({
      day: parseInt(d.date.slice(8), 10),
      date: d.date,
      calories: d.calories,
    }));

  return (
    <div
      id="monthly-report-printable-area"
      className={`${styles.reports} nutri-monthly-report space-y-6 max-w-6xl mx-auto px-4 sm:px-6 py-4`}
    >
      {/* Top Header & Month Navigation */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Báo cáo {formatMonthDisplay(monthKey)}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Tổng kết dinh dưỡng, cân nặng và thói quen theo tháng · giờ Việt Nam.
          </p>
        </div>

        {/* Controls: Month navigation & Export Buttons */}
        <div className="report-controls flex flex-wrap items-center gap-2">
          {/* Month Switcher */}
          <div role="group" aria-label="Chọn tháng báo cáo" className="flex max-w-full items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              type="button"
              aria-label="Tháng trước"
              onClick={() => setMonthKey(prevMonthKey)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span aria-live="polite" className="px-2 text-sm tabular-nums font-bold text-slate-700 min-w-0 text-center">
              {formatMonthDisplay(monthKey)}
            </span>
            <button
              type="button"
              aria-label="Tháng sau"
              disabled={!canGoNext}
              onClick={() => canGoNext && setMonthKey(nextMonthKey)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Export Menu */}
          {report && <ExportMenu report={report} disabled={loadState !== 'ready'} />}
        </div>
      </header>

      {/* State: Future Month */}
      {isFuture && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 space-y-2">
          <p className="font-bold text-slate-800">Tháng tương lai chưa có báo cáo</p>
          <p className="text-xs text-slate-500">
            Bạn vui lòng chọn tháng hiện tại hoặc các tháng trước để xem tổng kết.
          </p>
        </div>
      )}

      {/* State: Insufficient Data (ADR-W6-10) */}
      {!isFuture && loadState === 'insufficient' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center text-amber-900 space-y-2">
          <p className="text-base font-bold">Chưa đủ dữ liệu để tổng kết tháng này.</p>
          <p className="text-xs text-amber-800 max-w-md mx-auto">
            Hệ thống cần ít nhất một số ngày có nhật ký bữa ăn hoặc bản ghi cân nặng để tính toán
            các chỉ số trung bình đáng tin cậy. Hãy tiếp tục ghi nhận nhé!
          </p>
        </div>
      )}

      {/* State: Error */}
      {!isFuture && loadState === 'error' && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800 space-y-3">
          <p className="font-semibold text-sm">
            {errorMessage || 'Không tải được báo cáo tháng.'}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* State: Loading */}
      {!isFuture && loadState === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-slate-500 space-y-2"
        >
          <div className="w-6 h-6 border-2 border-nutri-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium">Đang tổng hợp báo cáo tháng…</p>
        </div>
      )}

      {/* State: Ready Data Display */}
      {!isFuture && (loadState === 'ready' || (loadState === 'loading' && report)) && report && (
        <>
          {/* Metrics 4-Column Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <ReportMetricCard
              title="Số ngày có nhật ký"
              value={report.loggingSummary.totalLoggedDays}
              unit="ngày"
              subtitle={`Tổng số ${report.loggingSummary.totalMealsLogged} bữa ăn đã lưu`}
              icon={<Utensils className="w-4 h-4" />}
              accent="emerald"
            />

            <ReportMetricCard
              title="Cân nặng biến động"
              value={
                typeof report.weightSummary.rawWeightChangeKg === 'number'
                  ? `${report.weightSummary.rawWeightChangeKg > 0 ? '+' : ''}${report.weightSummary.rawWeightChangeKg}`
                  : 'Chưa có'
              }
              unit={typeof report.weightSummary.rawWeightChangeKg === 'number' ? 'kg' : undefined}
              subtitle={
                typeof report.weightSummary.startWeightKg === 'number' && typeof report.weightSummary.endWeightKg === 'number'
                  ? `${report.weightSummary.startWeightKg} kg → ${report.weightSummary.endWeightKg} kg`
                  : 'Chưa có đủ số lần đo'
              }
              icon={<Scale className="w-4 h-4" />}
              accent="sky"
            />

            <ReportMetricCard
              title="Calo trung bình / ngày"
              value={report.nutritionSummary.avgDailyCalories ?? 'Chưa có'}
              unit={report.nutritionSummary.avgDailyCalories !== null ? 'kcal' : undefined}
              subtitle={`Mục tiêu: ${report.nutritionSummary.targetTdeeCalories || 2000} kcal`}
              icon={<Flame className="w-4 h-4" />}
              accent="orange"
              isEstimated={true}
            />

            <ReportMetricCard
              title="Tỷ lệ duy trì thói quen"
              value={`${report.loggingSummary.consistencyRatePct}%`}
              subtitle={`Trong chu kỳ ${report.loggingSummary.periodDays} ngày`}
              icon={<Calendar className="w-4 h-4" />}
              accent="violet"
            />
          </div>

          {/* Positive Strengths Badges */}
          {report.strengths.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-lg shadow-slate-900/5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-800">Điểm mạnh tích cực</h2>
                <span aria-hidden="true" className="text-xl">🎉</span>
              </div>
              <ul className="space-y-2">
                {report.strengths.map((str, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-lime-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900"
                  >
                    <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Daily Trend Chart */}
          {chartData.length > 0 && (
            <MonthlyEnergyChart chartData={chartData} monthKey={monthKey} />
          )}

          {/* 3 Fixed Transparent Notices */}
          <ReportNotice />
        </>
      )}
    </div>
  );
};

export default MonthlyReportPage;
