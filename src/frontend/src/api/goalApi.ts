/**
 * src/frontend/src/api/goalApi.ts
 * Goal Planner API module calling /goals with apiClient.
 */

import { apiClient } from './client';
import { GoalCreateRequest, GoalData } from '../types/api';
import { parseResponse } from './parseResponse';
import { goalResponseSchema } from './contracts';

export const goalApi = {
  async getGoal(): Promise<GoalData> {
    const res = await apiClient.get<GoalData>('/goals');
    return parseResponse(goalResponseSchema, res.data, 'GET /goals');
  },

  async saveGoal(data: GoalCreateRequest): Promise<GoalData> {
    const res = await apiClient.post<GoalData>('/goals', data);
    return parseResponse(goalResponseSchema, res.data, 'POST /goals');
  },
};
