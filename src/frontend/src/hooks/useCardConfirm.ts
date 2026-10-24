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
import { transitionCard } from '../chat/actionCardMachine';
import { emitMealLogged } from '../utils/mealEvents';
import type { ActionCardModel } from '../chat/types';
import type { ChatAction } from '../chat/chatReducer';

export interface UseCardConfirmOptions {
  card: ActionCardModel;
  dispatch: React.Dispatch<ChatAction>;
}

export function useCardConfirm({ card, dispatch }: UseCardConfirmOptions) {
  const [isConfirming, setIsConfirming] = useState(false);
  const lockRef = useRef(false);

  const confirm = useCallback(async () => {
    if (lockRef.current || card.state === 'confirming' || card.state === 'confirmed' || card.state === 'readonly') {
      return;
    }

    lockRef.current = true;
    setIsConfirming(true);

    const confirmingCard = transitionCard(card, { type: 'START_CONFIRM' });
    dispatch({ type: 'UPDATE_CARD', card: confirmingCard });

    try {
      const result = await assistantApi.saveMealFromCard(card);

      const confirmedCard = transitionCard(confirmingCard, {
        type: 'CONFIRM_SUCCESS',
        mealId: result.mealId,
        calories: result.calories,
      });

      dispatch({ type: 'UPDATE_CARD', card: confirmedCard });

      // Phát sự kiện bus đồng bộ Dashboard
      emitMealLogged({
        source: 'chat',
        date: result.loggedAt,
        mealId: result.mealId,
      });

      dispatch({
        type: 'SYSTEM_NOTE',
        text: `Đã lưu thành công bữa ăn vào nhật ký (${result.calories} kcal). Vòng calo trên Dashboard đã được làm mới.`,
        tone: 'success',
      });
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; response?: { status?: number; data?: { detail?: string } } };
      const status = errorObj?.response?.status;
      const isTimeoutOrNetwork =
        errorObj?.code === 'ECONNABORTED' ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        status === 504 ||
        status === 408;

      if (isTimeoutOrNetwork) {
        const uncertainCard = transitionCard(confirmingCard, {
          type: 'CONFIRM_UNCERTAIN',
          message: 'Kết nối mạng gián đoạn, chưa rõ bữa ăn đã được lưu vào CSDL hay chưa. Vui lòng bấm "Kiểm tra Dashboard" trước khi thử lại.',
        });
        dispatch({ type: 'UPDATE_CARD', card: uncertainCard });
        // Tự động phát sự kiện làm mới Dashboard để người dùng kiểm tra
        emitMealLogged({ source: 'chat' });
      } else {
        const detailMsg = errorObj?.response?.data?.detail || errorObj?.message || 'Không thể lưu bữa ăn. Vui lòng thử lại.';
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
  }, [card, dispatch]);

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
