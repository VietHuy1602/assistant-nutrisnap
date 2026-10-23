/**
 * src/frontend/src/constants/mealLimits.ts
 * Hằng số giới hạn món ăn và khối lượng khẩu phần dùng chung toàn hệ thống.
 * Đảm bảo một nguồn sự thật duy nhất (Single Source of Truth) giữa W3 và W4.
 */

export const MEAL_ITEM_LIMITS = {
  minGram: 1,
  maxGram: 3000,
  minItems: 1,
  maxItems: 20,
  maxNameLength: 120,
} as const;
