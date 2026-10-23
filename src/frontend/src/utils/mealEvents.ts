/**
 * src/frontend/src/utils/mealEvents.ts
 * Cross-component event bus for notifying when a meal is logged.
 * Kích hoạt tự động làm mới dữ liệu Daily Dashboard mà không cần reload trang.
 * Hỗ trợ chi tiết nguồn { source, date, mealId } và tương thích ngược 100% với W3.
 */

export const MEAL_LOGGED_EVENT = 'nutrisnap:meal-logged';

export interface MealLoggedDetail {
  source?: 'chat' | 'capture';
  date?: string;
  mealId?: number;
}

export function emitMealLogged(detail?: MealLoggedDetail | unknown): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MEAL_LOGGED_EVENT, { detail }));
  }
}

export function onMealLogged(callback: (event: CustomEvent<MealLoggedDetail>) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (e: Event) => {
    callback(e as CustomEvent<MealLoggedDetail>);
  };

  window.addEventListener(MEAL_LOGGED_EVENT, handler);
  return () => {
    window.removeEventListener(MEAL_LOGGED_EVENT, handler);
  };
}
