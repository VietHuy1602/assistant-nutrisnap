import { useState } from 'react';
import { AlertCircle, Check, Edit2, ExternalLink } from 'lucide-react';
import type { ActionCardModel, CardPhase } from '../types';
import { ActionCardEditor } from './ActionCardEditor';
import { EstimatedBadge } from '../../components/common/EstimatedBadge';
import { useOptionalChat } from '../../context/ChatContext';
import { useCardConfirm } from '../../hooks/useCardConfirm';
import { transitionCard } from '../actionCardMachine';

interface ActionConfirmationCardProps {
  card: ActionCardModel;
  phase?: CardPhase;
  error?: string;
  savedCalories?: number;
  onConfirm?: (card: ActionCardModel) => Promise<void>;
  onMealSaved?: () => void;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdited?: (
    items: { food_id: number; estimated_gram: number; food_name: string }[],
    mealType: string,
  ) => Promise<void>;
  onRetry?: () => void;
  onCancelCard?: () => void;
  onNavigateDashboard?: () => void;
}

const focusStyle =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';
const primaryBtn = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-nutri-primary px-4 py-2 text-sm font-semibold text-white hover:bg-nutri-dark disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`;
const secondaryBtn = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-nutri-border px-4 py-2 text-sm font-medium hover:bg-nutri-surface disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`;

const mealLabels: Record<string, string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
  snack: 'Bữa phụ',
};

const display = (value: number) => Math.round(value).toLocaleString('vi-VN');

export function ActionConfirmationCard({
  card,
  phase: suppliedPhase,
  error,
  savedCalories,
  onConfirm,
  onEdit,
  onCancelEdit,
  onSaveEdited,
  onCancelCard,
  onNavigateDashboard,
  onMealSaved,
}: ActionConfirmationCardProps) {
  const chat = useOptionalChat();
  const integration = useCardConfirm({ card, dispatch: chat?.dispatch ?? (() => {}), onSaved: onMealSaved });
  const phase = ['confirmed', 'expired', 'readonly'].includes(card.state) ? card.state : suppliedPhase ?? card.state;
  const save = onConfirm ?? integration.confirm;
  const saveError = error ?? card.errorMessage;
  const [isEditing, setIsEditing] = useState(false);
  const [checkedDashboard, setCheckedDashboard] = useState(false);

  // If in editing mode, show the ActionCardEditor
  if ((phase === 'editing' || isEditing) && ['pending', 'editing', 'confirming'].includes(phase)) {
    return (
      <ActionCardEditor
        card={card}
        isSaving={integration.isConfirming || phase === 'confirming'}
        onSave={async (items, mealType) => {
          if (onSaveEdited) {
            await onSaveEdited(items, mealType);
          } else if (chat && ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) {
            await integration.confirm({ ...card, items, mealType: mealType as ActionCardModel['mealType'] });
          }
          setIsEditing(false);
        }}
        onCancel={() => {
          onCancelEdit?.();
          if (chat) chat.dispatch({ type: 'UPDATE_CARD', card: transitionCard(card, { type: 'CANCEL_EDIT' }) });
          setIsEditing(false);
        }}
      />
    );
  }

  const mealTypeName =
    mealLabels[card.mealType] || card.mealTypeVi || card.mealType || 'Bữa ăn';
  const itemCount = card.items?.length || 0;
  const isConfirming = phase === 'confirming';

  return (
    <section
      role="region"
      aria-label="Thẻ xác nhận bữa ăn"
      aria-busy={isConfirming}
      className="mt-3 w-full min-w-0 space-y-4 rounded-2xl border border-nutri-border bg-nutri-selected/50 p-3 sm:p-4 shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-nutri-ink">
        <h3>Kiểm tra trước khi lưu</h3>
        <span className="rounded-lg bg-nutri-surface px-2.5 py-1 text-xs font-medium text-nutri-primary border border-nutri-border/60">
          {mealTypeName}
        </span>
      </div>

      {/* Items list */}
      <ul className="space-y-2">
        {card.items.map((item, index) => (
          <li
            key={item.food_id || index}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-nutri-panel p-3 text-sm"
          >
            <span className="min-w-0 break-words font-medium text-nutri-ink">
              {item.food_name}
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-nutri-muted">
              <span>
                {display(item.estimated_gram)} g · {item.calories === undefined ? 'Chưa có dữ liệu kcal' : `${display(item.calories)} kcal`}
              </span>
              <EstimatedBadge size="sm" showIcon={false} />
            </div>
          </li>
        ))}
      </ul>

      {/* Calories and macros totals */}
      <div className="space-y-1">
        <p className="text-sm leading-6 font-semibold tabular-nums text-nutri-ink flex flex-wrap items-center justify-between gap-2">
          <span>Tổng ước tính trước khi lưu:</span>
          <span>{card.totals?.calories === undefined ? 'Chưa có dữ liệu kcal' : `${display(card.totals.calories)} kcal`}</span>
        </p>

        {(card.totals?.protein || card.totals?.carbs || card.totals?.fat) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-between text-sm tabular-nums text-nutri-muted pt-2 border-t border-nutri-border/40">
            {card.totals?.protein ? <span>Đạm: {display(card.totals.protein)}g</span> : null}
            {card.totals?.carbs ? <span>Tinh bột: {display(card.totals.carbs)}g</span> : null}
            {card.totals?.fat ? <span>Béo: {display(card.totals.fat)}g</span> : null}
          </div>
        )}
      </div>

      {/* Status & Messages */}
      {phase === 'pending' && (
        <p className="text-sm text-nutri-muted">
          Chờ bạn xác nhận · Chưa gửi yêu cầu lưu.
        </p>
      )}

      {isConfirming && (
        <p role="status" className="text-sm text-nutri-dark font-medium animate-pulse">
          Đang lưu bữa ăn…
        </p>
      )}

      {phase === 'confirmed' && (
        <div role="status" className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-nutri-dark">
            <Check aria-hidden="true" size={18} className="text-emerald-600" />
            <span>
              {(savedCalories ?? card.savedCalories) === undefined ? 'Đã lưu vào nhật ký · Chưa có số liệu kcal đã lưu.' : `Đã lưu vào nhật ký · ${display((savedCalories ?? card.savedCalories)!)} kcal (máy chủ xác nhận).`}
            </span>
          </p>
          {onNavigateDashboard && (
            <button
              type="button"
              onClick={onNavigateDashboard}
              className="inline-flex items-center gap-1 text-xs text-nutri-primary hover:underline font-semibold"
            >
              <span>Xem Dashboard</span>
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {phase === 'failed' && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-nutri-error space-y-1"
        >
          <p className="font-semibold">Chưa xác nhận lưu thành công</p>
          <p className="text-xs leading-5">
            {saveError || 'Máy chủ chưa chấp nhận bữa ăn. Bạn có thể thử lại hoặc hủy thẻ.'}
          </p>
        </div>
      )}

      {phase === 'uncertain' && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle size={16} className="text-amber-600" />
            <span>Kết quả lưu chưa rõ ràng</span>
          </div>
          <p className="text-xs leading-5">
            {saveError || 'Chưa rõ bữa ăn đã được lưu chưa do phản hồi mạng bị gián đoạn. Hãy kiểm tra Dashboard trước khi thử lại để tránh ghi trùng.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setCheckedDashboard(true);
              onNavigateDashboard?.();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <span>Kiểm tra Dashboard</span>
          </button>
        </div>
      )}

      {(phase === 'readonly' || phase === 'expired') && (
        <p className="text-xs text-nutri-muted italic">
          Thẻ này chưa hỗ trợ lưu tại đây, đã kết thúc hoặc thiếu trạng thái xác nhận hợp lệ. Hãy yêu cầu lại hoặc ghi bữa ăn bằng màn hình chụp ảnh.
        </p>
      )}

      {/* Buttons: only available in pending, confirming, failed, or uncertain (after check) */}
      {(phase === 'pending' ||
        isConfirming ||
        phase === 'failed' ||
        (phase === 'uncertain' && checkedDashboard && onConfirm)) && (
        <div className="flex flex-col min-[390px]:flex-row min-[390px]:flex-wrap gap-3 pt-1">
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => void save(card)}
            aria-label={
              phase === 'failed' || phase === 'uncertain'
                ? `Thử lưu lại bữa ăn gồm ${itemCount} món`
                : `Xác nhận lưu bữa ăn gồm ${itemCount} món`
            }
            className={`${primaryBtn} flex-1`}
          >
            {phase === 'failed' || phase === 'uncertain'
              ? 'Thử lưu lại'
              : 'Xác nhận lưu'}
          </button>

          {phase === 'pending' && (
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => {
                if (onEdit) {
                  onEdit();
                } else if (chat) {
                  chat.dispatch({ type: 'UPDATE_CARD', card: transitionCard(card, { type: 'START_EDIT' }) });
                } else {
                  setIsEditing(true);
                }
              }}
              className={secondaryBtn}
            >
              <Edit2 size={14} aria-hidden="true" />
              <span>Chỉnh sửa</span>
            </button>
          )}

          {(onCancelCard || chat) && (phase === 'pending' || phase === 'failed' || isConfirming) && (
            <button
              type="button"
              disabled={isConfirming}
              onClick={onCancelCard ?? integration.cancel}
              className={secondaryBtn}
            >
              Hủy
            </button>
          )}
        </div>
      )}
    </section>
  );
}
