/**
 * src/frontend/src/api/mealApi.ts
 * Meal Ingestion & Two-Step Confirmation API (POST /api/v1/meals/log).
 * Tuyệt đối không tự tính toán calo/macro ở Frontend (ADR-W3-02).
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { mealLogResponseSchema } from './contracts';
import { parseResponse } from './parseResponse';
import type { MealItemInput, MealLogRequest, MealLogResponse } from '../types/api';

export interface MealDraftPayload {
  meal_type: string;
  items: MealItemInput[];
  image_path?: string | null;
  notes?: string | null;
}

export const mealApi = {
  /**
   * Bước 1: Tính toán trước Calo và Macro đại số từ Backend mà KHÔNG ghi CSDL.
   * is_confirmed = false -> Backend trả status: "pending_confirmation"
   */
  async previewMeal(draft: MealDraftPayload, signal?: AbortSignal): Promise<MealLogResponse> {
    const payload: MealLogRequest = {
      meal_type: draft.meal_type,
      items: draft.items,
      image_path: draft.image_path ?? null,
      notes: draft.notes ?? null,
      is_confirmed: false,
    };

    const response = await apiClient.post<MealLogResponse>(ENDPOINTS.MEAL_LOG, payload, { signal });
    return parseResponse(mealLogResponseSchema, response.data, 'POST /meals/log (preview)') as MealLogResponse;
  },

  /**
   * Bước 2: Xác nhận lưu nguyên tử vào CSDL sau khi người dùng kiểm tra xong.
   * is_confirmed = true -> Backend commit vào SQLite và trả status: "logged", HTTP 201
   */
  async logMeal(draft: MealDraftPayload, signal?: AbortSignal): Promise<MealLogResponse> {
    const payload: MealLogRequest = {
      meal_type: draft.meal_type,
      items: draft.items,
      image_path: draft.image_path ?? null,
      notes: draft.notes ?? null,
      is_confirmed: true,
    };

    const response = await apiClient.post<MealLogResponse>(ENDPOINTS.MEAL_LOG, payload, { signal });
    return parseResponse(mealLogResponseSchema, response.data, 'POST /meals/log (confirm)') as MealLogResponse;
  },

  /**
   * Xóa một bữa ăn đã ghi theo ID.
   */
  async deleteMeal(mealId: number): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete<{ success: boolean; message: string }>(ENDPOINTS.MEAL_DETAIL(mealId));
    return response.data;
  },
};
