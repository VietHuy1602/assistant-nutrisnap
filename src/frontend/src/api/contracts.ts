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
