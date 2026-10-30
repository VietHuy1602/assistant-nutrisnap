import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Utensils, Trash2, Clock } from 'lucide-react';
import type { DailyDashboardMeal, DailyDashboardMealItem } from '../../types/api';
import { EstimatedBadge } from '../common/EstimatedBadge';
import { getMealTypeLabel } from '../../constants/copy';
import { formatKcal, formatGram } from '../../utils/format';
import { FoodSwapModal } from '../FoodSwapModal';

interface MealCardProps {
  meal: DailyDashboardMeal;
  onDelete?: (mealId: number) => void;
  className?: string;
}

export const MealCard: React.FC<MealCardProps> = ({ meal, onDelete, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [simulateItem, setSimulateItem] = useState<DailyDashboardMealItem | null>(null);
  const detailsId = useId();

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
  const mealLabel = `${getMealTypeLabel(meal.meal_type)}${formattedTime ? ` lúc ${formattedTime}` : ''}`;

  return (
    <div
      className={`diary-meal min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col gap-3 transition-colors hover:border-slate-300 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Ảnh thu nhỏ hoặc biểu tượng bữa ăn */}
          {meal.image_path && !imageError ? (
            <img
              src={meal.image_path}
              alt={`Ảnh ${getMealTypeLabel(meal.meal_type).toLocaleLowerCase('vi-VN')}`}
              onError={() => setImageError(true)}
              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Utensils className="w-5 h-5" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-nutri-ink text-base leading-6">{getMealTypeLabel(meal.meal_type)}</h4>
              {formattedTime && (
                <span className="inline-flex items-center gap-1 text-sm tabular-nums text-nutri-muted">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  <span>{formattedTime}</span>
                </span>
              )}
            </div>

            <p className="text-sm text-nutri-muted mt-0.5">
              {meal.items.length} món ăn
            </p>
          </div>
        </div>

        {/* Năng lượng Calo & Nút mở rộng */}
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-xl tabular-nums font-extrabold text-orange-600">
                {formatKcal(meal.total_calories)}
              </span>
              <span className="text-sm text-nutri-muted">kcal</span>
            </div>
            <EstimatedBadge size="sm" showIcon={false} />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(meal.id)}
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl p-2 text-nutri-muted hover:text-nutri-error hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-error focus-visible:ring-offset-2 motion-reduce:transition-none"
                aria-label={`Xóa bữa ăn ${mealLabel} #${meal.id}`}
                title={`Xóa ${mealLabel}`}
                aria-haspopup="dialog"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl p-2 text-nutri-muted hover:text-nutri-ink hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 motion-reduce:transition-none"
              aria-expanded={isExpanded}
              aria-controls={detailsId}
              aria-label={`${isExpanded ? 'Thu gọn' : 'Xem'} chi tiết món: ${mealLabel}`}
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

      {!isExpanded && (
        <p className="break-words text-sm leading-6 text-nutri-muted">
          {meal.items.map(item => item.food_name).join(' · ')}
        </p>
      )}

      <dl aria-label="Dinh dưỡng bữa ăn" className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm min-[390px]:grid-cols-3">
        {([
          ['Đạm', meal.total_protein_g, 'bg-blue-600'],
          ['Tinh bột', meal.total_carbs_g, 'bg-amber-500'],
          ['Chất béo', meal.total_fat_g, 'bg-purple-600'],
        ] as const).map(([label, value, color]) => (
          <div key={label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 min-[390px]:flex-col">
            <dt className="flex items-center gap-1.5 text-nutri-muted"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${color}`} />{label}</dt>
            <dd className="m-0 font-semibold tabular-nums text-nutri-ink">{value == null ? 'Chưa có' : formatGram(value)}</dd>
          </div>
        ))}
      </dl>

      {/* Chi tiết từng món khi mở rộng */}
      {isExpanded && (
        <div id={detailsId} className="pt-3 border-t border-slate-100 flex flex-col gap-3">
          <p className="text-sm leading-6 text-nutri-muted">Món ăn và khẩu phần đã ghi nhận</p>
          {meal.items.map((item, idx) => (
            <div
              key={item.id ?? idx}
              className="flex flex-wrap items-center justify-between rounded-xl bg-slate-50 p-3 text-sm gap-3"
            >
              <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-words font-semibold text-slate-800">{item.food_name}</span>
                <span className="text-nutri-muted">({formatGram(item.estimated_gram)})</span>
              </div>
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSimulateItem(item)}
                  className="inline-flex min-h-12 min-w-12 items-center rounded-lg px-2 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
                  aria-label={`Mô phỏng đổi món cho ${item.food_name}`}
                >
                  Mô phỏng đổi món
                </button>
                <span className="font-semibold text-orange-600 shrink-0">
                  {formatKcal(item.calories ?? item.estimated_calories ?? 0)} kcal
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {simulateItem && (
        <FoodSwapModal
          context="logged"
          foodId={simulateItem.food_id ?? undefined}
          foodName={simulateItem.food_name}
          portionGram={simulateItem.estimated_gram}
          onClose={() => setSimulateItem(null)}
        />
      )}
    </div>
  );
};
