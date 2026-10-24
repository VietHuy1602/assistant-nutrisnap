/**
 * src/frontend/src/hooks/useDailyDashboard.ts
 * Hook tải và tự động đồng bộ dữ liệu Daily Dashboard.
 * Lắng nghe CustomEvent 'nutrisnap:meal-logged' để tự refetch khi có bữa ăn mới.
 * Tuân thủ Step 7:
 * - Kiểm tra đúng ngày (detail.date !== selectedDate -> bỏ qua).
 * - Debounce 300ms gộp các sự kiện liên tiếp thành một lần refetch.
 * - Làm mới êm (silent refetch: không bật skeleton, giữ layout ổn định).
 * - Performance mark 'ns:dash:ring-updated' để đo thời gian đồng bộ.
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
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const loadData = useCallback(async (dateToFetch: string, silent = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Làm mới êm: Giữ nguyên dữ liệu cũ, không giật skeleton nếu là silent refetch
    if (!silent) {
      setStatus('loading');
    }
    setError(null);

    try {
      const result = await dashboardApi.getDailyDashboard(dateToFetch, controller.signal);

      if (!isMountedRef.current || abortControllerRef.current !== controller) return;

      setData(result);

      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        try {
          performance.mark('ns:dash:ring-updated');
        } catch {
          // ignore mark error
        }
      }

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
      if (!silent) {
        setStatus('error');
      }
    } finally {
      if (isMountedRef.current && abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void loadData(selectedDate, false);
  }, [selectedDate, loadData]);

  // Tự động lắng nghe sự kiện meal-logged từ chat hoặc capture flow
  useEffect(() => {
    const unsubscribe = onMealLogged((event) => {
      const detail = event?.detail;
      // 1. Kiểm tra ngày: nếu có date và khác ngày đang xem -> bỏ qua
      if (detail?.date && detail.date !== selectedDate) {
        return;
      }

      // 2. Coalescing: Gộp debounce 300ms thành một lần gọi refetch êm
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void loadData(selectedDate, true);
      }, 300);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [selectedDate, loadData]);

  const refetch = useCallback(async () => {
    await loadData(selectedDate, false);
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
