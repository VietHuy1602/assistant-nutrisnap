/**
 * src/frontend/src/api/endpoints.ts
 * Centralized API endpoints map derived from Backend OpenAPI / FastAPI Routers.
 * Tuyệt đối không rải rác chuỗi endpoint trực tiếp trong components/hooks.
 */

export const ENDPOINTS = {
  // Authentication & Profile
  AUTH_ME: '/auth/me',
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_LOGOUT: '/auth/logout',

  // Goals
  GOALS: '/goals',

  // AI Vision & Recognition (W3 PoC)
  RECOGNIZE_FOOD: '/ai/recognize-food',
  ANALYZE_DISH: '/ai/analyze-dish',

  // Meal Logging & Preview (Two-Step Confirmation)
  MEAL_LOG: '/meals/log',
  MEALS_TODAY: '/meals/today',
  MEAL_DETAIL: (mealId: number | string) => `/meals/${mealId}`,

  // Dashboard Aggregation
  DAILY_DASHBOARD: '/meals/daily-dashboard',

  // Reference Database (500 Món ăn Việt)
  FOOD_SEARCH: '/foods/search',

  // AI Assistant Chat & Tools (W4)
  ASSISTANT_CHAT: '/assistant/chat',
  ASSISTANT_SESSIONS: '/assistant/sessions',
  ASSISTANT_MESSAGES: (sessionId: number | string) => `/assistant/sessions/${sessionId}/messages`,
  ASSISTANT_HISTORY: '/assistant/history',
  ASSISTANT_EXECUTE: '/assistant/tools/execute',
  ASSISTANT_CONFIRM: '/assistant/action-card/confirm',

  // Progress Analytics, Food Swap & Weight (W5)
  PROGRESS_WEIGHT_TREND: '/analytics/weight-trend',
  PROGRESS_PATTERNS: '/analytics/patterns',
  FOOD_SWAP: '/analytics/food-swap',
  CALORIE_STABILITY: '/analytics/calorie-stability',
  REPORTS_MONTHLY: '/reports/monthly',
  WEIGHT_LOG: '/weight',
  WEIGHT_HISTORY: '/weight/history',
  MEAL_PREVIEW: '/meals/preview',
} as const;
