/**
 * src/frontend/src/hooks/useRecognizeFood.ts
 * Hook quản lý tiến trình nhận diện món ăn qua AI Vision.
 * Tuân thủ PSC-4: có chỉ báo sau 5s nếu nhận diện lâu hơn bình thường và hỗ trợ nút Hủy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '../api/aiApi';
import type { RecognizeFoodResponse } from '../types/api';

export type RecognizeStatus = 'idle' | 'pending' | 'slow' | 'success' | 'unrecognized' | 'error';

export interface UseRecognizeFoodReturn {
  status: RecognizeStatus;
  slow: boolean;
  result: RecognizeFoodResponse | null;
  error: string | null;
  run: (blob: Blob, mealType?: string) => Promise<RecognizeFoodResponse | null>;
  cancel: () => void;
  reset: () => void;
}

export function useRecognizeFood(): UseRecognizeFoodReturn {
  const [status, setStatus] = useState<RecognizeStatus>('idle');
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<RecognizeFoodResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const clearTimer = () => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  };

  const cancel = useCallback(() => {
    clearTimer();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (isMountedRef.current) {
      setStatus('idle');
      setSlow(false);
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    if (isMountedRef.current) {
      setStatus('idle');
      setSlow(false);
      setResult(null);
      setError(null);
    }
  }, [cancel]);

  const run = useCallback(
    async (blob: Blob, mealType = 'lunch'): Promise<RecognizeFoodResponse | null> => {
      // Hủy yêu cầu cũ nếu đang chạy
      cancel();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('pending');
      setSlow(false);
      setError(null);
      setResult(null);

      // Thiết lập timer 5s thông báo nhận diện chậm (PSC-4)
      slowTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && abortControllerRef.current === controller) {
          setSlow(true);
          setStatus('slow');
        }
      }, 5000);

      try {
        const data = await aiApi.recognizeFood(blob, mealType, controller.signal);
        clearTimer();
        setSlow(false);

        if (!isMountedRef.current || abortControllerRef.current !== controller) {
          return null;
        }

        setResult(data);
        if (data.status === 'unrecognized' || data.detected_items.length === 0) {
          setStatus('unrecognized');
        } else {
          setStatus('success');
        }
        return data;
      } catch (err: unknown) {
        clearTimer();
        setSlow(false);
        if (!isMountedRef.current || abortControllerRef.current !== controller) {
          return null;
        }

        // Bỏ qua nếu lỗi do người dùng chủ động Hủy (AbortError)
        if (err instanceof DOMException && err.name === 'AbortError') {
          return null;
        }

        const msg =
          err instanceof Error
            ? err.message
            : 'Đã xảy ra sự cố khi nhận diện ảnh. Vui lòng thử lại hoặc chọn món thủ công.';
        setError(msg);
        setStatus('error');
        return null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [cancel],
  );

  return { status, slow, result, error, run, cancel, reset };
}
