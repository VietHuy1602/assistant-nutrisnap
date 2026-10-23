import React from 'react';
import type { NutritionCalculationResult } from '../../types/api';
import { EstimatedBadge } from '../common/EstimatedBadge';
import { formatKcal, formatGram, formatVND } from '../../utils/format';
import { DISCLAIMER_TEXT } from '../../constants/copy';

interface MealTotalsBarProps {
  nutrition: NutritionCalculationResult | null;
  isCalculating: boolean;
  className?: string;
}

export const MealTotalsBar: React.FC<MealTotalsBarProps> = ({
  nutrition,
  isCalculating,
  className = '',
}) => {
  return (
    <div
      className={`p-5 rounded-3xl bg-slate-900 text-white shadow-sm flex flex-col gap-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tổng dinh dưỡng bữa ăn
          </span>
          <EstimatedBadge size="sm" showIcon={false} className="bg-slate-800 text-slate-300 border-slate-700" />
        </div>

        {nutrition && !isCalculating && nutrition.total_estimated_price_vnd > 0 && (
          <span className="text-xs font-medium text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/60">
            Ước tính {formatVND(nutrition.total_estimated_price_vnd)}
          </span>
        )}
      </div>

      {/* Hiển thị Tổng Calo */}
      <div className="flex items-baseline gap-2">
        {isCalculating ? (
          <div className="h-10 w-32 bg-slate-800 rounded-lg animate-pulse" />
        ) : (
          <>
            <span className="text-3xl font-extrabold text-orange-500">
              {formatKcal(nutrition?.total_calories || 0)}
            </span>
            <span className="text-sm font-medium text-slate-400">kcal</span>
          </>
        )}
      </div>

      {/* 3 Chất đa lượng Macro: Đạm (xanh dương), Tinh bột (vàng hổ phách), Chất béo (tím) */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-center">
        {/* Đạm */}
        <div className="flex flex-col items-center p-2 rounded-xl bg-slate-800/50">
          <span className="text-[11px] font-semibold text-blue-400 uppercase">Đạm (Protein)</span>
          {isCalculating ? (
            <div className="h-5 w-12 bg-slate-700 rounded mt-1 animate-pulse" />
          ) : (
            <span className="text-sm font-bold text-white mt-0.5">
              {formatGram(nutrition?.total_protein_g || 0)}
            </span>
          )}
        </div>

        {/* Tinh bột */}
        <div className="flex flex-col items-center p-2 rounded-xl bg-slate-800/50">
          <span className="text-[11px] font-semibold text-amber-400 uppercase">Tinh bột (Carbs)</span>
          {isCalculating ? (
            <div className="h-5 w-12 bg-slate-700 rounded mt-1 animate-pulse" />
          ) : (
            <span className="text-sm font-bold text-white mt-0.5">
              {formatGram(nutrition?.total_carbs_g || 0)}
            </span>
          )}
        </div>

        {/* Chất béo */}
        <div className="flex flex-col items-center p-2 rounded-xl bg-slate-800/50">
          <span className="text-[11px] font-semibold text-purple-400 uppercase">Béo (Fat)</span>
          {isCalculating ? (
            <div className="h-5 w-12 bg-slate-700 rounded mt-1 animate-pulse" />
          ) : (
            <span className="text-sm font-bold text-white mt-0.5">
              {formatGram(nutrition?.total_fat_g || 0)}
            </span>
          )}
        </div>
      </div>

      {/* Tuyên bố miễn trừ trách nhiệm y khoa M4 */}
      <p className="text-[11px] text-slate-400 italic text-center">
        {DISCLAIMER_TEXT}
      </p>
    </div>
  );
};
