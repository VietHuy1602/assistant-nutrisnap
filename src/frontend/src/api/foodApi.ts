/**
 * src/frontend/src/api/foodApi.ts
 * Reference Food Database API (GET /api/v1/foods/search).
 * Tra cứu nhanh danh mục món ăn Việt Nam từ bảng food_references.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { foodSearchResponseSchema } from './contracts';
import { parseResponse } from './parseResponse';
import type { FoodSearchResponse } from '../types/api';

export const foodApi = {
  /**
   * Tìm kiếm món ăn theo từ khóa tiếng Việt (có dấu hoặc không dấu).
   */
  async searchFoods(query: string, signal?: AbortSignal): Promise<FoodSearchResponse> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { total: 0, items: [] };
    }

    const response = await apiClient.get<FoodSearchResponse>(ENDPOINTS.FOOD_SEARCH, {
      params: { q: cleanQuery },
      signal,
    });

    return parseResponse(foodSearchResponseSchema, response.data, 'GET /foods/search') as FoodSearchResponse;
  },
};
