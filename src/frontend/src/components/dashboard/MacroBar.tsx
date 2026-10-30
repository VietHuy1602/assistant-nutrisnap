import React from 'react';
import type { MacroDetail } from '../../types/api';
import { formatGram } from '../../utils/format';

interface MacroBarProps {
  macros: {
    protein: MacroDetail;
    carbs: MacroDetail;
    fat: MacroDetail;
  };
  className?: string;
  personalized?: boolean;
}

interface SingleMacroItemProps {
  label: string;
  detail: MacroDetail;
  colorClass: string;
  bgClass: string;
  labelColor: string;
}

const SingleMacroItem: React.FC<SingleMacroItemProps> = ({
  label,
  detail,
  colorClass,
  bgClass,
  labelColor,
}) => {
  const percent = detail.progress_percent ?? (detail.target > 0 ? (detail.consumed / detail.target) * 100 : 0);
  const clampedWidth = Math.min(100, Math.max(0, percent));

  return (
    <div className="macro-item flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={`font-semibold ${labelColor}`}>{label}</span>
        <span className="text-nutri-muted font-medium tabular-nums">
          <strong className="text-slate-800">{formatGram(detail.consumed)}</strong> / {formatGram(detail.target)}
          <span className="ml-1 text-nutri-muted">({Math.round(percent)}%)</span>
        </span>
      </div>

      <div
        className={`w-full h-2.5 rounded-full overflow-hidden ${bgClass}`}
        role="progressbar"
        aria-valuenow={Math.round(detail.consumed)}
        aria-valuemin={0}
        aria-valuemax={Math.round(detail.target)}
        aria-valuetext={`${label}: đã nạp ${formatGram(detail.consumed)} trên ${formatGram(detail.target)} (${Math.round(percent)}%)`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none ${colorClass}`}
          style={{ width: `${clampedWidth}%` }}
        />
      </div>
    </div>
  );
};

export const MacroBar: React.FC<MacroBarProps> = ({ macros, className = '', personalized = true }) => {
  return (
    <div className={`macro-summary p-6 bg-white rounded-3xl border border-slate-200/80 shadow-sm flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Chất đa lượng (Macronutrients)
        </h3>
        <span className="text-sm text-nutri-muted">{personalized ? 'Mục tiêu ngày' : 'Giá trị tham khảo'}</span>
      </div>

      <div className="macro-grid flex flex-col gap-4">
        {/* Đạm / Protein - Màu xanh dương */}
        <SingleMacroItem
          label="Đạm (Protein)"
          detail={macros.protein}
          colorClass="bg-blue-600"
          bgClass="bg-blue-100/60"
          labelColor="text-blue-700"
        />

        {/* Tinh bột / Carbs - Màu vàng hổ phách */}
        <SingleMacroItem
          label="Tinh bột (Carbs)"
          detail={macros.carbs}
          colorClass="bg-amber-500"
          bgClass="bg-amber-100/60"
          labelColor="text-amber-700"
        />

        {/* Chất béo / Fat - Màu tím */}
        <SingleMacroItem
          label="Chất béo (Fat)"
          detail={macros.fat}
          colorClass="bg-purple-600"
          bgClass="bg-purple-100/60"
          labelColor="text-purple-700"
        />
      </div>
    </div>
  );
};
