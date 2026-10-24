/**
 * src/frontend/src/hooks/useAppSync.ts
 * Hook đồng bộ dữ liệu chéo giữa các phân hệ thông qua appBus (ADR-W6-03).
 * Tự động hủy đăng ký khi unmount, có debounce 300ms chống nghẽn mạng.
 */

import { useEffect, useState, useRef } from 'react';
import { appBus, type AppEvent } from '../app/appBus';

export interface UseAppSyncOptions {
  onSync?: () => void;
  debounceMs?: number;
}

export function useAppSync(options: UseAppSyncOptions = {}): { syncRevision: number } {
  const { onSync, debounceMs = 300 } = options;
  const [syncRevision, setSyncRevision] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    const handleBusEvent = (_event: AppEvent) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setSyncRevision((prev) => prev + 1);
        if (onSyncRef.current) {
          onSyncRef.current();
        }
      }, debounceMs);
    };

    const unsubMeal = appBus.on('meal-logged', handleBusEvent);
    const unsubHabit = appBus.on('habit-updated', handleBusEvent);

    return () => {
      unsubMeal();
      unsubHabit();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [debounceMs]);

  return { syncRevision };
}
