/**
 * src/frontend/src/hooks/useCardConfirm.ts
 * Hook thực thi xác nhận thẻ hành động tương tác (Two-Step Confirmation).
 * Tuân thủ:
 * - Khóa in-flight chống double-submit.
 * - Sau khi confirmed: phát sự kiện emitMealLogged và gỡ bỏ các nút hành động.
 * - Xử lý timeout/mạng thành trạng thái uncertain yêu cầu kiểm tra Dashboard trước khi thử lại.
 */

import { useCallback, useRef, useState } from 'react';
import { assistantApi } from '../api/assistantApi';
import { InvalidMealCardError, UncertainMealSaveError } from '../api/assistantApi';
import { isApiError } from '../utils/apiError';
import { transitionCard } from '../chat/actionCardMachine';
import { emitMealLogged } from '../utils/mealEvents';
import type { ActionCardModel } from '../chat/types';
import type { ChatAction } from '../chat/chatReducer';

export interface UseCardConfirmOptions {
  card: ActionCardModel;
  dispatch: React.Dispatch<ChatAction>;
  onSaved?: () => void;
}

export function useCardConfirm({ card, dispatch, onSaved }: UseCardConfirmOptions) {
  const [isConfirming, setIsConfirming] = useState(false);
  const lockRef = useRef(false);

  const confirm = useCallback(async (editedCard: ActionCardModel = card) => {
    if (lockRef.current || !['pending', 'editing', 'failed'].includes(card.state)) {
      return;
    }

    lockRef.current = true;
    setIsConfirming(true);

    const confirmingCard = transitionCard(editedCard, { type: 'START_CONFIRM' });
    dispatch({ type: 'UPDATE_CARD', card: confirmingCard });

    try {
      const result = await assistantApi.saveMealFromCard(editedCard);

      const confirmedCard = transitionCard(confirmingCard, {
        type: 'CONFIRM_SUCCESS',
        mealId: result.mealId,
        calories: result.calories,
      });

      dispatch({ type: 'UPDATE_CARD', card: confirmedCard });

      // Phát sự kiện bus đồng bộ Dashboard
      emitMealLogged({
        source: 'chat',
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(result.loggedAt)),
        mealId: result.mealId,
      });

      // A refresh callback failure must never turn a successful save into a failed save.
      try { onSaved?.(); } catch {
        dispatch({ type: 'SYSTEM_NOTE', text: 'Bữa ăn đã lưu; chưa thể làm mới Dashboard. Vui lòng kiểm tra nhật ký.', tone: 'info' });
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; response?: { status?: number; data?: { detail?: string } } };
      const status = isApiError(err) ? err.status : errorObj?.response?.status;
      const isTimeoutOrNetwork =
        err instanceof UncertainMealSaveError ||
        (isApiError(err) && !(err instanceof InvalidMealCardError) && (err.isNetworkError || status === undefined)) ||
        errorObj?.code === 'ECONNABORTED' ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (status !== undefined && status >= 500) ||
        status === 408;

      if (isTimeoutOrNetwork) {
        const uncertainCard = transitionCard(confirmingCard, {
          type: 'CONFIRM_UNCERTAIN',
          message: 'Chưa xác minh được kết quả lưu. Hãy kiểm tra nhật ký trước khi ghi lại để tránh trùng bữa ăn.',
        });
        dispatch({ type: 'UPDATE_CARD', card: uncertainCard });
        // Tự động phát sự kiện làm mới Dashboard để người dùng kiểm tra
        emitMealLogged({ source: 'chat' });
      } else {
        const detailMsg = status === 400 || status === 422 ? 'Máy chủ chưa chấp nhận bữa ăn. Bạn có thể chỉnh lại hoặc thử lại.' : errorObj?.message || 'Không thể lưu bữa ăn. Vui lòng thử lại.';
        const failedCard = transitionCard(confirmingCard, {
          type: 'CONFIRM_FAILED',
          error: detailMsg,
        });
        dispatch({ type: 'UPDATE_CARD', card: failedCard });
      }
    } finally {
      lockRef.current = false;
      setIsConfirming(false);
    }
  }, [card, dispatch, onSaved]);

  const cancel = useCallback(() => {
    if (lockRef.current || card.state === 'confirmed') return;
    const cancelledCard = transitionCard(card, { type: 'SET_READONLY' });
    dispatch({ type: 'UPDATE_CARD', card: cancelledCard });
    dispatch({
      type: 'SYSTEM_NOTE',
      text: 'Đã hủy thẻ ghi nhận bữa ăn.',
      tone: 'info',
    });
  }, [card, dispatch]);

  return {
    confirm,
    cancel,
    isConfirming,
  };
}
