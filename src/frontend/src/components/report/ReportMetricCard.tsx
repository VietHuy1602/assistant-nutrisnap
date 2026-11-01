/**
 * src/frontend/src/components/report/ReportMetricCard.tsx
 * Thẻ hiển thị chỉ số tổng kết tháng kèm EstimatedBadge cho số liệu dinh dưỡng (M3, M4).
 */

import React from 'react';
import { EstimatedBadge } from '../common/EstimatedBadge';

interface ReportMetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  isEstimated?: boolean;
  /** Màu nhấn của biểu tượng (không dùng đỏ/hồng) */
  accent?: 'emerald' | 'sky' | 'orange' | 'violet' | 'slate';
}

const ACCENTS = {
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  sky: 'bg-sky-50 text-sky-600 ring-sky-200',
  orange: 'bg-orange-50 text-orange-500 ring-orange-200',
  violet: 'bg-violet-50 text-violet-600 ring-violet-200',
  slate: 'bg-slate-50 text-slate-500 ring-slate-200',
};

export const ReportMetricCard: React.FC<ReportMetricCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  isEstimated = false,
  accent = 'slate',
}) => {
  return (
    <div className="min-w-0 bg-white border border-slate-100 rounded-3xl p-4 sm:p-5 shadow-lg shadow-slate-900/5 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs sm:text-sm leading-5 font-semibold text-nutri-muted">{title}</span>
          {icon && <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${ACCENTS[accent]}`}>{icon}</div>}
        </div>
        <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
          <span className="break-words tabular-nums text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">{value}</span>
          {unit && <span className="text-xs sm:text-sm font-semibold text-slate-500">{unit}</span>}
          {isEstimated && <EstimatedBadge size="sm" showIcon={false} className="ml-1" />}
        </div>
      </div>
      {subtitle && <p className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-100">{subtitle}</p>}
    </div>
  );
};
