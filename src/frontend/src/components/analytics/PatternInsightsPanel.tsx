/**
 * src/frontend/src/components/analytics/PatternInsightsPanel.tsx
 * Panel displaying behavioral patterns from analyze_user_patterns endpoint.
 * Zero-Math: Does not compute statistics or days count; strictly renders backend fields.
 * Gracefully informs when < 5 days logged without erroring.
 * ADR-W5-01 & ASC-8 of NS-FE-W5-001.
 */

import React from 'react';
import { Sparkles, CalendarClock, ShieldCheck } from 'lucide-react';
import type { NormalizedPatternInsights } from '../../api/progressContract';
import { PatternInsightCard } from './PatternInsightCard';

interface PatternInsightsPanelProps {
  data: NormalizedPatternInsights | null;
  loading?: boolean;
}

export const PatternInsightsPanel: React.FC<PatternInsightsPanelProps> = ({
  data,
  loading = false,
}) => {
  if (loading) {
    return (
      <section
        role="region"
        aria-label="Đang phân tích thói quen"
        className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs animate-pulse space-y-4"
      >
        <div className="h-5 w-52 bg-slate-200 rounded" />
        <div className="h-24 bg-slate-100 rounded-xl" />
        <div className="h-24 bg-slate-100 rounded-xl" />
      </section>
    );
  }

  const isSufficient = Boolean(data?.isSufficientData && data.patterns.length > 0);
  const loggedDays = data?.loggedDaysCount ?? 0;
  const minDays = data?.minimumRequiredDays ?? 5;

  return (
    <section
      role="region"
      aria-label="Nhận diện thói quen dinh dưỡng"
      className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Nhận diện Thói quen & Xu hướng
          </h3>
        </div>

        {data?.lockedDailyTargetCalories && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mục tiêu an toàn: {data.lockedDailyTargetCalories} kcal</span>
          </span>
        )}
      </div>

      {!isSufficient ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 flex flex-col items-center text-center gap-2 bg-slate-50/50">
          <CalendarClock className="w-8 h-8 text-slate-400 mb-1" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-800">
            Cần thêm dữ liệu ghi chép
          </h4>
          <p className="text-xs text-slate-600 max-w-md">
            {data?.message ||
              `Hệ thống cần tối thiểu ${minDays} ngày ghi chép nhật ký ăn uống để nhận diện thói quen (hiện có ${loggedDays} ngày). Hãy tiếp tục ghi nhận bữa ăn đều đặn nhé!`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {data?.patterns.map((item) => (
            <PatternInsightCard key={item.pattern_code} insight={item} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-600 italic border-t border-slate-100 pt-3">
        {data?.disclaimer ||
          'Nhận định thói quen dựa trên nhật ký bữa ăn nhằm mục đích tham khảo, không thay thế tư vấn y khoa.'}
      </p>
    </section>
  );
};
