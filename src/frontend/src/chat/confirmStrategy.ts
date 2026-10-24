/**
 * src/frontend/src/chat/confirmStrategy.ts
 * Bộ chọn chiến lược xác nhận thẻ hành động thuần túy (S1, S2, S3) theo ADR-W4-03.
 * Đảm bảo Zero-Trust: Tuyệt đối không đưa user_id vào payload.
 */

import type { ActionCardModel } from './types';

export type ConfirmStrategy = 'S1' | 'S2' | 'S3';

export interface ConfirmCapabilities {
  hasConfirmEndpoint?: boolean;
}

export function resolveStrategy(
  card: ActionCardModel,
  caps: ConfirmCapabilities = { hasConfirmEndpoint: false },
): ConfirmStrategy {
  // Thẻ đã kết thúc, hết hạn hoặc chỉ đọc không thể xác nhận
  if (card.state === 'readonly' || card.state === 'expired' || card.state === 'confirmed') {
    return 'S3';
  }

  // Chiến lược S1: Có định danh server cấp và backend có endpoint xác nhận chuyên biệt
  if (card.actionId !== undefined && caps.hasConfirmEndpoint) {
    return 'S1';
  }

  // Chiến lược S2: Thẻ có danh sách món ăn với food_id nguyên dương hợp lệ
  const hasValidItems =
    Array.isArray(card.items) &&
    card.items.length > 0 &&
    card.items.every(
      (item) =>
        Number.isInteger(item.food_id) &&
        item.food_id > 0 &&
        typeof item.estimated_gram === 'number' &&
        item.estimated_gram > 0,
    );

  if (hasValidItems) {
    return 'S2';
  }

  // Chiến lược S3: Dữ liệu không đủ -> Thẻ chỉ đọc, chuyển hướng sang ghi bằng camera
  return 'S3';
}

export interface MealLogConfirmPayload {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: Array<{
    food_id: number;
    food_name?: string;
    estimated_gram: number;
  }>;
  is_confirmed: true;
}

export function buildLogPayload(card: ActionCardModel): MealLogConfirmPayload {
  return {
    meal_type: card.mealType,
    items: card.items.map(({ food_id, food_name, estimated_gram }) => ({
      food_id,
      food_name,
      estimated_gram,
    })),
    // is_confirmed = true: Chỉ được đặt khi người dùng bấm nút [Xác nhận lưu]
    is_confirmed: true,
  };
}
