/**
 * src/frontend/src/components/dashboard/DashboardWeightTrend.tsx
 * Xu hướng cân nặng (chuyển từ trang Tiến độ cũ lên Tổng quan): chọn khoảng ngày, biểu đồ + EMA,
 * xem dạng bảng, ẩn số cân nặng và ghi nhận cân nặng mới.
 */

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Scale, X } from 'lucide-react';
import { RangeSelector } from '../analytics/RangeSelector';
import { TrendStatusChip } from '../analytics/TrendStatusChip';
import { WeightTrendChart } from '../analytics/WeightTrendChart';
import { ChartDataTable } from '../analytics/ChartDataTable';
import { ChartCard } from '../analytics/ChartCard';
import { ProgressSkeleton } from '../analytics/ProgressSkeleton';
import { progressApi } from '../../api/progressApi';
import type { useProgressAnalytics } from '../../hooks/useProgressAnalytics';

type Analytics = ReturnType<typeof useProgressAnalytics>;

export const DashboardWeightTrend: React.FC<{ analytics: Analytics }> = ({ analytics }) => {
  const { rangeDays, setRangeDays, weightData, weightStatus, trendStatus, refetch } = analytics;
  const [masked, setMasked] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loading = weightStatus === 'loading' && !weightData;
  const [kcal, setKcal] = useState<Array<{ date: string; calories: number }>>([]);

  // Calo đã nạp mỗi ngày theo đúng khoảng 7/14/30/90 ngày đang chọn
  useEffect(() => {
    const ctl = new AbortController();
    progressApi.getDailyCalories(rangeDays, ctl.signal).then(setKcal).catch(() => { if (!ctl.signal.aborted) setKcal([]); });
    return () => ctl.abort();
  }, [rangeDays, weightData]);

  const close = () => {
    if (!saving) {
      setOpen(false);
      setError(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const kg = parseFloat(input);
    if (Number.isNaN(kg) || kg < 30 || kg > 300) {
      setError('Vui lòng nhập cân nặng hợp lệ (từ 30 kg đến 300 kg).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await progressApi.logWeight(kg);
      setOpen(false);
      refetch();
    } catch {
      setError('Không thể lưu cân nặng vào lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Xu hướng cân nặng" className="space-y-3">
      <RangeSelector value={rangeDays} onChange={setRangeDays} disabled={loading} />
      {loading ? (
        <ProgressSkeleton label="Đang tải dữ liệu cân nặng…" />
      ) : (
        <ChartCard
          title="Xu hướng Cân nặng"
          chip={<TrendStatusChip status={trendStatus} />}
          disclaimer="Đường xanh là cân nặng ghi nhận; số dưới trục là calo đã nạp trong ngày. Chạm vào từng ngày để xem chi tiết. Tham khảo chuyên gia y tế khi cần tư vấn chuyên sâu."
          tableComponent={<ChartDataTable type="weight" points={weightData?.points ?? []} masked={masked} />}
        >
          <WeightTrendChart points={weightData?.points ?? []} status={trendStatus} masked={masked} calories={kcal} />
        </ChartCard>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setInput(''); setError(null); setOpen(true); }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Ghi nhận cân nặng
        </button>
        <button
          type="button"
          onClick={() => setMasked((m) => !m)}
          aria-pressed={masked}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 text-xs font-semibold ${masked ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
        >
          {masked ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          {masked ? 'Hiện số cân nặng' : 'Ẩn số cân nặng'}
        </button>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="log-weight-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 id="log-weight-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-800"><Scale className="h-4 w-4" aria-hidden="true" /></span>
                Ghi nhận cân nặng
              </h3>
              <button type="button" onClick={close} disabled={saving} aria-label="Đóng hộp thoại" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submit} noValidate className="space-y-4">
              <label htmlFor="dash-weight-input" className="block text-xs font-semibold text-slate-700">Cân nặng thực tế (kg)</label>
              <input
                id="dash-weight-input"
                type="number"
                step="0.1"
                min="30"
                max="300"
                placeholder="Ví dụ: 68.5"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                disabled={saving}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {error && <p role="alert" className="text-xs font-medium text-amber-800">{error}</p>}
              <div className="flex justify-end gap-2.5">
                <button type="button" onClick={close} disabled={saving} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Hủy</button>
                <button type="submit" disabled={saving || !input} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {saving ? 'Đang lưu…' : 'Lưu cân nặng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
