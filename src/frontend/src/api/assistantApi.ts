/**
 * src/frontend/src/api/assistantApi.ts
 * Tầng giao tiếp API cho Trợ lý ảo AI NutriSnap (W4).
 * Tuân thủ:
 * - Zero-Trust: Tuyệt đối không gửi user_id trong URL hoặc request body.
 * - Timeout 45s, không tự retry POST.
 * - Chuẩn hóa response qua normalizeAssistantResponse (Tolerant Reader).
 * - Giữ các hàm legacy (sendAssistantMessage, saveAssistantMeal, isMealCard) để tương thích suite test hiện tại.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { CHAT_TIMEOUT_MS } from '../chat/config';
import { normalizeAssistantResponse } from './chatContract';
import { buildLogPayload } from '../chat/confirmStrategy';
import type { ActionCardModel, AssistantTurn } from '../chat/types';
import type { ActionCard, MealLogResponse } from '../types/api';
import { ApiError } from '../utils/apiError';

export interface SendMessageParams {
  message: string;
  sessionId?: string | number | null;
}

export interface HistoryMessageItem {
  id: string | number;
  sessionId: string | number;
  senderRole: 'user' | 'assistant';
  content: string;
  toolName?: string | null;
  createdAt: string;
}

export interface ChatSessionItem {
  id: number;
  userId: number;
  startedAt: string;
}

export const assistantApi = {
  /**
   * Gửi tin nhắn tới trợ lý ảo.
   * Body CHỈ gồm { message, session_id? }, tuyệt đối không có user_id.
   */
  async sendMessage(
    params: SendMessageParams,
    signal?: AbortSignal,
  ): Promise<AssistantTurn> {
    const payload: { message: string; session_id?: number } = {
      message: params.message,
    };

    if (params.sessionId !== undefined && params.sessionId !== null) {
      const numId = Number(params.sessionId);
      if (Number.isInteger(numId) && numId > 0) {
        payload.session_id = numId;
      }
    }

    const response = await apiClient.post<unknown>(
      ENDPOINTS.ASSISTANT_CHAT,
      payload,
      {
        signal,
        timeout: CHAT_TIMEOUT_MS,
      },
    );

    return normalizeAssistantResponse(response.data);
  },

  /**
   * Lấy danh sách các phiên chat của người dùng đăng nhập.
   */
  async listSessions(signal?: AbortSignal): Promise<ChatSessionItem[]> {
    const response = await apiClient.get<Array<{ id: number; user_id: number; started_at: string }>>(
      ENDPOINTS.ASSISTANT_SESSIONS,
      { signal },
    );
    return (response.data || []).map((s) => ({
      id: s.id,
      userId: s.user_id,
      startedAt: s.started_at,
    }));
  },

  /**
   * Lấy lịch sử tin nhắn của một phiên chat.
   */
  async getSessionMessages(
    sessionId: number | string,
    limit: number = 20,
    signal?: AbortSignal,
  ): Promise<HistoryMessageItem[]> {
    const response = await apiClient.get<
      Array<{
        id: number;
        session_id: number;
        sender_role: string;
        content: string;
        tool_name?: string | null;
        created_at: string;
      }>
    >(ENDPOINTS.ASSISTANT_MESSAGES(sessionId), {
      params: { limit },
      signal,
    });

    return (response.data || []).map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      senderRole: m.sender_role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      toolName: m.tool_name,
      createdAt: m.created_at,
    }));
  },

  /**
   * Ghi nhận bữa ăn từ Action Card theo chiến lược S2 (POST /meals/log).
   * is_confirmed luôn là true do hành động bấm nút của người dùng.
   */
  async saveMealFromCard(
    card: ActionCardModel,
    signal?: AbortSignal,
  ): Promise<{ mealId: number; calories: number; loggedAt: string }> {
    const payload = buildLogPayload(card);
    const response = await apiClient.post<MealLogResponse>(
      ENDPOINTS.MEAL_LOG,
      payload,
      { signal },
    );

    const data = response.data;
    const mealId = Number(data.meal_id);
    const calories = Number(data.total_calories || data.nutrition?.total_calories || 0);

    return {
      mealId: Number.isInteger(mealId) && mealId > 0 ? mealId : 0,
      calories: !isNaN(calories) ? calories : 0,
      loggedAt: data.logged_at || new Date().toISOString(),
    };
  },
};

// ==============================================================================
// LEGACY HELPERS ĐẢM BẢO TƯƠNG THÍCH NGƯỢC VỚI TEST SUITE HIỆN CÓ
// ==============================================================================

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function isMealCard(value: unknown): value is ActionCard {
  if (
    !record(value) ||
    value.type !== 'confirm_log_meal' ||
    !['pending_user_action', 'cancelled'].includes(String(value.status)) ||
    !record(value.data)
  )
    return false;
  const data = value.data;
  return (
    typeof data.meal_type === 'string' &&
    ['breakfast', 'lunch', 'dinner', 'snack'].includes(data.meal_type) &&
    nonnegative(data.total_calories) &&
    Array.isArray(data.items) &&
    data.items.length > 0 &&
    data.items.every(
      (item) =>
        record(item) &&
        Number.isInteger(item.food_id) &&
        Number(item.food_id) > 0 &&
        typeof item.food_name === 'string' &&
        !!item.food_name.trim() &&
        typeof item.estimated_gram === 'number' &&
        Number.isFinite(item.estimated_gram) &&
        item.estimated_gram >= 1 &&
        item.estimated_gram <= 3000 &&
        [item.calories, item.protein_g, item.carbs_g, item.fat_g].every(nonnegative),
    )
  );
}

export async function sendAssistantMessage(message: string) {
  const { data } = await apiClient.post<unknown>('/assistant/chat', { session_id: 1, message });
  if (!record(data) || typeof data.reply_text !== 'string' || !data.reply_text.trim())
    throw new ApiError('Chưa đọc được phản hồi từ trợ lý. Vui lòng thử lại.');
  return {
    text: data.reply_text,
    card: data.action_card as ActionCard | undefined,
    disclaimer: typeof data.disclaimer === 'string' ? data.disclaimer : undefined,
  };
}

export class UncertainMealSaveError extends Error {}

export async function saveAssistantMeal(card: ActionCard) {
  if (!isMealCard(card) || card.status !== 'pending_user_action')
    throw new ApiError('Thẻ bữa ăn không hợp lệ. Vui lòng yêu cầu kiểm tra lại.');
  const { data, status } = await apiClient.post<unknown>('/meals/log', {
    meal_type: card.data.meal_type,
    items: card.data.items.map(({ food_id, food_name, estimated_gram }) => ({
      food_id,
      food_name,
      estimated_gram,
    })),
    is_confirmed: true,
  });
  if (
    status !== 201 ||
    !record(data) ||
    data.success !== true ||
    !Number.isInteger(data.meal_id) ||
    Number(data.meal_id) <= 0 ||
    !nonnegative(data.total_calories) ||
    typeof data.logged_at !== 'string' ||
    !Number.isFinite(Date.parse(data.logged_at))
  ) {
    throw new UncertainMealSaveError(
      'Chưa xác minh được kết quả lưu. Hãy kiểm tra nhật ký trước khi ghi lại để tránh trùng bữa ăn.',
    );
  }
  return { mealId: Number(data.meal_id), calories: data.total_calories as number };
}

export async function confirmAssistantAction(confirmationId: string) {
  if (!confirmationId || typeof confirmationId !== 'string') {
    throw new ApiError('Mã xác nhận không hợp lệ.');
  }
  const { data, status } = await apiClient.post<unknown>(`/assistant/confirmations/${confirmationId}/confirm`);
  if (status !== 200 || !record(data) || data.success !== true) {
    throw new UncertainMealSaveError('Chưa xác minh được kết quả xác nhận. Vui lòng kiểm tra lại nhật ký.');
  }
  return {
    mealId: typeof data.meal_id === 'number' ? data.meal_id : undefined,
    calories: typeof data.total_calories === 'number' ? data.total_calories : undefined,
  };
}

export async function cancelAssistantAction(confirmationId: string) {
  if (!confirmationId || typeof confirmationId !== 'string') {
    throw new ApiError('Mã xác nhận không hợp lệ.');
  }
  const { data } = await apiClient.post<unknown>(`/assistant/confirmations/${confirmationId}/cancel`);
  return data;
}

