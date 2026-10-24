/**
 * src/frontend/src/components/analytics/TrendStatusChip.tsx
 * Status chip indicating EMA calculation availability (Mode A / Tolerant Reader).
 * ADR-W5-02 & ASC-2 of NS-FE-W5-001.
 */

import React from 'react';
import type { TrendStatus } from '../../utils/trendStatus';
import { Info } from 'lucide-react';

interface TrendStatusChipProps {
  status: TrendStatus;
  className?: string;
}

export const TrendStatusChip: React.FC<TrendStatusChipProps> = ({ status, className = '' }) => {
  if (status === 'available') return null;

  const label =
    status === 'unavailable'
      ? 'Đường xu hướng đang chờ hệ thống tính'
      : 'Một số ngày chưa có xu hướng';

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}
    >
      <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
