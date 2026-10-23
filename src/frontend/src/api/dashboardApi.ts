/**
 * src/frontend/src/api/dashboardApi.ts
 * Daily Dashboard aggregation API (GET /api/v1/meals/daily-dashboard).
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { dailyDashboardResponseSchema } from './contracts';
import { parseResponse } from './parseResponse';
import type { DailyDashboardData } from '../types/api';

export const dashboardApi = {
  /**
   * Lấy tổng hợp tiến trình Calo, 3 thanh Macro và danh sách bữa ăn trong ngày.
   */
  async getDailyDashboard(dateStr?: string, signal?: AbortSignal): Promise<DailyDashboardData> {
    const params: Record<string, string> = {};
    if (dateStr) {
      params.target_date = dateStr;
    }

    const response = await apiClient.get<DailyDashboardData>(ENDPOINTS.DAILY_DASHBOARD, {
      params,
      signal,
    });

    const parsed = parseResponse(
      dailyDashboardResponseSchema,
      response.data,
      'GET /meals/daily-dashboard',
    );

    // Chuẩn hóa meals_summary = meals nếu server chỉ trả 1 trong 2
    return {
      ...parsed,
      meals: parsed.meals || [],
      meals_summary: parsed.meals_summary || parsed.meals || [],
    } as unknown as DailyDashboardData;
  },
};
