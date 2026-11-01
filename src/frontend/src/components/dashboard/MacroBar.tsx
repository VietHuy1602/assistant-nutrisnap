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
  color: string;
  trackColor: string;
  labelColor: string;
}

const MACRO_R = 30;
const MACRO_CIRCUMFERENCE = 2 * Math.PI * MACRO_R;

const SingleMacroItem: React.FC<SingleMacroItemProps> = ({
  label,
  detail,
  color,
  trackColor,
  labelColor,
}) => {
  const percent = detail.progress_percent ?? (detail.target > 0 ? (detail.consumed / detail.target) * 100 : 0);
  const clampedWidth = Math.min(100, Math.max(0, percent));

  return (
    <div className="macro-item flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={`font-semibold ${labelColor}`}>{label}</span>
      </div>

      <div
        className="macro-ring relative mx-auto my-1 grid h-20 w-20 place-items-center"
        role="progressbar"
        aria-valuenow={Math.round(detail.consumed)}
        aria-valuemin={0}
        aria-valuemax={Math.round(detail.target)}
        aria-valuetext={`${label}: đã nạp ${formatGram(detail.consumed)} trên ${formatGram(detail.target)} (${Math.round(percent)}%)`}
      >
        <svg aria-hidden="true" viewBox="0 0 76 76" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="38" cy="38" r={MACRO_R} fill="none" stroke={trackColor} strokeWidth="8" />
          <circle
            cx="38"
            cy="38"
            r={MACRO_R}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={MACRO_CIRCUMFERENCE}
            strokeDashoffset={MACRO_CIRCUMFERENCE * (1 - clampedWidth / 100)}
            className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          />
        </svg>
        <strong className="relative text-base font-bold tabular-nums text-slate-800">{formatGram(detail.consumed)}</strong>
      </div>

      <span className="macro-values text-center text-nutri-muted font-medium tabular-nums">
        <span className="macro-target">/ {formatGram(detail.target)}</span>
        <span className="macro-percent text-nutri-muted">({Math.round(percent)}%)</span>
      </span>
    </div>
  );
};

export const MacroBar: React.FC<MacroBarProps> = ({ macros, className = '', personalized = true }) => {
  return (
    <div className={`macro-summary p-6 bg-white rounded-3xl border border-slate-200/80 shadow-sm flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Dinh dưỡng
        </h3>
        <span className="text-sm text-nutri-muted">{personalized ? 'Mục tiêu ngày' : 'Giá trị tham khảo'}</span>
      </div>

      <div className="macro-grid flex flex-col gap-4">
        {/* Đạm / Protein - Màu xanh dương */}
        <SingleMacroItem
          label="Đạm"
          detail={macros.protein}
          color="#2563EB"
          trackColor="#DBEAFE"
          labelColor="text-blue-700"
        />

        {/* Tinh bột / Carbs - Màu vàng hổ phách */}
        <SingleMacroItem
          label="Tinh bột"
          detail={macros.carbs}
          color="#F59E0B"
          trackColor="#FEF3C7"
          labelColor="text-amber-700"
        />

        {/* Chất béo / Fat - Màu tím */}
        <SingleMacroItem
          label="Chất béo"
          detail={macros.fat}
          color="#9333EA"
          trackColor="#F3E8FF"
          labelColor="text-purple-700"
        />
      </div>
    </div>
  );
};
