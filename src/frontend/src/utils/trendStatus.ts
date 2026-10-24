/**
 * src/frontend/src/utils/trendStatus.ts
 * Classifies EMA data availability status into available, partial, or unavailable.
 * ADR-W5-02 & Section 16.1 of NS-FE-W5-001.
 */

import type { WeightPoint } from '../api/progressContract';

export type TrendStatus = 'available' | 'partial' | 'unavailable';

/**
 * Pure classifier checking whether EMA points exist in the series.
 * // zero-math-ok: purely classifies presence of data without computing health stats
 */
export function trendStatus(points: readonly WeightPoint[]): TrendStatus {
  if (!points || points.length === 0) return 'unavailable';

  // zero-math-ok: counting items with defined ema_weight
  const withEma = points.filter(
    (p) => typeof p.ema_weight === 'number' && Number.isFinite(p.ema_weight),
  ).length;

  if (withEma === 0) return 'unavailable';
  if (withEma === points.length) return 'available';
  return 'partial';
}
