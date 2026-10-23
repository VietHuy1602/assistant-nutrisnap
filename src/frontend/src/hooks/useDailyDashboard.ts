/**
 * src/frontend/src/hooks/useDailyDashboard.ts
 * Hook tải và tự động đồng bộ dữ liệu Daily Dashboard.
 * Lắng nghe CustomEvent 'nutrisnap:meal-logged' để tự refetch khi có bữa ăn mới.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardApi } from '../api/dashboardApi';
import { toLocalISODate } from '../utils/date';
import { onMealLogged } from '../utils/mealEvents';
import type { DailyDashboardData } from '../types/api';

export type DashboardStatus = 'loading' | 'ready' | 'empty' | 'noGoal' | 'error';

export interface UseDailyDashboardReturn {
  data: DailyDashboardData | null;
  status: DashboardStatus;
  error: string | null;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  refetch: () => Promise<void>;
}

export function useDailyDashboard(initialDate?: string): UseDailyDashboardReturn {
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate || toLocalISODate(new Date()),
  );
  const [data, setData] = useState<DailyDashboardData | null>(null);
  const [status, setStatus] = useState<DashboardStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const loadData = useCallback(async (dateToFetch: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('loading');
    setError(null);

    try {
      const result = await dashboardApi.getDailyDashboard(dateToFetch, controller.signal);

      if (!isMountedRef.current || abortControllerRef.current !== controller) return;

      setData(result);

      // Xác định trạng thái hiển thị
      const meals = result.meals_summary || result.meals || [];
      if (meals.length === 0) {
        setStatus('empty');
      } else {
        setStatus('ready');
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || abortControllerRef.current !== controller) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;

      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu tiến trình dinh dưỡng.';
      setError(msg);
      setStatus('error');
    } finally {
      if (isMountedRef.current && abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void loadData(selectedDate);
  }, [selectedDate, loadData]);

  // Tự động lắng nghe sự kiện meal-logged từ MealCaptureFlow hoặc AssistantChatDrawer
  useEffect(() => {
    const unsubscribe = onMealLogged(() => {
      void loadData(selectedDate);
    });
    return unsubscribe;
  }, [selectedDate, loadData]);

  const refetch = useCallback(async () => {
    await loadData(selectedDate);
  }, [selectedDate, loadData]);

  return {
    data,
    status,
    error,
    selectedDate,
    setSelectedDate,
    refetch,
  };
}
