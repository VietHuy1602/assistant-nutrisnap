/**
 * src/frontend/src/hooks/useVoiceNote.ts
 * Hook coordinating speech recognition, manual text editing, submission, and undo.
 * ADR-W5-05 & ADR-W5-06 of NS-FE-W5-001.
 */

import { useState, useCallback } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { voiceApi } from '../api/voiceApi';
import type { NormalizedVoiceResult } from '../api/voiceContract';

export interface UseVoiceNoteOptions {
  initialNote?: string;
  onApply?: (result: NormalizedVoiceResult) => void;
}

export function useVoiceNote({
  initialNote = '',
  onApply,
}: UseVoiceNoteOptions = {}) {
  const [note, setNote] = useState<string>(initialNote);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [lastAppliedNote, setLastAppliedNote] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState<boolean>(false);

  const speech = useSpeechRecognition({
    lang: 'vi-VN',
    maxDurationSeconds: 15,
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        setNote((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript.trim()));
      }
    },
  });

  const applyNote = useCallback(
    async (currentItems?: Array<{ food_id?: number | null; food_name: string; estimated_gram: number }>) => {
      const trimmed = note.trim();
      if (!trimmed) return;

      setIsApplying(true);
      setApplyError(null);

      try {
        const result = await voiceApi.parseVoiceModifier({
          note: trimmed,
          items: currentItems,
        });

        setLastAppliedNote(trimmed);
        setCanUndo(true);
        onApply?.(result);
      } catch (err: unknown) {
        setApplyError('Không thể áp dụng ghi chú lúc này. Vui lòng thử lại.');
      } finally {
        setIsApplying(false);
      }
    },
    [note, onApply],
  );

  const undoApply = useCallback(() => {
    setCanUndo(false);
    setLastAppliedNote(null);
  }, []);

  return {
    note,
    setNote,
    isApplying,
    applyError,
    canUndo,
    lastAppliedNote,
    applyNote,
    undoApply,
    // Speech recognition controls
    isListening: speech.isListening,
    isSupported: speech.isSupported,
    secondsRemaining: speech.secondsRemaining,
    speechError: speech.error,
    startListening: speech.startListening,
    stopListening: speech.stopListening,
  };
}
