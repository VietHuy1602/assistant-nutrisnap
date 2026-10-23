import { apiClient } from './client';
import type { ActionCard } from '../types/api';
import { ApiError } from '../utils/apiError';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Validate at the UI boundary without extending or changing the wire contract.
export function isMealCard(value: unknown): value is ActionCard {
  if (!record(value) || value.type !== 'confirm_log_meal' || !['pending_user_action', 'cancelled'].includes(String(value.status)) || !record(value.data)) return false;
  const data = value.data;
  return typeof data.meal_type === 'string' && ['breakfast', 'lunch', 'dinner', 'snack'].includes(data.meal_type) && nonnegative(data.total_calories)
    && Array.isArray(data.items) && data.items.length > 0 && data.items.every(item => record(item)
      && Number.isInteger(item.food_id) && Number(item.food_id) > 0
      && typeof item.food_name === 'string' && !!item.food_name.trim()
      && typeof item.estimated_gram === 'number' && Number.isFinite(item.estimated_gram) && item.estimated_gram >= 1 && item.estimated_gram <= 3000
      && [item.calories, item.protein_g, item.carbs_g, item.fat_g].every(nonnegative));
}

export async function sendAssistantMessage(message: string) {
  const { data } = await apiClient.post<unknown>('/assistant/chat', { session_id: 1, message });
  if (!record(data) || typeof data.reply_text !== 'string' || !data.reply_text.trim()) throw new ApiError('Chưa đọc được phản hồi từ trợ lý. Vui lòng thử lại.');
  return { text: data.reply_text, card: data.action_card, disclaimer: typeof data.disclaimer === 'string' ? data.disclaimer : undefined };
}

export class UncertainMealSaveError extends Error {}

export async function saveAssistantMeal(card: ActionCard) {
  if (!isMealCard(card) || card.status !== 'pending_user_action') throw new ApiError('Thẻ bữa ăn không hợp lệ. Vui lòng yêu cầu kiểm tra lại.');
  const { data, status } = await apiClient.post<unknown>('/meals/log', {
    meal_type: card.data.meal_type,
    items: card.data.items.map(({ food_id, food_name, estimated_gram }) => ({ food_id, food_name, estimated_gram })),
    is_confirmed: true,
  });
  // The actual router sends 201 only for a confirmed write. Never use preview totals as acknowledgement.
  if (status !== 201 || !record(data) || data.success !== true || !Number.isInteger(data.meal_id) || Number(data.meal_id) <= 0
    || !nonnegative(data.total_calories) || typeof data.logged_at !== 'string' || !Number.isFinite(Date.parse(data.logged_at))) {
    throw new UncertainMealSaveError('Chưa xác minh được kết quả lưu. Hãy kiểm tra nhật ký trước khi ghi lại để tránh trùng bữa ăn.');
  }
  return { mealId: Number(data.meal_id), calories: data.total_calories };
}
