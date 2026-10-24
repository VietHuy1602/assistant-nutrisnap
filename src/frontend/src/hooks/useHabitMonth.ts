/**
 * src/frontend/src/hooks/useHabitMonth.ts
 * Hook quản lý trạng thái tải dữ liệu Habit Tracker & lắng nghe đồng bộ từ appBus.
 * Tuân thủ Zero-Math (M3) & Non-punitive (ADR-W6-11).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { habitApi } from '../api/habitApi';
import type { HabitStatus } from '../api/habitContract';
import type { CalendarMonth, HabitDay } from '../types/habit';
import { appBus } from '../app/appBus';
import { monthDates } from '../utils/habitCalendar';

export interface UseHabitMonthResult {
  habitStatus: HabitStatus | null;
  days: HabitDay[];
  loadState: 'loading' | 'ready' | 'error';
  errorMessage?: string;
  refetch: () => Promise<void>;
}

export function useHabitMonth(month: CalendarMonth, todayDateStr: string): UseHabitMonthResult {
  const [habitStatus, setHabitStatus] = useState<HabitStatus | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadState('loading');
    setErrorMessage(undefined);

    try {
      const data = await habitApi.getHabitStatus(controller.signal);
      setHabitStatus(data);
      setLoadState('ready');
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setLoadState('error');
      const message =
        err instanceof Error ? err.message : 'Không tải được dữ liệu thói quen từ máy chủ.';
      setErrorMessage(message);
    }
  }, []);

  // Lần đầu tải dữ liệu
  useEffect(() => {
    fetchStatus();

    // Lắng nghe sự kiện meal-logged hoặc habit-updated từ appBus để tự động làm mới
    const unsubMeal = appBus.on('meal-logged', () => {
      fetchStatus();
    });
    const unsubHabit = appBus.on('habit-updated', () => {
      fetchStatus();
    });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      unsubMeal();
      unsubHabit();
    };
  }, [fetchStatus]);

  // Chuyển đổi dữ liệu backend thành danh sách HabitDay[] theo tháng đang chọn
  const datesInSelectedMonth = monthDates(month);
  const loggedSet = new Set(habitStatus?.streak.loggedDatesLast7Days || []);

  const days: HabitDay[] = datesInSelectedMonth.map((dateStr) => {
    if (dateStr > todayDateStr) {
      return {
        date: dateStr,
        state: 'unavailable',
        reason: 'not-provided',
      };
    }

    if (loggedSet.has(dateStr)) {
      return {
        date: dateStr,
        state: 'completed',
        description: 'Đã hoàn thành mục tiêu ghi nhận trong ngày.',
      };
    }

    return {
      date: dateStr,
      state: 'unconfirmed',
      description: 'Chưa có nhật ký ghi nhận.',
    };
  });

  return {
    habitStatus,
    days,
    loadState,
    errorMessage,
    refetch: fetchStatus,
  };
}
