/**
 * src/frontend/src/components/goal/GoalResultSkeleton.tsx
 * Skeleton loading placeholder cho bảng kết quả dinh dưỡng GoalResultPanel (SAC-11).
 * Thiết kế khớp chính xác 7 khối thẻ (TDEE, BMR, Calo, Protein, Carbs, Fat, Ngân sách)
 * để đảm bảo không nhảy bố cục (CLS ≈ 0).
 */

import React from 'react';

export const GoalResultSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="Đang tính toán và tải kết quả dinh dưỡng"
      className="space-y-8 animate-pulse"
    >
      {/* Header Skeleton */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-slate-200 mx-auto" />
        <div className="h-7 w-64 bg-slate-200 rounded-lg mx-auto" />
        <div className="h-4 w-96 max-w-full bg-slate-200 rounded mx-auto" />
      </div>

      {/* Thẻ 1: TDEE Skeleton */}
      <div className="p-6 rounded-2xl bg-emerald-50/60 border-2 border-emerald-200/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-5 w-28 bg-emerald-200/80 rounded-full" />
            <div className="h-6 w-72 bg-emerald-200/80 rounded-lg" />
            <div className="h-4 w-48 bg-emerald-200/60 rounded" />
          </div>
          <div className="h-12 w-36 bg-emerald-300/80 rounded-xl" />
        </div>
      </div>

      {/* Thẻ 2 & 3: BMR & Hạn mức Calo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="h-4 w-40 bg-slate-200 rounded" />
          <div className="h-8 w-28 bg-slate-200 rounded-lg" />
          <div className="h-3 w-56 bg-slate-200 rounded" />
        </div>
        <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/40 space-y-3">
          <div className="h-4 w-40 bg-orange-200 rounded" />
          <div className="h-8 w-28 bg-orange-200 rounded-lg" />
          <div className="h-3 w-56 bg-orange-200 rounded" />
        </div>
      </div>

      {/* Thẻ 4, 5, 6: Macro Bộ 3 (Protein, Carbs, Fat) */}
      <div className="space-y-3">
        <div className="h-4 w-60 bg-slate-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
            <div className="h-3 w-24 bg-blue-200 rounded" />
            <div className="h-8 w-20 bg-blue-200 rounded-lg" />
            <div className="h-3 w-32 bg-blue-200 rounded" />
          </div>
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
            <div className="h-3 w-24 bg-amber-200 rounded" />
            <div className="h-8 w-20 bg-amber-200 rounded-lg" />
            <div className="h-3 w-32 bg-amber-200 rounded" />
          </div>
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-2">
            <div className="h-3 w-24 bg-purple-200 rounded" />
            <div className="h-8 w-20 bg-purple-200 rounded-lg" />
            <div className="h-3 w-32 bg-purple-200 rounded" />
          </div>
        </div>
      </div>

      {/* Thẻ 7: Ngân sách */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-200" />
          <div className="space-y-1">
            <div className="h-3.5 w-36 bg-slate-200 rounded" />
            <div className="h-3 w-48 bg-slate-200 rounded" />
          </div>
        </div>
        <div className="h-6 w-24 bg-slate-200 rounded-lg" />
      </div>

      {/* Disclaimer Skeleton */}
      <div className="p-3 bg-slate-100 rounded-xl flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-slate-300" />
        <div className="h-3 w-3/4 bg-slate-300 rounded" />
      </div>

      {/* Buttons Skeleton */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="h-10 w-36 bg-slate-200 rounded-xl" />
        <div className="h-10 w-44 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
};
