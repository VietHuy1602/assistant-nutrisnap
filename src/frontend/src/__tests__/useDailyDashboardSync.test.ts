import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyDashboard } from '../hooks/useDailyDashboard';
import { dashboardApi } from '../api/dashboardApi';
import { emitMealLogged } from '../utils/mealEvents';

vi.mock('../api/dashboardApi', () => ({
  dashboardApi: {
    getDailyDashboard: vi.fn(),
  },
}));

const mockDashboardData = {
  date: '2026-10-24',
  goal: { calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65 },
  consumed: { calories: 800, protein_g: 60, carbs_g: 100, fat_g: 25 },
  remaining_calories: 1200,
  calorie_target: 2000,
  total_calories: 800,
  meals_summary: [{ meal_id: 1, meal_type: 'lunch', total_calories: 800 }],
};

describe('useDailyDashboard (Step 7 — Coalesced Refetch & Date Filter)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValue(mockDashboardData as any);
  });

  it('fetches dashboard on initial mount', async () => {
    const { result } = renderHook(() => useDailyDashboard('2026-10-24'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledWith('2026-10-24', expect.any(AbortSignal));
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual(mockDashboardData);
  });

  it('refetches when meal-logged event has matching date (after 300ms debounce)', async () => {
    const { result } = renderHook(() => useDailyDashboard('2026-10-24'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);

    // Emit event with matching date
    act(() => {
      emitMealLogged({ source: 'chat', date: '2026-10-24', mealId: 99 });
    });

    // Before 300ms, should NOT have called API again
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);

    // Fast forward 300ms debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(2);
    // Silent refetch must maintain status='ready' without skeleton
    expect(result.current.status).toBe('ready');
  });

  it('IGNORES meal-logged event when date is different from selectedDate', async () => {
    renderHook(() => useDailyDashboard('2026-10-24'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);

    // Emit event for yesterday
    act(() => {
      emitMealLogged({ source: 'chat', date: '2026-10-23', mealId: 88 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Must NOT call API because date does not match
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);
  });

  it('coalesces 3 rapid consecutive meal-logged events into exactly 1 refetch', async () => {
    renderHook(() => useDailyDashboard('2026-10-24'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);

    // Emit 3 events within 100ms intervals
    act(() => {
      emitMealLogged({ source: 'chat', date: '2026-10-24', mealId: 1 });
    });
    vi.advanceTimersByTime(100);

    act(() => {
      emitMealLogged({ source: 'chat', date: '2026-10-24', mealId: 2 });
    });
    vi.advanceTimersByTime(100);

    act(() => {
      emitMealLogged({ source: 'chat', date: '2026-10-24', mealId: 3 });
    });

    // Fast-forward past 300ms from last event
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Total calls should be exactly 2 (1 initial + 1 coalesced refetch)
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(2);
  });

  it('refetches when meal-logged event has no date (backwards compatibility)', async () => {
    renderHook(() => useDailyDashboard('2026-10-24'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);

    // Legacy event without detail or date
    act(() => {
      emitMealLogged();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(2);
  });
});
