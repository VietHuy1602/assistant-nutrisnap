import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Utensils, Trash2, Clock } from 'lucide-react';
import type { DailyDashboardMeal } from '../../types/api';
import { EstimatedBadge } from '../common/EstimatedBadge';
import { getMealTypeLabel } from '../../constants/copy';
import { formatKcal, formatGram } from '../../utils/format';

interface MealCardProps {
  meal: DailyDashboardMeal;
  onDelete?: (mealId: number) => void;
  className?: string;
}

export const MealCard: React.FC<MealCardProps> = ({ meal, onDelete, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Format giờ hiển thị từ ISO string
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formattedTime = formatTime(meal.logged_at);

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4.5 flex flex-col gap-3 transition-colors hover:border-slate-300 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Ảnh thu nhỏ hoặc biểu tượng bữa ăn */}
          {meal.image_path && !imageError ? (
            <img
              src={meal.image_path}
              alt={meal.meal_type}
              onError={() => setImageError(true)}
              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Utensils className="w-5 h-5" aria-hidden="true" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 text-sm">{getMealTypeLabel(meal.meal_type)}</h4>
              {formattedTime && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  <span>{formattedTime}</span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-0.5">
              {meal.items.length} món ăn
            </p>
          </div>
        </div>

        {/* Năng lượng Calo & Nút mở rộng */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-base font-extrabold text-orange-600">
                {formatKcal(meal.total_calories)}
              </span>
              <span className="text-xs text-slate-400">kcal</span>
            </div>
            <EstimatedBadge size="sm" showIcon={false} />
          </div>

          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(meal.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                aria-label={`Xóa bữa ăn #${meal.id}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Thu gọn chi tiết món' : 'Xem chi tiết món'}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Chi tiết từng món khi mở rộng */}
      {isExpanded && (
        <div className="pt-3 border-t border-slate-100 flex flex-col gap-2 animate-in fade-in">
          {meal.items.map((item, idx) => (
            <div
              key={item.id ?? idx}
              className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-slate-800 truncate">{item.food_name}</span>
                <span className="text-slate-400">({formatGram(item.estimated_gram)})</span>
              </div>
              <span className="font-semibold text-orange-600 shrink-0">
                {formatKcal(item.calories ?? item.estimated_calories ?? 0)} kcal
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
