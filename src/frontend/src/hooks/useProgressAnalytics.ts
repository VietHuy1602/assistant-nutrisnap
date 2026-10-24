/**
 * src/frontend/src/hooks/useProgressAnalytics.ts
 * Hook managing progress data fetching (Weight series, Weekly calories, Pattern insights).
 * Features: 3 independent parallel requests, 250ms debounce on range change,
 * preserving previous data during refreshes (isRefreshing), and coalesced refetch on meal-logged.
 * ADR-W5-01, ADR-W5-02, ADR-W5-10 of NS-FE-W5-001.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { progressApi } from '../api/progressApi';
import type {
  NormalizedWeightSeries,
  NormalizedPatternInsights,
  NormalizedCalorieBars,
} from '../api/progressContract';
import { trendStatus, type TrendStatus } from '../utils/trendStatus';
import { onMealLogged } from '../utils/mealEvents';

export type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface ProgressAnalyticsState {
  rangeDays: number;
  isRefreshing: boolean;
  weightStatus: LoadStatus;
  weightData: NormalizedWeightSeries | null;
  weightError?: string;
  trendStatus: TrendStatus;
  caloriesStatus: LoadStatus;
  caloriesData: NormalizedCalorieBars | null;
  caloriesError?: string;
  insightsStatus: LoadStatus;
  insightsData: NormalizedPatternInsights | null;
  insightsError?: string;
}

export function useProgressAnalytics(initialRangeDays = 14) {
  const [rangeDays, setRangeDays] = useState(initialRangeDays);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [weightStatus, setWeightStatus] = useState<LoadStatus>('loading');
  const [weightData, setWeightData] = useState<NormalizedWeightSeries | null>(null);
  const [weightError, setWeightError] = useState<string | undefined>();

  const [caloriesStatus, setCaloriesStatus] = useState<LoadStatus>('loading');
  const [caloriesData, setCaloriesData] = useState<NormalizedCalorieBars | null>(null);
  const [caloriesError, setCaloriesError] = useState<string | undefined>();

  const [insightsStatus, setInsightsStatus] = useState<LoadStatus>('loading');
  const [insightsData, setInsightsData] = useState<NormalizedPatternInsights | null>(null);
  const [insightsError, setInsightsError] = useState<string | undefined>();

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (targetRange: number, isInitial = false) => {
    // Cancel in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    if (!isInitial) {
      setIsRefreshing(true);
    } else {
      setWeightStatus('loading');
      setCaloriesStatus('loading');
      setInsightsStatus('loading');
    }

    // 1. Fetch Weight Series
    const fetchWeights = progressApi
      .getWeightSeries(targetRange, signal)
      .then((data) => {
        if (signal.aborted) return;
        setWeightData(data);
        setWeightError(undefined);
        setWeightStatus(data.points.length === 0 ? 'empty' : 'ready');
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setWeightError(err instanceof Error ? err.message : 'Không tải được cân nặng');
        setWeightStatus('error');
      });

    // 2. Fetch Weekly/Daily Calories
    const fetchCalories = progressApi
      .getWeeklyCalories(targetRange, signal)
      .then((data) => {
        if (signal.aborted) return;
        setCaloriesData(data);
        setCaloriesError(undefined);
        setCaloriesStatus(data.bars.length === 0 ? 'empty' : 'ready');
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setCaloriesError(err instanceof Error ? err.message : 'Không tải được calo');
        setCaloriesStatus('error');
      });

    // 3. Fetch Pattern Insights (bounded to 7-30 days)
    const fetchInsights = progressApi
      .getPatternInsights(targetRange, signal)
      .then((data) => {
        if (signal.aborted) return;
        setInsightsData(data);
        setInsightsError(undefined);
        setInsightsStatus('ready');
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setInsightsError(err instanceof Error ? err.message : 'Không tải được nhận xét');
        setInsightsStatus('error');
      });

    try {
      await Promise.allSettled([fetchWeights, fetchCalories, fetchInsights]);
    } finally {
      if (!signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, []);

  const isInitialMountRef = useRef(true);

  // Fetch when range changes (debounced by 250ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const isInitial = isInitialMountRef.current;
    debounceTimerRef.current = setTimeout(() => {
      isInitialMountRef.current = false;
      void fetchData(rangeDays, isInitial);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [rangeDays, fetchData]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Coalesced refetch on meal-logged event (gộp 300ms)
  useEffect(() => {
    const unsubscribe = onMealLogged(() => {
      if (eventDebounceTimerRef.current) {
        clearTimeout(eventDebounceTimerRef.current);
      }
      eventDebounceTimerRef.current = setTimeout(() => {
        void fetchData(rangeDays, false);
      }, 300);
    });

    return () => {
      unsubscribe();
      if (eventDebounceTimerRef.current) {
        clearTimeout(eventDebounceTimerRef.current);
      }
    };
  }, [rangeDays, fetchData]);

  const refetch = useCallback(() => {
    void fetchData(rangeDays, false);
  }, [rangeDays, fetchData]);

  // Compute trend status purely from presence of EMA points (no client-side math)
  const currentTrendStatus = trendStatus(weightData?.points ?? []);

  return {
    rangeDays,
    setRangeDays,
    isRefreshing,
    weightStatus,
    weightData,
    weightError,
    trendStatus: currentTrendStatus,
    caloriesStatus,
    caloriesData,
    caloriesError,
    insightsStatus,
    insightsData,
    insightsError,
    refetch,
  };
}
