/**
 * src/frontend/src/pages/ProgressAnalyticsPage.tsx
 * Progress Analytics & Health Trend Dashboard.
 * Dual Line Weight Trend (Mode A / Tolerant Reader), Weekly Calories (Daily Fallback),
 * Behavioral Pattern Insights, Privacy Masking, and Range Selection.
 * ZERO-MATH compliant: All metrics, changes, and insights originate from backend.
 * ADR-W5-01, ADR-W5-02, ADR-W5-03, ADR-W5-08 & ASC-1 through ASC-8 of NS-FE-W5-001.
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  AlertTriangle,
  X,
  Scale,
} from 'lucide-react';
import { useProgressAnalytics } from '../hooks/useProgressAnalytics';
import { RangeSelector } from '../components/analytics/RangeSelector';
import { TrendStatusChip } from '../components/analytics/TrendStatusChip';
import { WeightTrendChart } from '../components/analytics/WeightTrendChart';
import { WeeklyCaloriesChart } from '../components/analytics/WeeklyCaloriesChart';
import { ChartDataTable } from '../components/analytics/ChartDataTable';
import { ChartCard } from '../components/analytics/ChartCard';
import { PatternInsightsPanel } from '../components/analytics/PatternInsightsPanel';
import { ProgressSkeleton } from '../components/analytics/ProgressSkeleton';
import { progressApi } from '../api/progressApi';

export const ProgressAnalyticsPage: React.FC = () => {
  const [masked, setMasked] = useState<boolean>(false);

  // Weight logging modal state (React state only, zero client storage)
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [inputWeight, setInputWeight] = useState<string>('');
  const [logError, setLogError] = useState<string | null>(null);
  const [isSubmittingWeight, setIsSubmittingWeight] = useState<boolean>(false);

  const {
    rangeDays,
    setRangeDays,
    weightData,
    weightStatus,
    trendStatus: currentTrendStatus,
    caloriesData,
    caloriesStatus,
    insightsData,
    insightsStatus,
    isRefreshing,
    weightError,
    caloriesError,
    insightsError,
    refetch,
  } = useProgressAnalytics(14);

  const isLoading =
    (weightStatus === 'loading' && !weightData) ||
    (caloriesStatus === 'loading' && !caloriesData);
  const generalError = weightError || caloriesError || insightsError;

  // Performance telemetry marker for Lazy Progress chunk
  useEffect(() => {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark('ns:progress:load');
    }
  }, []);

  const handleOpenLogModal = () => {
    setInputWeight('');
    setLogError(null);
    setIsLogModalOpen(true);
  };

  const handleCloseLogModal = () => {
    if (!isSubmittingWeight) {
      setIsLogModalOpen(false);
      setLogError(null);
    }
  };

  const handleSubmitWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightNum = parseFloat(inputWeight);
    if (Number.isNaN(weightNum) || weightNum <= 0 || weightNum > 300) {
      setLogError('Vui lòng nhập cân nặng hợp lệ (từ 30 kg đến 300 kg).');
      return;
    }

    setIsSubmittingWeight(true);
    setLogError(null);
    try {
      await progressApi.logWeight(weightNum);
      setIsLogModalOpen(false);
      refetch();
    } catch (err: unknown) {
      setLogError(
        'Không thể lưu cân nặng vào lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.',
      );
    } finally {
      setIsSubmittingWeight(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 space-y-6">
      {/* Header section */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800">
              <TrendingUp className="w-5 h-5" aria-hidden="true" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Tiến độ & Xu hướng
            </h1>
            {isRefreshing && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 animate-pulse"
              >
                <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
                <span>Đang cập nhật…</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Theo dõi tiến trình cân nặng và năng lượng dinh dưỡng theo thời gian
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Privacy Mask Toggle (in-memory state only) */}
          <button
            type="button"
            onClick={() => setMasked((prev) => !prev)}
            aria-pressed={masked}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              masked
                ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {masked ? (
              <>
                <Eye className="w-4 h-4" aria-hidden="true" />
                <span>Hiện số cân nặng</span>
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" aria-hidden="true" />
                <span>Ẩn số cân nặng</span>
              </>
            )}
          </button>

          {/* Log weight action */}
          <button
            type="button"
            onClick={handleOpenLogModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Ghi nhận cân nặng</span>
          </button>
        </div>
      </header>

      {/* Range controls & status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeSelector value={rangeDays} onChange={setRangeDays} disabled={isLoading} />
        <TrendStatusChip status={currentTrendStatus} />
      </div>

      {/* Error state banner */}
      {generalError && (
        <div
          role="alert"
          className="rounded-2xl p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>{generalError}</span>
          </div>
          <button
            type="button"
            onClick={refetch}
            className="font-bold underline hover:text-amber-950 focus-visible:outline-none"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Main Charts & Analytics Body */}
      {isLoading && !weightData ? (
        <div className="grid grid-cols-1 gap-6">
          <ProgressSkeleton label="Đang tải dữ liệu tiến độ…" />
          <ProgressSkeleton label="Đang tải năng lượng nạp…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Chart 1: Dual Line Weight Trend */}
          <ChartCard
            title="Xu hướng Cân nặng"
            chip={<TrendStatusChip status={currentTrendStatus} />}
            disclaimer="Đường xu hướng EMA làm mịn biến động cân nặng tự nhiên hàng ngày. Tham khảo chuyên gia y tế khi cần tư vấn chuyên sâu."
            tableComponent={
              <ChartDataTable
                type="weight"
                points={weightData?.points ?? []}
                masked={masked}
              />
            }
          >
            <WeightTrendChart
              points={weightData?.points ?? []}
              status={currentTrendStatus}
              masked={masked}
            />
          </ChartCard>

          {/* Chart 2: Weekly / Daily Calories */}
          <ChartCard
            title="Năng lượng nạp vào"
            disclaimer="Hạn mức năng lượng khuyến nghị dựa trên mục tiêu dinh dưỡng hiện tại."
            tableComponent={
              <ChartDataTable
                type="calories"
                bars={caloriesData?.bars ?? []}
              />
            }
          >
            <WeeklyCaloriesChart
              data={
                caloriesData ?? {
                  bars: [],
                  targetCalories: null,
                  mode: 'dailyFallback',
                  warnings: [],
                }
              }
            />
          </ChartCard>

          {/* Pattern Insights Panel */}
          <PatternInsightsPanel
            data={insightsData}
            loading={isLoading || insightsStatus === 'loading'}
          />
        </div>
      )}

      {/* Log Weight Dialog Modal */}
      {isLogModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-weight-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
                  <Scale className="w-4 h-4" aria-hidden="true" />
                </div>
                <h3 id="log-weight-dialog-title" className="text-base font-bold text-slate-900">
                  Ghi nhận cân nặng
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseLogModal}
                disabled={isSubmittingWeight}
                aria-label="Đóng hộp thoại"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitWeight} noValidate className="space-y-4">
              <div>
                <label htmlFor="weight-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cân nặng thực tế (kg)
                </label>
                <div className="relative">
                  <input
                    id="weight-input"
                    type="number"
                    step="0.1"
                    min="30"
                    max="300"
                    placeholder="Ví dụ: 68.5"
                    value={inputWeight}
                    onChange={(e) => setInputWeight(e.target.value)}
                    required
                    autoFocus
                    disabled={isSubmittingWeight}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-400">
                    kg
                  </span>
                </div>
              </div>

              {logError && (
                <p role="alert" className="text-xs text-amber-800 font-medium">
                  {logError}
                </p>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleCloseLogModal}
                  disabled={isSubmittingWeight}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWeight || !inputWeight}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {isSubmittingWeight ? 'Đang lưu…' : 'Lưu cân nặng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressAnalyticsPage;
