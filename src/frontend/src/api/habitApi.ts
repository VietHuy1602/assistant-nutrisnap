/**
 * src/frontend/src/api/habitApi.ts
 * API Service for Habit Tracker endpoints (/api/v1/habits/status).
 * Tuân thủ Zero-Trust (M1): sử dụng apiClient kèm HttpOnly Cookie.
 * Tuân thủ Zero-Math (M3): toàn bộ dữ liệu đi qua Tolerant Reader normalizer.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { normalizeHabitStatus, type HabitStatus } from './habitContract';

export const habitApi = {
  /**
   * Lấy thông tin trạng thái thói quen, chuỗi ngày, thử thách 7 ngày và back-on-track.
   */
  async getHabitStatus(signal?: AbortSignal): Promise<HabitStatus> {
    const res = await apiClient.get(ENDPOINTS.HABITS_STATUS, { signal });
    return normalizeHabitStatus(res.data);
  },
};
