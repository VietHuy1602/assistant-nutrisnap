/**
 * src/frontend/src/api/contracts.ts
 * Zod validation schemas for API responses following Postel's Law (Tolerant Reader).
 * Bắt buộc các trường UI cốt lõi; cho phép các trường optional/default từ Backend mock/thật.
 * Bỏ qua (strip) các trường thừa không ảnh hưởng đến giao diện người dùng.
 */

import { z } from 'zod';

export const userPublicSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  created_at: z.string().optional(), // docs/02 §4.1 không đảm bảo có trường này ở endpoint login
});

export const authResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().default(''),
  has_goal: z.boolean().default(false),
  user: userPublicSchema,
});

export const goalResponseSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  target_weight: z.number(),
  bmr_calories: z.number(),
  tdee_calories: z.number(),        // UI bắt buộc
  target_calories: z.number(),
  target_protein_g: z.number(),     // UI bắt buộc
  target_carbs_g: z.number(),       // UI bắt buộc
  target_fat_g: z.number(),         // UI bắt buộc
  daily_budget_vnd: z.number(),
  disclaimer: z.string().default(''),
});

export const baseResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().default(''),
  disclaimer: z.string().default(''),
});

export type UserPublicValidated = z.infer<typeof userPublicSchema>;
export type AuthResponseValidated = z.infer<typeof authResponseSchema>;
export type GoalResponseValidated = z.infer<typeof goalResponseSchema>;
export type BaseResponseValidated = z.infer<typeof baseResponseSchema>;

// ==============================================================================
// W3 PoC: ZOD SCHEMAS FOR RECOGNITION, MEAL LOGGING & DASHBOARD
// ==============================================================================

export const macroDetailSchema = z.object({
  consumed: z.number().default(0),
  target: z.number().default(0),
  unit: z.string().default('g'),
  progress_percent: z.number().default(0),
});

export const recognizedFoodItemSchema = z.object({
  food_id: z.number().nullable().optional(),
  food_name: z.string(),
  matched_name: z.string().nullable().optional(),
  match_score: z.number().optional(),
  is_matched: z.boolean().default(true),
  estimated_gram: z.number(),
  estimated_calories: z.number().default(0),
  protein_g: z.number().default(0),
  carbs_g: z.number().default(0),
  fat_g: z.number().default(0),
  confidence: z.number().default(1),
  nutrition_source: z.enum(['database', 'usda', 'ai_estimate']).nullable().optional(),
});

export const recognizeFoodResponseSchema = z.object({
  success: z.boolean().default(true),
  status: z.enum(['pending_confirmation', 'unrecognized']).default('pending_confirmation'),
  meal_type: z.string().default('lunch'),
  detected_items: z.array(recognizedFoodItemSchema).default([]),
  total_estimated_calories: z.number().default(0),
  is_fallback: z.boolean().default(false),
  message: z.string().default(''),
  reason: z.enum(['not_food', 'unclear', 'service_error']).nullable().optional(),
  disclaimer: z.string().default(''),
});

export const calculatedMealItemSchema = z.object({
  food_id: z.number(),
  food_name: z.string(),
  estimated_gram: z.number(),
  eaten_ratio: z.number().default(1.0),
  effective_gram: z.number().default(0),
  calories: z.number().default(0),
  protein_g: z.number().default(0),
  carbs_g: z.number().default(0),
  fat_g: z.number().default(0),
  estimated_price_vnd: z.number().default(0),
});

export const nutritionCalculationResultSchema = z.object({
  items: z.array(calculatedMealItemSchema).default([]),
  total_weight_g: z.number().default(0),
  total_calories: z.number().default(0),
  total_protein_g: z.number().default(0),
  total_carbs_g: z.number().default(0),
  total_fat_g: z.number().default(0),
  total_estimated_price_vnd: z.number().default(0),
  disclaimer: z.string().default(''),
});

export const mealLogResponseSchema = z.object({
  status: z.enum(['pending_confirmation', 'logged']),
  meal_id: z.number().nullable().optional(),
  meal_type: z.string().default(''),
  logged_at: z.string().default(''),
  nutrition: nutritionCalculationResultSchema,
  disclaimer: z.string().default(''),
  success: z.boolean().default(true),
  total_calories: z.number().nullable().optional(),
});

export const foodReferenceItemSchema = z.object({
  id: z.number(),
  food_name: z.string(),
  calories_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
  avg_price_vnd: z.number().default(0),
});

export const foodSearchResponseSchema = z.object({
  total: z.number().default(0),
  items: z.array(foodReferenceItemSchema).default([]),
});

export const dailyDashboardMealItemSchema = z.object({
  id: z.number().optional(),
  food_id: z.number().optional(),
  food_name: z.string().default('Món ăn'),
  estimated_gram: z.number().default(0),
  calories: z.number().default(0),
  estimated_calories: z.number().optional(),
  protein_g: z.number().optional(),
  carbs_g: z.number().optional(),
  fat_g: z.number().optional(),
  estimated_price_vnd: z.number().optional(),
});

export const dailyDashboardMealSchema = z.object({
  id: z.number(),
  meal_type: z.string(),
  logged_at: z.string().default(''),
  image_path: z.string().nullable().optional(),
  total_calories: z.number().default(0),
  total_protein_g: z.number().optional(),
  total_carbs_g: z.number().optional(),
  total_fat_g: z.number().optional(),
  items: z.array(dailyDashboardMealItemSchema).default([]),
});

export const dailyDashboardResponseSchema = z.object({
  date: z.string().default(''),
  target_calories: z.number().default(2000),
  consumed_calories: z.number().default(0),
  remaining_calories: z.number().default(0),
  calories_progress_percent: z.number().default(0),
  macros: z.object({
    protein: macroDetailSchema,
    carbs: macroDetailSchema,
    fat: macroDetailSchema,
  }),
  meals: z.array(dailyDashboardMealSchema).default([]),
  meals_summary: z.array(dailyDashboardMealSchema).optional(),
  disclaimer: z.string().default(''),
});

export type RecognizeFoodResponseValidated = z.infer<typeof recognizeFoodResponseSchema>;
export type MealLogResponseValidated = z.infer<typeof mealLogResponseSchema>;
export type FoodSearchResponseValidated = z.infer<typeof foodSearchResponseSchema>;
export type DailyDashboardResponseValidated = z.infer<typeof dailyDashboardResponseSchema>;
