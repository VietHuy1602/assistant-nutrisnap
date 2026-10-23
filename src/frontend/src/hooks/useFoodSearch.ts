/**
 * src/frontend/src/hooks/useFoodSearch.ts
 * Hook tìm kiếm món ăn từ CSDL 500 món tham chiếu có debounce 300ms.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { foodApi } from '../api/foodApi';
import type { FoodReferenceItem } from '../types/api';

export interface UseFoodSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: FoodReferenceItem[];
  loading: boolean;
  error: string | null;
  clear: () => void;
}

export function useFoodSearch(debounceMs = 300): UseFoodSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    setLoading(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
  }, []);

  useEffect(() => {
    const clean = query.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      setError(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response = await foodApi.searchFoods(clean, controller.signal);
        if (!isMountedRef.current || abortControllerRef.current !== controller) return;

        setResults(response.items || []);
      } catch (err: unknown) {
        if (!isMountedRef.current || abortControllerRef.current !== controller) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const msg = err instanceof Error ? err.message : 'Lỗi khi tra cứu món ăn.';
        setError(msg);
      } finally {
        if (isMountedRef.current && abortControllerRef.current === controller) {
          setLoading(false);
          abortControllerRef.current = null;
        }
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debounceMs]);

  return { query, setQuery, results, loading, error, clear };
}
