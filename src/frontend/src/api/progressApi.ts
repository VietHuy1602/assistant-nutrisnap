/**
 * src/frontend/src/api/progressApi.ts
 * API Service for Progress Analytics, Weight Tracking, and Pattern Insights.
 * Section 8 Step 3 of NS-FE-W5-001.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import {
  normalizeWeightSeries,
  normalizePatternInsights,
  normalizeWeeklyCalories,
  type NormalizedWeightSeries,
  type NormalizedPatternInsights,
  type NormalizedCalorieBars,
} from './progressContract';

export const progressApi = {
  /**
   * Fetches the weight and EMA trend series for a specified number of days.
   */
  async getWeightSeries(
    rangeDays: number,
    signal?: AbortSignal,
  ): Promise<NormalizedWeightSeries> {
    const res = await apiClient.get(ENDPOINTS.PROGRESS_WEIGHT_TREND, {
      params: { days_range: rangeDays },
      signal,
    });
    return normalizeWeightSeries(res.data);
  },

  /**
   * Fetches user pattern insights (7 to 30 days bounded range).
   */
  async getPatternInsights(
    rangeDays = 14,
    signal?: AbortSignal,
  ): Promise<NormalizedPatternInsights> {
    const boundedDays = Math.min(30, Math.max(7, rangeDays));
    const res = await apiClient.get(ENDPOINTS.PROGRESS_PATTERNS, {
      params: { days_range: boundedDays },
      signal,
    });
    return normalizePatternInsights(res.data);
  },

  /**
   * Fetches calories data (either weekly aggregated or daily fallback points).
   */
  async getWeeklyCalories(
    rangeDays = 30,
    signal?: AbortSignal,
  ): Promise<NormalizedCalorieBars> {
    const res = await apiClient.get(ENDPOINTS.REPORTS_MONTHLY, {
      params: { days: rangeDays },
      signal,
    });
    return normalizeWeeklyCalories(res.data);
  },

  /**
   * Logs a new weight measurement (P2 optional capability).
   */
  async logWeight(
    weightKg: number,
    loggedDate?: string,
    notes?: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const res = await apiClient.post(
      ENDPOINTS.WEIGHT_LOG,
      {
        weight_kg: weightKg,
        logged_date: loggedDate,
        notes,
      },
      { signal },
    );
    return res.data;
  },
};
