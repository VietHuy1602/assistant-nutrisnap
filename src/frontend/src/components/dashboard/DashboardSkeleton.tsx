import React from 'react';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div
      className="w-full min-w-0 max-w-5xl mx-auto flex flex-col gap-6 animate-pulse motion-reduce:animate-none"
      aria-busy="true"
      aria-label="Đang tải dữ liệu Dashboard..."
      role="status"
    >
      {/* Skeleton Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-6 w-32 bg-slate-200 rounded-lg" />
          <div className="h-4 w-48 bg-slate-100 rounded" />
        </div>
        <div className="h-10 w-40 bg-slate-200 rounded-xl" />
      </div>

      {/* Grid 2 cột cho Desktop: Vòng calo & 3 Macro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Skeleton Calorie Ring */}
        <div className="p-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-4 min-h-[280px]">
          <div className="w-44 h-44 rounded-full border-8 border-slate-200 border-t-slate-300" />
          <div className="h-4 w-36 bg-slate-200 rounded" />
        </div>

        {/* Skeleton Macro Bars */}
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between gap-4 min-h-[280px]">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="flex flex-col gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <div className="h-3.5 w-24 bg-slate-200 rounded" />
                  <div className="h-3.5 w-16 bg-slate-200 rounded" />
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skeleton Meal Timeline */}
      <div className="flex flex-col gap-3 mt-2">
        <div className="h-4 w-40 bg-slate-200 rounded" />
        {[1, 2].map((i) => (
          <div key={i} className="min-h-28 bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-200" />
              <div className="flex flex-col gap-2">
                <div className="h-4 w-28 bg-slate-200 rounded" />
                <div className="h-3 w-16 bg-slate-100 rounded" />
              </div>
            </div>
            <div className="h-6 w-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};
