/**
 * src/frontend/src/__tests__/useProgressAnalytics.test.ts
 * Tests for useProgressAnalytics hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgressAnalytics } from '../hooks/useProgressAnalytics';
import { progressApi } from '../api/progressApi';
import { emitMealLogged } from '../utils/mealEvents';
import {
  mockWeightSeriesWithEma,
  mockWeightSeriesWithoutEma,
  mockPatternInsightsAnalyzed,
} from './fixtures/analytics';
import { normalizeWeightSeries, normalizePatternInsights, normalizeWeeklyCalories } from '../api/progressContract';

vi.mock('../api/progressApi', () => ({
  progressApi: {
    getWeightSeries: vi.fn(),
    getPatternInsights: vi.fn(),
    getWeeklyCalories: vi.fn(),
    logWeight: vi.fn(),
  },
}));

describe('useProgressAnalytics hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    vi.mocked(progressApi.getWeightSeries).mockResolvedValue(
      normalizeWeightSeries(mockWeightSeriesWithEma),
    );
    vi.mocked(progressApi.getPatternInsights).mockResolvedValue(
      normalizePatternInsights(mockPatternInsightsAnalyzed),
    );
    vi.mocked(progressApi.getWeeklyCalories).mockResolvedValue(
      normalizeWeeklyCalories({
        weeks: [{ week_start: '2026-10-10', calories: 12000, days_logged: 7 }],
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in loading state and transitions to ready after debounce and resolve', async () => {
    const { result } = renderHook(() => useProgressAnalytics(14));

    expect(result.current.weightStatus).toBe('loading');

    // Advance through 250ms debounce
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(progressApi.getWeightSeries).toHaveBeenCalledWith(14, expect.any(AbortSignal));
    expect(result.current.weightStatus).toBe('ready');
    expect(result.current.trendStatus).toBe('available');
    expect(result.current.weightData?.points).toHaveLength(5);
  });

  it('correctly reports trendStatus as unavailable in Mode A', async () => {
    vi.mocked(progressApi.getWeightSeries).mockResolvedValue(
      normalizeWeightSeries(mockWeightSeriesWithoutEma),
    );

    const { result } = renderHook(() => useProgressAnalytics(14));

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.trendStatus).toBe('unavailable');
  });

  it('debounces range changes by 250ms and maintains previous data during refresh', async () => {
    const { result } = renderHook(() => useProgressAnalytics(14));

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.weightData?.points).toHaveLength(5);

    // Change range
    act(() => {
      result.current.setRangeDays(30);
    });

    // Advance 100ms (not yet 250ms) -> should not have called for 30 yet
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(progressApi.getWeightSeries).not.toHaveBeenCalledWith(30, expect.any(AbortSignal));

    // Advance remaining 150ms
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(progressApi.getWeightSeries).toHaveBeenCalledWith(30, expect.any(AbortSignal));
  });

  it('handles isolated errors without breaking other data sections', async () => {
    vi.mocked(progressApi.getWeeklyCalories).mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useProgressAnalytics(14));

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.weightStatus).toBe('ready');
    expect(result.current.caloriesStatus).toBe('error');
    expect(result.current.caloriesError).toBe('Network failure');
  });

  it('refetches when meal-logged event is emitted', async () => {
    renderHook(() => useProgressAnalytics(14));

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(progressApi.getWeeklyCalories).toHaveBeenCalledTimes(1);

    // Emit meal-logged event
    act(() => {
      emitMealLogged({ source: 'capture' });
    });

    // Advance coalesced 300ms event debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(progressApi.getWeeklyCalories).toHaveBeenCalledTimes(2);
  });
});
