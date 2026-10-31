import React, { useState } from 'react';
import { Trash2, AlertCircle, Edit2, CheckCircle2 } from 'lucide-react';
import type { DraftMealItem } from './mealDraftReducer';
import type { CalculatedMealItem, FoodReferenceItem } from '../../types/api';
import { FoodSearchCombobox } from './FoodSearchCombobox';
import { EstimatedBadge } from '../common/EstimatedBadge';
import { formatKcal } from '../../utils/format';

interface MealItemRowProps {
  item: DraftMealItem;
  calculatedItem?: CalculatedMealItem;
  onSetGram: (gram: number) => void;
  onSwapFood: (food: FoodReferenceItem) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export const MealItemRow: React.FC<MealItemRowProps> = ({
  item,
  calculatedItem,
  onSetGram,
  onSwapFood,
  onRemove,
  disabled = false,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);

  const isUnlinked = item.food_id === null || item.food_id === undefined;
  const isLowConfidence =
    item.source === 'ai' && typeof item.confidence === 'number' && item.confidence < 0.6;

  const handleGramChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (Number.isNaN(val)) {
      onSetGram(0);
    } else {
      onSetGram(val);
    }
  };

  return (
    <div className="flex flex-col p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm gap-3 hover:border-slate-300 transition-colors">
      {/* Hàng trên: Tên món ăn và các huy hiệu trạng thái */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="mt-1">
              <FoodSearchCombobox
                onSelect={(food) => {
                  onSwapFood(food);
                  setIsEditingName(false);
                }}
                onClose={() => setIsEditingName(false)}
                placeholder="Chọn món thay thế trong CSDL..."
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => !disabled && setIsEditingName(true)}
                disabled={disabled}
                className="group inline-flex items-center gap-1.5 text-base font-semibold text-slate-800 hover:text-emerald-700 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
                title="Nhấn để đổi tên hoặc chọn món khác trong CSDL"
              >
                <span className="break-words">{item.food_name}</span>
                <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" aria-hidden="true" />
              </button>

              {/* Huy hiệu cảnh báo độ tin cậy thấp hoặc chưa khớp CSDL */}
              {isUnlinked && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <AlertCircle className="w-3 h-3 text-amber-500" aria-hidden="true" />
                  <span>Chưa khớp CSDL</span>
                </span>
              )}

              {item.nutrition_source === 'usda' && !isUnlinked && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200"
                  title="Dinh dưỡng lấy từ bảng chuẩn USDA FoodData Central"
                >
                  <span>Số liệu USDA</span>
                </span>
              )}

              {item.nutrition_source === 'ai_estimate' && !isUnlinked && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200"
                  title="Món chưa có trong CSDL chuẩn; dinh dưỡng do AI ước tính và đã được thêm vào CSDL"
                >
                  <span>Dinh dưỡng AI ước tính</span>
                </span>
              )}

              {isLowConfidence && !isUnlinked && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                  <span>Cần kiểm tra</span>
                </span>
              )}

              {item.source === 'ai' && !isUnlinked && !isLowConfidence && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                  <span>AI nhận diện</span>
                </span>
              )}
            </div>
          )}

          {item.matched_name && item.matched_name !== item.food_name && !isEditingName && (
            <p className="mt-0.5 text-xs text-slate-400">
              Khớp CSDL: <span className="font-medium text-slate-600">{item.matched_name}</span>
            </p>
          )}
        </div>

        {/* Nút xóa món */}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          aria-label={`Xóa món ${item.food_name}`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Hàng dưới: Điều chỉnh khối lượng (gam) và hiển thị Calo ước tính */}
      <div className="capture-item-controls flex items-center justify-between pt-2 border-t border-slate-100 text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor={`gram-input-${item.key}`} className="text-xs text-slate-500 font-medium">
            Khối lượng:
          </label>
          <div className="relative inline-flex items-center">
            <input
              id={`gram-input-${item.key}`}
              type="number"
              min="1"
              max="3000"
              step="5"
              inputMode="decimal"
              disabled={disabled}
              value={item.estimated_gram || ''}
              onChange={handleGramChange}
              className="w-24 px-2.5 py-1 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
            <span className="ml-1.5 text-xs text-slate-500 font-medium">g</span>
          </div>
        </div>

        {/* Năng lượng Calo tính toán bởi Backend */}
        <div className="flex items-center gap-1.5">
          {calculatedItem ? (
            <div className="flex items-baseline gap-1">
              <span className="text-base font-bold text-orange-600">
                {formatKcal(calculatedItem.calories)}
              </span>
              <span className="text-xs text-slate-400 font-normal">kcal</span>
              <EstimatedBadge size="sm" showIcon={false} className="ml-1" />
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">Đang tính...</span>
          )}
        </div>
      </div>
    </div>
  );
};
