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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ReportMetricCard
              title="Số ngày có nhật ký"
              value={report.loggingSummary.totalLoggedDays}
              unit="ngày"
              subtitle={`Tổng số ${report.loggingSummary.totalMealsLogged} bữa ăn đã lưu`}
              icon={<Utensils className="w-4 h-4" />}
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
            />

            <ReportMetricCard
              title="Calo trung bình / ngày"
              value={report.nutritionSummary.avgDailyCalories ?? 'Chưa có'}
              unit={report.nutritionSummary.avgDailyCalories !== null ? 'kcal' : undefined}
              subtitle={`Mục tiêu: ${report.nutritionSummary.targetTdeeCalories || 2000} kcal`}
              icon={<Flame className="w-4 h-4" />}
              isEstimated={true}
            />

            <ReportMetricCard
              title="Tỷ lệ duy trì thói quen"
              value={`${report.loggingSummary.consistencyRatePct}%`}
              subtitle={`Trong chu kỳ ${report.loggingSummary.periodDays} ngày`}
              icon={<Calendar className="w-4 h-4" />}
            />
          </div>

          {/* Positive Strengths Badges */}
          {report.strengths.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Điểm mạnh tích cực được ghi nhận trong tháng:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.strengths.map((str, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900"
                  >
                    <span>✨</span>
                    <span>{str}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Daily Trend Chart */}
          {chartData.length > 0 && (
            <div className="report-chart bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-800">
                Xu hướng Năng lượng các ngày trong tháng (kcal)
              </h2>
              <p className="text-xs text-slate-400">
                Chỉ hiển thị ngày đã ghi nhận bữa ăn. Ngày thiếu dữ liệu không được ước tính thêm.
              </p>
              <div className="h-64 w-full pt-4 min-w-0" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(val) => `N${val}`}
                      stroke="#475569"
                      fontSize={13}
                    />
                    <YAxis stroke="#475569" fontSize={13} width={52} />
                    <Tooltip
                      formatter={(val: number) => [`${val} kcal`, 'Năng lượng']}
                      labelFormatter={(label) => `Ngày ${label}/${monthKey.slice(5)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="calories"
                      stroke="#107C41"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#107C41' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 3 Fixed Transparent Notices */}
          <ReportNotice />
        </>
      )}
    </div>
  );
};

export default MonthlyReportPage;
