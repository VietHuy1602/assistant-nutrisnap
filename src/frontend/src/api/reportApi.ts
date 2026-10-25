/**
 * src/frontend/src/api/reportApi.ts
 * API Service for Monthly Nutrition & Habit Reports (/api/v1/reports/monthly).
 * Tuân thủ Zero-Trust (M1) & Zero-Math (M3).
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { normalizeMonthlyReport, type MonthlyReport } from './reportContract';
import { parseMonthKey } from '../utils/month';

export const reportApi = {
  /**
   * Lấy báo cáo tổng hợp tháng từ Backend theo định dạng YYYY-MM.
   * Chuyển đổi an toàn YYYY-MM thành year và month integer cho Backend Query (AS-3).
   */
  async getMonthly(monthKey: string, signal?: AbortSignal): Promise<MonthlyReport> {
    const parsed = parseMonthKey(monthKey);
    const params: Record<string, number> = {};
    if (parsed) {
      params.year = parsed.year;
      params.month = parsed.month;
    }

    const res = await apiClient.get(ENDPOINTS.REPORTS_MONTHLY, {
      params,
      signal,
    });

    return normalizeMonthlyReport(res.data, monthKey);
  },
};
