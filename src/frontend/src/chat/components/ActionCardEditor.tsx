import { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { ActionCardModel, ActionCardItemModel } from '../types';
import { useMealPreview } from '../../hooks/useMealPreview';
import { MEAL_ITEM_LIMITS } from '../../constants/mealLimits';
import { EstimatedBadge } from '../../components/common/EstimatedBadge';

interface ActionCardEditorProps {
  card: ActionCardModel;
  onSave: (
    items: { food_id: number; estimated_gram: number; food_name: string }[],
    mealType: string,
  ) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

const focusStyle =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';
const primaryBtn = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-nutri-primary px-4 py-2 text-sm font-semibold text-white hover:bg-nutri-dark disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`;
const secondaryBtn = `inline-flex min-h-11 items-center justify-center rounded-xl border border-nutri-border px-4 py-2 text-sm font-medium hover:bg-nutri-surface disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`;

const mealTypeOptions = [
  { value: 'breakfast', label: 'Bữa sáng' },
  { value: 'lunch', label: 'Bữa trưa' },
  { value: 'dinner', label: 'Bữa tối' },
  { value: 'snack', label: 'Bữa phụ' },
];

export function ActionCardEditor({
  card,
  onSave,
  onCancel,
  isSaving = false,
}: ActionCardEditorProps) {
  const [mealType, setMealType] = useState<string>(card.mealType || 'lunch');
  const [items, setItems] = useState<ActionCardItemModel[]>(() =>
    card.items.map((item) => ({
      ...item,
      estimated_gram: Math.max(
        MEAL_ITEM_LIMITS.minGram,
        Math.min(MEAL_ITEM_LIMITS.maxGram, Math.round(item.estimated_gram)),
      ),
    })),
  );

  // Hook preview Backend: Zero Frontend math (ADR-W3-02 / N1)
  const previewItems = useMemo(() => items.map((i) => ({
    food_id: i.food_id,
    estimated_gram: i.estimated_gram,
  })), [items]);
  const { preview, status: previewStatus, error: previewError } = useMealPreview(
    previewItems,
    mealType,
    300,
  );

  const handleGramChange = (index: number, newGramStr: string) => {
    const val = parseInt(newGramStr, 10);
    const validGram = Number.isNaN(val) ? 0 : val;
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, estimated_gram: validGram } : item)),
    );
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return; // Keep at least 1 item
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const hasInvalidGram = items.some(
    (i) => i.estimated_gram < MEAL_ITEM_LIMITS.minGram || i.estimated_gram > MEAL_ITEM_LIMITS.maxGram,
  );
  const isCalculating = previewStatus === 'calculating';
  const previewCurrent = previewStatus === 'ready' && preview?.items.length === items.length &&
    preview.items.every((item, index) => item.food_id === items[index].food_id && item.estimated_gram === items[index].estimated_gram);
  const canSave = !hasInvalidGram && items.length > 0 && previewCurrent && !isSaving;

  const handleSubmit = async () => {
    if (!canSave) return;
    const saveItems = items.map((i) => ({
      food_id: i.food_id,
      estimated_gram: i.estimated_gram,
      food_name: i.food_name,
    }));
    await onSave(saveItems, mealType);
  };

  return (
    <div
      role="region"
      aria-label="Chỉnh sửa khẩu phần bữa ăn"
      className="space-y-4 rounded-2xl border border-nutri-border bg-nutri-panel p-4 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-nutri-border/60 pb-3">
        <h3 className="text-sm font-semibold text-nutri-ink">Chỉnh sửa khẩu phần</h3>
        <select
          disabled={isSaving}
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          aria-label="Chọn loại bữa ăn"
          className="rounded-lg border border-nutri-border bg-white px-2.5 py-1 text-xs font-medium text-nutri-ink focus:outline-none focus:ring-2 focus:ring-nutri-focus"
        >
          {mealTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Items list */}
      <div className="space-y-2.5">
        {items.map((item, index) => {
          const previewItem = preview?.items?.[index];
          const isInvalid =
            item.estimated_gram < MEAL_ITEM_LIMITS.minGram ||
            item.estimated_gram > MEAL_ITEM_LIMITS.maxGram;

          return (
            <div
              key={item.food_id || index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-nutri-surface p-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-nutri-ink">{item.food_name}</p>
                {previewItem && (
                  <p className="text-xs text-nutri-muted">
                    {Math.round(previewItem.calories)} kcal
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    disabled={isSaving}
                    type="number"
                    value={item.estimated_gram}
                    min={MEAL_ITEM_LIMITS.minGram}
                    max={MEAL_ITEM_LIMITS.maxGram}
                    onChange={(e) => handleGramChange(index, e.target.value)}
                    aria-label={`Số gam cho ${item.food_name}`}
                    aria-invalid={isInvalid}
                    className={`w-16 rounded-lg border px-2 py-1 text-right text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-nutri-focus ${
                      isInvalid ? 'border-red-400 bg-red-50 text-red-700' : 'border-nutri-border bg-white'
                    }`}
                  />
                  <span className="text-xs text-nutri-muted">g</span>
                </div>

                {items.length > 1 && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleRemoveItem(index)}
                    aria-label={`Xóa ${item.food_name}`}
                    title="Xóa món"
                    className="min-h-11 min-w-11 p-1 text-nutri-muted hover:text-red-500 rounded-lg hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-nutri-focus"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasInvalidGram && (
        <p className="text-xs text-red-600">
          Khẩu phần mỗi món phải từ {MEAL_ITEM_LIMITS.minGram}g đến {MEAL_ITEM_LIMITS.maxGram}g.
        </p>
      )}

      {/* Backend preview totals */}
      <div className="rounded-xl bg-nutri-selected/40 p-3 space-y-1 text-xs">
        <div className="flex items-center justify-between font-semibold text-nutri-ink">
          <span className="flex items-center gap-1">
            <span>Tổng calo ước tính:</span>
            <EstimatedBadge size="sm" showIcon={false} />
          </span>
          <span>
            {isCalculating ? (
              <span className="flex items-center gap-1 text-nutri-muted">
                <Loader2 size={12} className="animate-spin" />
                Đang tính...
              </span>
            ) : previewCurrent && preview ? (
              `${Math.round(preview.total_calories)} kcal`
            ) : (
              'Chưa có bản xem trước hợp lệ'
            )}
          </span>
        </div>

        {previewCurrent && preview && (
          <div className="flex justify-between text-nutri-muted pt-1 border-t border-nutri-border/40">
            <span>Đạm: {Math.round(preview.total_protein_g)}g</span>
            <span>Carbs: {Math.round(preview.total_carbs_g)}g</span>
            <span>Béo: {Math.round(preview.total_fat_g)}g</span>
          </div>
        )}
      </div>

      {previewError && (
        <p className="text-xs text-red-600">
          Không thể tính toán trước: {previewError}. Vui lòng thử lại.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSubmit}
          className={`${primaryBtn} flex-1`}
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Đang lưu…</span>
            </>
          ) : (
            'Xác nhận lưu'
          )}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={onCancel}
          className={secondaryBtn}
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
