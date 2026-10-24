/**
 * src/frontend/src/api/voiceContract.ts
 * Schemas and Tolerant Reader normalizers for Voice Note / Modifier flow.
 * ADR-W5-05 & ADR-W5-06 of NS-FE-W5-001.
 */

import { z } from 'zod';

export const voiceNoteRequestSchema = z.object({
  note: z.string().max(1000),
  items: z
    .array(
      z.object({
        food_id: z.number().nullable().optional(),
        food_name: z.string(),
        estimated_gram: z.number().positive(),
      }),
    )
    .optional(),
});
export type VoiceNoteRequest = z.infer<typeof voiceNoteRequestSchema>;

export interface AdjustedDishItem {
  food_id: number | null;
  food_name: string;
  estimated_gram: number;
  calories?: number;
  source?: 'voice' | 'manual' | 'ai';
}

export interface NormalizedVoiceResult {
  success: boolean;
  note: string;
  adjustedItems?: AdjustedDishItem[];
  modifiersSummary?: string;
  warnings: string[];
}

export function normalizeVoiceResult(raw: unknown, originalNote = ''): NormalizedVoiceResult {
  const warnings: string[] = [];
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const note = typeof root.note === 'string' ? root.note : originalNote;
  const summary = typeof root.modifiers_summary === 'string'
    ? root.modifiers_summary
    : (typeof root.summary === 'string' ? root.summary : undefined);

  let adjustedItems: AdjustedDishItem[] | undefined = undefined;
  const rawItems = Array.isArray(root.items)
    ? root.items
    : (Array.isArray(root.adjusted_dishes) ? root.adjusted_dishes : undefined);

  if (Array.isArray(rawItems)) {
    adjustedItems = [];
    for (const item of rawItems) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const name = typeof o.food_name === 'string' ? o.food_name : (typeof o.name === 'string' ? o.name : '');
        const gram = typeof o.estimated_gram === 'number' ? o.estimated_gram : (typeof o.gram === 'number' ? o.gram : 100);
        if (name) {
          adjustedItems.push({
            food_id: typeof o.food_id === 'number' ? o.food_id : null,
            food_name: name,
            estimated_gram: gram,
            calories: typeof o.calories === 'number' ? o.calories : undefined,
            source: 'voice',
          });
        }
      }
    }
  }

  return {
    success: root.success !== false,
    note,
    adjustedItems,
    modifiersSummary: summary,
    warnings,
  };
}
