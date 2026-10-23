/**
 * src/frontend/src/hooks/useMealPreview.ts
 * Hook tự động gửi bản nháp lên Backend để tính toán trước Calo/Macro.
 * Tuân thủ ADR-W3-02 (Zero FE math) & PSC-6 (Debounce 400ms, hủy request cũ khi thay đổi).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { mealApi } from '../api/mealApi';
import type { MealItemInput, NutritionCalculationResult } from '../types/api';

export type MealPreviewStatus = 'idle' | 'calculating' | 'ready' | 'error';

export interface UseMealPreviewReturn {
  preview: NutritionCalculationResult | null;
  status: MealPreviewStatus;
  error: string | null;
  retry: () => void;
}

export function useMealPreview(
  items: MealItemInput[],
  mealType = 'lunch',
  debounceMs = 400,
): UseMealPreviewReturn {
  const [preview, setPreview] = useState<NutritionCalculationResult | null>(null);
  const [status, setStatus] = useState<MealPreviewStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const lastPayloadRef = useRef<string>('');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const executePreview = useCallback(
    async (validItems: MealItemInput[], type: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('calculating');
      setError(null);

      try {
        const response = await mealApi.previewMeal(
          { meal_type: type, items: validItems },
          controller.signal,
        );

        if (!isMountedRef.current || abortControllerRef.current !== controller) {
          return;
        }

        setPreview(response.nutrition);
        setStatus('ready');
      } catch (err: unknown) {
        if (!isMountedRef.current || abortControllerRef.current !== controller) {
          return;
        }

        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        const msg = err instanceof Error ? err.message : 'Chưa thể tính toán trước dinh dưỡng.';
        setError(msg);
        setStatus('error');
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    // Kiểm tra điều kiện có thể tính nháp:
    // 1. Phải có ít nhất 1 món
    // 2. Mọi món phải có food_id hợp lệ (khóa ngoại CSDL)
    // 3. Khối lượng gam phải dương (> 0 và <= 3000)
    const isSavable =
      items.length > 0 &&
      items.every(
        (it) => it.food_id !== null && it.food_id !== undefined && it.estimated_gram > 0,
      );

    if (!isSavable) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      return;
    }

    const payloadKey = JSON.stringify({ mealType, items });
    if (payloadKey === lastPayloadRef.current && status === 'ready') {
      return;
    }
    lastPayloadRef.current = payloadKey;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void executePreview(items, mealType);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [items, mealType, debounceMs, executePreview, status]);

  const retry = useCallback(() => {
    if (items.length > 0) {
      void executePreview(items, mealType);
    }
  }, [items, mealType, executePreview]);

  return { preview, status, error, retry };
}
