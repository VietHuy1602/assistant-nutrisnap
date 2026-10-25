/**
 * src/frontend/src/offline/useDraftAutosave.ts
 * Hook tự động lưu bản nháp bữa ăn mã hóa vào IndexedDB (ADR-W6-02, ADR-W6-08).
 * QUY TẮC AN TOÀN (S6, M5):
 * - Debounce 800ms để tránh ghi đè IndexedDB liên tục.
 * - Mã hóa AES-GCM thông qua draftStore trước khi lưu.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { draftStore } from '../storage/draftStore';
import type { MealDraftPayload } from '../storage/draftTypes';

export interface UseDraftAutosaveOptions {
  enabled?: boolean;
  debounceMs?: number;
  existingDraftId?: string;
}

export interface UseDraftAutosaveReturn {
  draftId: string | null;
  isSaving: boolean;
  lastSavedAt: number | null;
  saveNow: (overridePayload?: MealDraftPayload) => Promise<string | null>;
  clearDraft: () => Promise<void>;
}

export function useDraftAutosave(
  payload: MealDraftPayload | null,
  options: UseDraftAutosaveOptions = {}
): UseDraftAutosaveReturn {
  const { enabled = true, debounceMs = 800, existingDraftId } = options;

  const [draftId, setDraftId] = useState<string | null>(existingDraftId || null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = useCallback(
    async (overridePayload?: MealDraftPayload): Promise<string | null> => {
      const dataToSave = overridePayload || payloadRef.current;
      if (!dataToSave || !dataToSave.items || dataToSave.items.length === 0) {
        return null;
      }

      setIsSaving(true);
      try {
        const id = await draftStore.saveDraft(dataToSave, draftId || undefined);
        setDraftId(id);
        setLastSavedAt(Date.now());
        return id;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[useDraftAutosave] Không thể lưu nháp:', err);
        }
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [draftId]
  );

  const clearDraft = useCallback(async () => {
    if (draftId) {
      try {
        await draftStore.deleteDraft(draftId);
      } catch {
        // ignore
      }
      setDraftId(null);
      setLastSavedAt(null);
    }
  }, [draftId]);

  useEffect(() => {
    if (!enabled || !payload || !payload.items || payload.items.length === 0) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      void saveNow();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [payload, enabled, debounceMs, saveNow]);

  return {
    draftId,
    isSaving,
    lastSavedAt,
    saveNow,
    clearDraft,
  };
}
