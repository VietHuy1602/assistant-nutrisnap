import React from 'react';
import { Camera, ArrowRight, Trash2 } from 'lucide-react';
import { FoodSearchCombobox } from './FoodSearchCombobox';
import type { DraftMealItem, MealDraftAction } from './mealDraftReducer';
import type { FoodReferenceItem } from '../../types/api';
import { MEAL_TYPES } from '../../constants/copy';

interface ManualEntryPanelProps {
  mealType: string;
  items: DraftMealItem[];
  dispatch: React.Dispatch<MealDraftAction>;
  onProceedToReview: () => void;
  onSwitchToCamera: () => void;
  reason?: string;
  className?: string;
}

export const ManualEntryPanel: React.FC<ManualEntryPanelProps> = ({
  mealType,
  items,
  dispatch,
  onProceedToReview,
  onSwitchToCamera,
  reason,
  className = '',
}) => {
  const handleSelectFood = (food: FoodReferenceItem) => {
    dispatch({ type: 'ADD_ITEM', food });
  };

  return (
    <div
      className={`w-full max-w-xl mx-auto p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6 ${className}`}
    >
      <div className="capture-entry-heading flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Nhập món ăn thủ công</h2>
          <p className="text-xs text-slate-500">
            {reason || 'Tìm món ăn, chọn khẩu phần rồi kiểm tra trước khi lưu.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onSwitchToCamera}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
        >
          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Dùng máy ảnh</span>
        </button>
      </div>

      {/* Chọn loại bữa */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
          Bữa ăn
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MEAL_TYPES.map((type) => {
            const isSelected = mealType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => dispatch({ type: 'SET_MEAL_TYPE', mealType: type.id })}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ô tìm kiếm món ăn */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
          Tìm kiếm món ăn
        </label>
        <FoodSearchCombobox
          onSelect={handleSelectFood}
          placeholder="Nhập tên món (ví dụ: Phở bò tái, Cơm tấm sườn, Canh chua)..."
        />
      </div>

      {/* Danh sách các món đã chọn trong lúc nhập thủ công */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-700">Các món đã chọn ({items.length}):</p>
          <div className="divide-y divide-slate-100">
            {items.map((it) => (
              <div key={it.key} className="capture-item-controls flex items-center justify-between py-2 text-sm">
                <span className="capture-item-name font-medium text-slate-800">{it.food_name}</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      aria-label={`Khối lượng ${it.food_name} (gam)`}
                      min="1"
                      max="3000"
                      step="5"
                      value={it.estimated_gram || ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_GRAM',
                          key: it.key,
                          gram: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-20 px-2 py-0.5 text-xs text-right bg-slate-50 border border-slate-300 rounded-lg"
                    />
                    <span className="text-xs text-slate-500">g</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'REMOVE_ITEM', key: it.key })}
                    className="text-slate-400 hover:text-red-500 p-1"
                    aria-label={`Xóa món ${it.food_name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nút tiếp tục chuyển sang bước kiểm tra & lưu */}
      <div className="pt-2">
        <button
          type="button"
          disabled={items.length === 0}
          onClick={onProceedToReview}
          className={`w-full py-3 px-5 rounded-2xl text-sm font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
            items.length > 0
              ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          <span>Tiếp tục kiểm tra khẩu phần</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
