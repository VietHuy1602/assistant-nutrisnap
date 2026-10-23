/**
 * src/frontend/src/utils/mealEvents.ts
 * Cross-component event bus for notifying when a meal is logged.
 * Kích hoạt tự động làm mới dữ liệu Daily Dashboard mà không cần reload trang.
 */

export const MEAL_LOGGED_EVENT = 'nutrisnap:meal-logged';

export function emitMealLogged(detail?: unknown): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MEAL_LOGGED_EVENT, { detail }));
  }
}

export function onMealLogged(callback: (event: CustomEvent) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (e: Event) => {
    callback(e as CustomEvent);
  };

  window.addEventListener(MEAL_LOGGED_EVENT, handler);
  return () => {
    window.removeEventListener(MEAL_LOGGED_EVENT, handler);
  };
}
