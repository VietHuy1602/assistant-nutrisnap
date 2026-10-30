/**
 * src/frontend/src/components/analytics/RangeSelector.tsx
 * Segmented control for choosing progress analytics time range (7, 14, 30, 90 days).
 * Accessible radiogroup, keyboard navigable, touch target >= 40px.
 * ASC-4 & ASC-7 of NS-FE-W5-001.
 */

import React from 'react';

const RANGES = [
  { value: 7, label: '7 ngày' },
  { value: 14, label: '14 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
] as const;

interface RangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
  disabled?: boolean;
}

export const RangeSelector: React.FC<RangeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div
      role="radiogroup"
      aria-label="Chọn khoảng thời gian theo dõi"
      className="grid w-full min-w-0 grid-cols-2 min-[390px]:grid-cols-4 sm:w-auto gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
    >
      {RANGES.map((r) => {
        const isSelected = value === r.value;
        return (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(r.value)}
            className={`min-h-12 min-w-12 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 ${
              isSelected
                ? 'bg-white text-emerald-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            } disabled:opacity-50`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
};
