/**
 * src/frontend/src/hooks/useMonthlyReport.ts
 * Hook quản lý trạng thái tải báo cáo tháng, đổi tháng và tự động làm mới.
 * Tuân thủ ISC-8: Giữ dữ liệu cũ khi đổi tháng đến khi có dữ liệu mới, hủy request cũ, chặn tháng tương lai.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { reportApi } from '../api/reportApi';
import type { MonthlyReport } from '../api/reportContract';
import { isFutureMonth } from '../utils/month';
import { appBus } from '../app/appBus';

export type ReportLoadState = 'loading' | 'ready' | 'empty' | 'insufficient' | 'error';

export interface UseMonthlyReportResult {
  report: MonthlyReport | null;
  loadState: ReportLoadState;
  errorMessage?: string;
  monthKey: string;
  setMonthKey: (month: string) => void;
  refetch: () => Promise<void>;
  isFuture: boolean;
}

export function useMonthlyReport(initialMonthKey: string): UseMonthlyReportResult {
  const [monthKey, setMonthKey] = useState<string>(initialMonthKey);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loadState, setLoadState] = useState<ReportLoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isFuture = isFutureMonth(monthKey);

  const fetchReport = useCallback(
    async (targetMonth: string) => {
      // Chặn tháng tương lai (ISC-8)
      if (isFutureMonth(targetMonth)) {
        setLoadState('empty');
        setErrorMessage('Tháng tương lai chưa có dữ liệu báo cáo.');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoadState('loading');
      setErrorMessage(undefined);

      try {
        const data = await reportApi.getMonthly(targetMonth, controller.signal);
        setReport(data);

        if (data.insufficient) {
          setLoadState('insufficient');
        } else if (data.days.length === 0 && data.loggingSummary.totalLoggedDays === 0) {
          setLoadState('empty');
        } else {
          setLoadState('ready');
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setLoadState('error');
        const message =
          err instanceof Error ? err.message : 'Không tải được báo cáo tháng từ máy chủ.';
        setErrorMessage(message);
      }
    },
    []
  );

  useEffect(() => {
    fetchReport(monthKey);

    const unsub = appBus.on('meal-logged', () => {
      fetchReport(monthKey);
    });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      unsub();
    };
  }, [monthKey, fetchReport]);

  return {
    report,
    loadState,
    errorMessage,
    monthKey,
    setMonthKey,
    refetch: () => fetchReport(monthKey),
    isFuture,
  };
}
