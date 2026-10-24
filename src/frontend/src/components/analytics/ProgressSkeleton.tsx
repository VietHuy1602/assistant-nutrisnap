/**
 * src/frontend/src/components/analytics/ProgressSkeleton.tsx
 * Fixed-height skeleton matching chart dimensions to prevent layout shifts (CLS < 0.1).
 * ASC-1 of NS-FE-W5-001.
 */

import React from 'react';

interface ProgressSkeletonProps {
  heightClass?: string;
  label?: string;
}

export const ProgressSkeleton: React.FC<ProgressSkeletonProps> = ({
  heightClass = 'h-80',
  label = 'Đang tải biểu đồ…',
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      className={`w-full ${heightClass} rounded-2xl bg-slate-50 border border-slate-200/80 p-5 flex flex-col justify-between animate-pulse`}
    >
      <div className="flex items-center justify-between">
        <div className="h-5 w-40 bg-slate-200 rounded-md" />
        <div className="h-6 w-24 bg-slate-200 rounded-full" />
      </div>

      <div className="space-y-4 my-auto">
        <div className="h-32 w-full bg-slate-100 rounded-xl" />
        <div className="flex justify-between gap-4">
          <div className="h-3 w-12 bg-slate-200 rounded" />
          <div className="h-3 w-12 bg-slate-200 rounded" />
          <div className="h-3 w-12 bg-slate-200 rounded" />
          <div className="h-3 w-12 bg-slate-200 rounded" />
        </div>
      </div>

      <div className="h-4 w-52 bg-slate-200 rounded" />
    </div>
  );
};
