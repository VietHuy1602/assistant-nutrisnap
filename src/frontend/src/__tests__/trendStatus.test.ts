/**
 * src/frontend/src/__tests__/trendStatus.test.ts
 * Tests for EMA trendStatus classifier.
 */

import { describe, it, expect } from 'vitest';
import { trendStatus } from '../utils/trendStatus';
import type { WeightPoint } from '../api/progressContract';

describe('trendStatus classifier', () => {
  it('returns "unavailable" when points array is empty', () => {
    expect(trendStatus([])).toBe('unavailable');
  });

  it('returns "unavailable" when no point has ema_weight', () => {
    const points: WeightPoint[] = [
      { date: '2026-10-10', weight_kg: 68.0, ema_weight: null },
      { date: '2026-10-11', weight_kg: 68.1, ema_weight: null },
    ];
    expect(trendStatus(points)).toBe('unavailable');
  });

  it('returns "available" when all points have defined ema_weight', () => {
    const points: WeightPoint[] = [
      { date: '2026-10-10', weight_kg: 68.0, ema_weight: 68.0 },
      { date: '2026-10-11', weight_kg: 68.1, ema_weight: 68.01 },
    ];
    expect(trendStatus(points)).toBe('available');
  });

  it('returns "partial" when some points have ema_weight and others are null', () => {
    const points: WeightPoint[] = [
      { date: '2026-10-10', weight_kg: 68.0, ema_weight: null },
      { date: '2026-10-11', weight_kg: 68.1, ema_weight: 68.05 },
    ];
    expect(trendStatus(points)).toBe('partial');
  });
});
