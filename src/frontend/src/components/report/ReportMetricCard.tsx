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
}

export const ReportMetricCard: React.FC<ReportMetricCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  isEstimated = false,
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold tracking-wider text-slate-500">{title}</span>
          {icon && <div className="text-slate-400">{icon}</div>}
        </div>
        <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{value}</span>
          {unit && <span className="text-xs sm:text-sm font-semibold text-slate-500">{unit}</span>}
          {isEstimated && <EstimatedBadge size="sm" showIcon={false} className="ml-1" />}
        </div>
      </div>
      {subtitle && <p className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-100">{subtitle}</p>}
    </div>
  );
};
