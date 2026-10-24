/**
 * src/frontend/src/hooks/useFoodSwap.ts
 * Hook managing Food Swap Simulator lifecycle, goals, and selections.
 * Zero-Math: All nutritional metrics and differences come from backend.
 * ADR-W5-01, ADR-W5-04 of NS-FE-W5-001.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { swapApi, type SwapGoal } from '../api/swapApi';
import type { NormalizedSwapResponse, SwapCandidate } from '../api/swapContract';

export interface UseFoodSwapOptions {
  foodId?: number;
  foodName: string;
  portionGram?: number;
  initialGoal?: SwapGoal;
}

export function useFoodSwap({
  foodId,
  foodName,
  portionGram = 250.0,
  initialGoal = 'reduce_calories',
}: UseFoodSwapOptions) {
  const [goal, setGoal] = useState<SwapGoal>(initialGoal);
  const [data, setData] = useState<NormalizedSwapResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAlternatives = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('loading');
    setErrorMessage(null);
    setSelectedId(null);

    try {
      const response = await swapApi.getSwapAlternatives(
        {
          currentFoodId: foodId,
          currentFoodName: foodName,
          portionGram,
          swapGoal: goal,
        },
        controller.signal,
      );
      setData(response);
      setStatus('ready');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setStatus('error');
      setErrorMessage('Không thể tải các món ăn gợi ý thay thế vào lúc này.');
    }
  }, [foodId, foodName, portionGram, goal]);

  useEffect(() => {
    void fetchAlternatives();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAlternatives, retryCount]);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const selectedCandidate: SwapCandidate | undefined = data?.alternatives.find(
    (alt) => alt.food_id === selectedId,
  );

  return {
    goal,
    setGoal,
    data,
    status,
    selectedId,
    setSelectedId,
    selectedCandidate,
    errorMessage,
    retry,
  };
}
