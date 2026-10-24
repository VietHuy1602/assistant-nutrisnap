/**
 * src/frontend/src/api/swapContract.ts
 * Tolerant Reader normalizers and schemas for Food Swap Simulator.
 * ADR-W5-04 / Section 16.6 of NS-FE-W5-001.
 */

import { z } from 'zod';

export const swapCandidateSchema = z.object({
  food_id: z.number().int().positive(),
  food_name: z.string().min(1).max(120),
  category: z.string().optional(),
  portion_gram: z.number().positive().default(250.0),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative().optional(),
  fat_g: z.number().nonnegative().optional(),
  estimated_price_vnd: z.number().int().optional(),
  delta_calories: z.number().optional(),
  delta_protein_g: z.number().optional(),
  delta_price_vnd: z.number().int().optional(),
});
export type SwapCandidate = z.infer<typeof swapCandidateSchema>;

export interface SourceFood {
  food_id: number;
  food_name: string;
  category?: string;
  portion_gram: number;
  calories: number;
  protein_g: number;
  estimated_price_vnd?: number;
}

export interface NormalizedSwapResponse {
  status: string;
  sourceFood: SourceFood | null;
  alternatives: SwapCandidate[];
  disclaimer: string;
  warnings: string[];
}

export function normalizeSwapResponse(raw: unknown): NormalizedSwapResponse {
  const warnings: string[] = [];
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // Normalize source food
  let sourceFood: SourceFood | null = null;
  const rawSrc = root.source_food && typeof root.source_food === 'object'
    ? (root.source_food as Record<string, unknown>)
    : null;

  if (rawSrc && typeof rawSrc.food_name === 'string') {
    sourceFood = {
      food_id: typeof rawSrc.food_id === 'number' ? rawSrc.food_id : 0,
      food_name: rawSrc.food_name,
      category: typeof rawSrc.category === 'string' ? rawSrc.category : undefined,
      portion_gram: typeof rawSrc.portion_gram === 'number' ? rawSrc.portion_gram : 250.0,
      calories: typeof rawSrc.calories === 'number' ? rawSrc.calories : 0,
      protein_g: typeof rawSrc.protein_g === 'number' ? rawSrc.protein_g : 0,
      estimated_price_vnd: typeof rawSrc.estimated_price_vnd === 'number' ? rawSrc.estimated_price_vnd : undefined,
    };
  }

  // Normalize alternatives
  const rawAlternatives = Array.isArray(root.alternatives)
    ? root.alternatives
    : Array.isArray(raw)
      ? raw
      : [];

  const alternatives: SwapCandidate[] = [];
  for (const item of rawAlternatives) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const parsed = swapCandidateSchema.safeParse({
        food_id: o.food_id,
        food_name: o.food_name,
        category: o.category,
        portion_gram: typeof o.portion_gram === 'number' ? o.portion_gram : 250.0,
        calories: typeof o.calories === 'number' ? o.calories : 0,
        protein_g: typeof o.protein_g === 'number' ? o.protein_g : 0,
        carbs_g: typeof o.carbs_g === 'number' ? o.carbs_g : undefined,
        fat_g: typeof o.fat_g === 'number' ? o.fat_g : undefined,
        estimated_price_vnd: typeof o.estimated_price_vnd === 'number' ? o.estimated_price_vnd : undefined,
        // Backend computes all deltas; fallback to calories_diff or undefined (Zero-Math: never compute in FE)
        delta_calories: typeof o.delta_calories === 'number'
          ? o.delta_calories
          : (typeof o.calories_diff === 'number' ? o.calories_diff : undefined),
        delta_protein_g: typeof o.delta_protein_g === 'number'
          ? o.delta_protein_g
          : (typeof o.protein_diff_g === 'number' ? o.protein_diff_g : undefined),
        delta_price_vnd: typeof o.delta_price_vnd === 'number'
          ? o.delta_price_vnd
          : (typeof o.price_diff_vnd === 'number' ? o.price_diff_vnd : undefined),
      });

      if (parsed.success) {
        alternatives.push(parsed.data);
      } else {
        warnings.push(...parsed.error.issues.map((i) => `alt.${i.path.join('.')}:${i.code}`));
      }
    }
  }

  return {
    status: typeof root.status === 'string' ? root.status : 'success',
    sourceFood,
    alternatives,
    disclaimer: typeof root.disclaimer === 'string' ? root.disclaimer : '',
    warnings,
  };
}
