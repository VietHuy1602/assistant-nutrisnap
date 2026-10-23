import React, { useEffect, useRef, useState } from 'react';
import { Plus, Undo2, AlertTriangle } from 'lucide-react';
import type { MealDraftAction, MealDraftState } from './mealDraftReducer';
import { isDraftSavable, getDraftUnsavableReasons } from './mealDraftReducer';
import { MealItemRow } from './MealItemRow';
import { MealTotalsBar } from './MealTotalsBar';
import { ConfirmBar } from './ConfirmBar';
import { FoodSearchCombobox } from './FoodSearchCombobox';
import { useMealPreview } from '../../hooks/useMealPreview';
import { getMealTypeLabel } from '../../constants/copy';
import type { FoodReferenceItem } from '../../types/api';

interface MealReviewListProps {
  state: MealDraftState;
  dispatch: React.Dispatch<MealDraftAction>;
  onConfirmSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const MealReviewList: React.FC<MealReviewListProps> = ({
  state,
  dispatch,
  onConfirmSave,
  onCancel,
  isSaving = false,
}) => {
  const [isAddingItem, setIsAddingItem] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chuyển đổi draft items sang format gửi preview
  const previewItems = state.items.map((it) => ({
    food_id: it.food_id,
    food_name: it.food_name,
    estimated_gram: it.estimated_gram,
  }));

  // Gửi tính toán đại số tại Backend qua debounce 400ms (ADR-W3-02, PSC-6)
  const { preview, status: previewStatus, error: previewError, retry: retryPreview } = useMealPreview(
    previewItems,
    state.mealType,
    400,
  );

  const isCalculating = previewStatus === 'calculating';
  const savable = isDraftSavable(state.items);
  const unsavableReasons = getDraftUnsavableReasons(state.items);

  // Quản lý hoàn tác xóa món trong 5 giây (PSC-7)
  useEffect(() => {
    if (state.deletedItem) {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = setTimeout(() => {
        dispatch({ type: 'CLEAR_UNDO' });
      }, 5000);
    }
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, [state.deletedItem, dispatch]);

  const handleSelectNewFood = (food: FoodReferenceItem) => {
    dispatch({ type: 'ADD_ITEM', food });
    setIsAddingItem(false);
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      {/* Tiêu đề & Chọn thêm món */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            {getMealTypeLabel(state.mealType)}
          </span>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Kiểm tra & Sửa khẩu phần</h2>
          <p className="text-xs text-slate-500">
            AI có thể nhận diện sai — hãy kiểm tra lại tên món và số gam thực tế.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddingItem(true)}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Thêm món khác</span>
        </button>
      </div>

      {/* Ô tìm kiếm thêm món ăn mới nếu đang mở */}
      {isAddingItem && (
        <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200">
          <p className="text-xs font-semibold text-emerald-900 mb-2">Thêm món ăn vào bữa:</p>
          <FoodSearchCombobox
            onSelect={handleSelectNewFood}
            onClose={() => setIsAddingItem(false)}
            placeholder="Gõ tên món cần thêm (ví dụ: Trứng luộc, Canh rau)..."
            autoFocus
          />
        </div>
      )}

      {/* Thanh thông báo hoàn tác xóa món (PSC-7) */}
      {state.deletedItem && (
        <div
          role="status"
          className="flex items-center justify-between p-3.5 bg-slate-800 text-white rounded-2xl shadow-md transition-all animate-in fade-in slide-in-from-top-2"
        >
          <span className="text-xs">
            Đã xóa <strong className="font-semibold">{state.deletedItem.item.food_name}</strong>
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'UNDO_REMOVE' })}
            className="inline-flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-emerald-400 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hoàn tác (5s)</span>
          </button>
        </div>
      )}

      {/* Danh sách các món ăn trong bữa */}
      <div className="flex flex-col gap-3">
        {state.items.map((item) => {
          const calculatedItem = preview?.items.find((c) => c.food_id === item.food_id);
          return (
            <MealItemRow
              key={item.key}
              item={item}
              calculatedItem={calculatedItem}
              onSetGram={(gram) => dispatch({ type: 'SET_GRAM', key: item.key, gram })}
              onSwapFood={(food) => dispatch({ type: 'SWAP_FOOD', key: item.key, food })}
              onRemove={() => dispatch({ type: 'REMOVE_ITEM', key: item.key })}
              disabled={isSaving}
            />
          );
        })}

        {state.items.length === 0 && (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-slate-500">
            <p className="text-sm">Chưa có món ăn nào trong danh sách.</p>
            <button
              type="button"
              onClick={() => setIsAddingItem(true)}
              className="mt-3 text-xs font-semibold text-emerald-600 hover:underline"
            >
              + Nhấn để thêm món
            </button>
          </div>
        )}
      </div>

      {/* Lỗi tính toán preview nếu có */}
      {previewError && (
        <div className="flex items-center justify-between p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
            <span>{previewError}</span>
          </div>
          <button
            type="button"
            onClick={retryPreview}
            className="font-semibold text-red-800 hover:underline shrink-0 ml-2"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Tổng dinh dưỡng Calo / Macro tính bởi Backend */}
      <MealTotalsBar nutrition={preview} isCalculating={isCalculating} />

      {/* Thanh nút Xác nhận lưu hoặc Hủy */}
      <ConfirmBar
        isSavable={savable}
        isSaving={isSaving}
        isCalculating={isCalculating}
        unsavableReasons={unsavableReasons}
        onConfirmSave={onConfirmSave}
        onCancel={onCancel}
      />
    </div>
  );
};
