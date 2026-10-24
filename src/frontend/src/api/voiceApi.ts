/**
 * src/frontend/src/api/voiceApi.ts
 * API Service for Voice Modifier Notes & Preview.
 * Zero-Math: All nutritional calculations are handled by backend preview endpoint.
 * ADR-W5-05 & ADR-W5-06 of NS-FE-W5-001.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import {
  normalizeVoiceResult,
  type NormalizedVoiceResult,
} from './voiceContract';

export interface ParseVoiceModifierParams {
  note: string;
  items?: Array<{
    food_id?: number | null;
    food_name: string;
    estimated_gram: number;
  }>;
}

export const voiceApi = {
  /**
   * Sends voice note text to preview endpoint with voice_modifier_text (Strategy V1).
   * Tolerant Fallback: If preview has no modifier engine, preserves user's text note directly.
   */
  async parseVoiceModifier(
    params: ParseVoiceModifierParams,
    signal?: AbortSignal,
  ): Promise<NormalizedVoiceResult> {
    const { note, items } = params;
    try {
      const res = await apiClient.post(
        ENDPOINTS.MEAL_PREVIEW,
        {
          items: items?.map((it) => ({
            food_name: it.food_name,
            estimated_gram: it.estimated_gram,
            food_id: it.food_id ?? null,
          })) ?? [],
          voice_modifier_text: note,
          notes: note,
        },
        { signal },
      );
      return normalizeVoiceResult(res.data, note);
    } catch {
      // Tolerant fallback: gracefully preserve text note without failing the user experience
      return normalizeVoiceResult({ success: true, note }, note);
    }
  },
};
