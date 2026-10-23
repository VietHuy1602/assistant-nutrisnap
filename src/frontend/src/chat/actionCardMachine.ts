/**
 * src/frontend/src/chat/actionCardMachine.ts
 * Máy trạng thái thuần túy (Pure State Machine) quản lý vòng đời của Thẻ Hành động (Action Card).
 * Tuân thủ sơ đồ chuyển trạng thái mục 9.3 trong NS-FE-W4-001.
 */

import type { ActionCardModel, CardPhase } from './types';

export type CardAction =
  | { type: 'START_EDIT' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'START_CONFIRM' }
  | { type: 'CONFIRM_SUCCESS'; mealId: number; calories?: number }
  | { type: 'CONFIRM_FAILED'; error: string }
  | { type: 'CONFIRM_UNCERTAIN'; message?: string }
  | { type: 'EXPIRE' }
  | { type: 'SET_READONLY' };

export const VALID_CARD_TRANSITIONS: Record<CardPhase, readonly CardPhase[]> = {
  pending: ['editing', 'confirming', 'expired', 'readonly'],
  editing: ['pending', 'confirming', 'readonly'],
  confirming: ['confirmed', 'failed', 'uncertain'],
  confirmed: [], // Trạng thái kết thúc - không cho phép chuyển tiếp
  failed: ['confirming', 'readonly'],
  uncertain: ['confirming', 'readonly'],
  expired: [], // Trạng thái kết thúc
  readonly: [], // Trạng thái kết thúc
} as const;

export function canTransitionCard(from: CardPhase, to: CardPhase): boolean {
  return VALID_CARD_TRANSITIONS[from].includes(to);
}

export function transitionCard(
  card: ActionCardModel,
  action: CardAction,
): ActionCardModel {
  let targetPhase: CardPhase;
  let updates: Partial<ActionCardModel> = {};

  switch (action.type) {
    case 'START_EDIT':
      targetPhase = 'editing';
      break;
    case 'CANCEL_EDIT':
      targetPhase = 'pending';
      break;
    case 'START_CONFIRM':
      targetPhase = 'confirming';
      updates = { errorMessage: undefined };
      break;
    case 'CONFIRM_SUCCESS':
      targetPhase = 'confirmed';
      updates = {
        savedMealId: action.mealId,
        savedCalories: action.calories ?? card.totals?.calories,
        errorMessage: undefined,
      };
      break;
    case 'CONFIRM_FAILED':
      targetPhase = 'failed';
      updates = { errorMessage: action.error };
      break;
    case 'CONFIRM_UNCERTAIN':
      targetPhase = 'uncertain';
      updates = {
        errorMessage:
          action.message ||
          'Chưa xác minh được kết quả lưu trên máy chủ. Hãy kiểm tra Dashboard trước khi thử lại.',
      };
      break;
    case 'EXPIRE':
      targetPhase = 'expired';
      break;
    case 'SET_READONLY':
      targetPhase = 'readonly';
      break;
    default:
      return card;
  }

  // Chuyển trạng thái không hợp lệ bị bỏ qua (an toàn, không ném lỗi)
  if (!canTransitionCard(card.state, targetPhase)) {
    return card;
  }

  return {
    ...card,
    ...updates,
    state: targetPhase,
  };
}
