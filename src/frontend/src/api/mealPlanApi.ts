/**
 * src/frontend/src/api/mealPlanApi.ts
 * Thực đơn gợi ý: tạo, đổi món không thích, lưu thực đơn đã đồng ý. Số liệu do backend tính sẵn.
 */

import { apiClient } from './client';

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface PlanItem {
  food_id: number;
  food_name: string;
  role: 'main' | 'rice' | 'protein' | 'veg' | 'soup' | 'snack' | 'side';
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  price_vnd: number;
}

export interface PlanTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  price_vnd: number;
}

export interface PlanMeal {
  meal_type: MealType;
  label: string;
  items: PlanItem[];
  totals: PlanTotals;
  target_calories: number;
}

export interface PlanDay {
  date: string;
  meals: PlanMeal[];
  totals: PlanTotals;
}

export interface Recipe {
  food_id: number;
  food_name: string;
  servings: number;
  time_minutes: number;
  difficulty: string;
  ingredients: Array<{ name: string; amount: string }>;
  steps: string[];
  tip?: string;
}

export type ReplaceReason = 'taste' | 'ingredient' | 'allergy' | 'too_heavy' | 'too_expensive' | 'hard_to_cook' | 'ate_recently' | 'other';

export const REPLACE_REASONS: Array<{ key: ReplaceReason; label: string; icon: string }> = [
  { key: 'taste', label: 'Không hợp khẩu vị', icon: '😕' },
  { key: 'ingredient', label: 'Không thích nguyên liệu chính', icon: '🥩' },
  { key: 'allergy', label: 'Dị ứng / không ăn được', icon: '⚠️' },
  { key: 'too_heavy', label: 'Nhiều calo, nhiều dầu mỡ', icon: '🍟' },
  { key: 'too_expensive', label: 'Giá quá cao', icon: '💸' },
  { key: 'hard_to_cook', label: 'Khó nấu, mất thời gian', icon: '⏱️' },
  { key: 'ate_recently', label: 'Mới ăn gần đây', icon: '🔁' },
  { key: 'other', label: 'Lý do khác', icon: '✏️' },
];

export interface MealPlan {
  start_date: string;
  days: number;
  target_calories: number;
  target_protein_g: number;
  goal_type: string;
  daily_budget_vnd: number;
  plan: PlanDay[];
  disclaimer: string;
  replace_message?: string;
}

export const mealPlanApi = {
  async generate(days: number): Promise<MealPlan> {
    const res = await apiClient.post<MealPlan>('/meal-plan/generate', { days });
    return res.data;
  },
  async replace(plan: MealPlan, dayIndex: number, mealType: MealType, foodId: number, reason: ReplaceReason = 'taste', note?: string): Promise<MealPlan> {
    const { replace_message: _ignored, ...clean } = plan;
    const res = await apiClient.post<MealPlan>('/meal-plan/replace', { plan: clean, day_index: dayIndex, meal_type: mealType, food_id: foodId, reason, note });
    return res.data;
  },
  async regenerateDays(plan: MealPlan, dayIndexes: number[]): Promise<MealPlan> {
    const { replace_message: _ignored, ...clean } = plan;
    const res = await apiClient.post<MealPlan>('/meal-plan/regenerate-days', { plan: clean, day_indexes: dayIndexes });
    return res.data;
  },
  async recipe(foodId: number): Promise<Recipe> {
    const res = await apiClient.get<Recipe>(`/meal-plan/recipe/${foodId}`);
    return res.data;
  },
  async accept(plan: MealPlan): Promise<void> {
    await apiClient.post('/meal-plan/accept', { plan });
  },
  async current(): Promise<MealPlan | null> {
    const res = await apiClient.get<{ plan: MealPlan | null }>('/meal-plan/current');
    return res.data.plan;
  },
};
