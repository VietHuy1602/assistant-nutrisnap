/**
 * src/frontend/src/api/swapApi.ts
 * API Client for Food Swap Simulator (simulate_food_swap).
 * Zero-Math: Backend computes all swaps and deltas; frontend normalizes response.
 * ADR-W5-01, ADR-W5-04 of NS-FE-W5-001.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import {
  normalizeSwapResponse,
  type NormalizedSwapResponse,
} from './swapContract';

export type SwapGoal = 'reduce_calories' | 'high_protein' | 'balanced_saver';

export interface SwapParams {
  currentFoodId?: number;
  currentFoodName?: string;
  portionGram?: number;
  swapGoal: SwapGoal;
  maxBudgetVnd?: number;
  sameCategoryOnly?: boolean;
  limit?: number;
}

export const swapApi = {
  /**
   * Request deterministic food swap candidates and deltas from backend.
   */
  async getSwapAlternatives(
    params: SwapParams,
    signal?: AbortSignal,
  ): Promise<NormalizedSwapResponse> {
    const res = await apiClient.post(
      ENDPOINTS.FOOD_SWAP,
      {
        current_food_id: params.currentFoodId,
        current_food_name: params.currentFoodName,
        portion_gram: params.portionGram ?? 250.0,
        swap_goal: params.swapGoal,
        max_budget_vnd: params.maxBudgetVnd,
        same_category_only: params.sameCategoryOnly ?? false,
        limit: params.limit ?? 5,
      },
      { signal },
    );
    return normalizeSwapResponse(res.data);
  },
};
