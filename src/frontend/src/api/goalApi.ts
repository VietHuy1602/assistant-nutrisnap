/**
 * src/frontend/src/api/goalApi.ts
 * Goal Planner API module calling /goals with apiClient.
 */

import { apiClient } from './client';
import { GoalCreateRequest, GoalData } from '../types/api';

export const goalApi = {
  async getGoal(): Promise<GoalData> {
    const res = await apiClient.get<GoalData>('/goals');
    return res.data;
  },

  async saveGoal(data: GoalCreateRequest): Promise<GoalData> {
    const res = await apiClient.post<GoalData>('/goals', data);
    return res.data;
  },
};
