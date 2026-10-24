/**
 * src/frontend/src/components/voice/VoiceNotePanel.tsx
 * Voice Note Panel with privacy disclaimer, Web Speech API (vi-VN), manual text editing, and undo.
 * PRIVACY GUARANTEE: Never captures, stores, or transmits audio streams/Blobs.
 * ADR-W5-05, ADR-W5-06, ASC-16 through ASC-20 of NS-FE-W5-001.
 */

import React, { useState } from 'react';
import { Mic, MicOff, Shield, RotateCcw, Check, Sparkles } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { voiceApi } from '../../api/voiceApi';
import type { NormalizedVoiceResult } from '../../api/voiceContract';

export interface VoiceNotePanelProps {
  initialNote?: string;
  currentItems?: Array<{
    food_id?: number | null;
    food_name: string;
    estimated_gram: number;
  }>;
  onApply?: (result: NormalizedVoiceResult) => void;
  onUndo?: () => void;
  className?: string;
}

export const VoiceNotePanel: React.FC<VoiceNotePanelProps> = ({
  initialNote = '',
  currentItems,
  onApply,
  onUndo,
  className = '',
}) => {
  const [note, setNote] = useState<string>(initialNote);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const speech = useSpeechRecognition({
    lang: 'vi-VN',
    maxDurationSeconds: 15,
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        setNote((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript.trim()));
      }
    },
    onError: (err) => {
      setStatusMessage(err);
    },
  });

  const handleApply = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;

    setIsApplying(true);
    setStatusMessage(null);

    try {
      const result = await voiceApi.parseVoiceModifier({
        note: trimmed,
        items: currentItems,
      });

      setAppliedNote(trimmed);
      setCanUndo(true);
      setStatusMessage('Đã áp dụng ghi chú gia vị vào bữa ăn.');
      onApply?.(result);
    } catch {
      setStatusMessage('Không thể áp dụng ghi chú vào lúc này.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleUndo = () => {
    setCanUndo(false);
    setAppliedNote(null);
    setStatusMessage('Đã hoàn tác ghi chú gia vị.');
    onUndo?.();
  };

  const handleClear = () => {
    setNote('');
    speech.resetTranscript();
    setStatusMessage(null);
  };

  return (
    <section
      role="region"
      aria-label="Ghi chú gia vị bằng giọng nói"
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col gap-4 ${className}`}
    >
      {/* Header with Title and Privacy Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
            <Mic className="w-4 h-4" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Ghi chú gia vị & Chế biến
          </h3>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          <Shield className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>Bảo mật: Không thu hay lưu file âm thanh</span>
        </div>
      </div>

      {/* Privacy Notice Card */}
      <p className="text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200/70 rounded-xl p-3">
        Micro chỉ nhận diện giọng nói tiếng Việt trực tiếp trên trình duyệt thành văn bản để bạn xem và sửa trước khi áp dụng. NutriSnap tuyệt đối không ghi âm, không lưu trữ và không gửi file âm thanh.
      </p>

      {/* Speech Control & Microphone Trigger */}
      <div className="flex flex-wrap items-center gap-3">
        {speech.isSupported ? (
          <button
            type="button"
            onClick={speech.isListening ? speech.stopListening : speech.startListening}
            className={`min-h-11 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-xs ${
              speech.isListening
                ? 'bg-amber-600 text-white animate-pulse'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            }`}
            aria-label={speech.isListening ? 'Dừng nhận diện giọng nói' : 'Nói ghi chú (vi-VN)'}
          >
            {speech.isListening ? (
              <>
                <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Đang nghe… ({speech.secondsRemaining}s)</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Nói ghi chú (vi-VN)</span>
              </>
            )}
          </button>
        ) : (
          <span className="text-xs text-slate-500 italic">
            Trình duyệt chưa hỗ trợ Web Speech API. Bạn có thể nhập trực tiếp vào ô bên dưới.
          </span>
        )}

        {speech.isListening && (
          <button
            type="button"
            onClick={speech.stopListening}
            className="min-h-11 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Dừng lại
          </button>
        )}

        {note && !speech.isListening && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline px-1 py-1 focus-visible:outline-none"
          >
            Xóa nội dung
          </button>
        )}
      </div>

      {/* Interim Listening Feed */}
      {speech.interimTranscript && (
        <p className="text-xs text-emerald-800 italic bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
          Đang nghe: &ldquo;{speech.interimTranscript}&rdquo;…
        </p>
      )}

      {/* Editable Text Area (User can review and edit before applying) */}
      <div className="space-y-1.5">
        <label htmlFor="voice-note-input" className="block text-xs font-semibold text-slate-700">
          Nội dung ghi chú gia vị (có thể gõ hoặc chỉnh sửa):
        </label>
        <textarea
          id="voice-note-input"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: ít dầu mỡ, không lấy da, nước sốt để riêng, thêm rau sống…"
          className="w-full rounded-xl border border-slate-300 p-3 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Status / Error Message */}
      {statusMessage && (
        <p role="status" className="text-xs font-medium text-slate-700 bg-slate-100 p-2.5 rounded-lg border border-slate-200">
          {statusMessage}
        </p>
      )}

      {/* Actions: Apply & Undo */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
        <div>
          {canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              <span>Hoàn tác ghi chú</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleApply}
          disabled={!note.trim() || isApplying}
          className="min-h-11 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors disabled:opacity-50 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {isApplying ? (
            <span>Đang áp dụng…</span>
          ) : appliedNote === note.trim() ? (
            <>
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>Đã áp dụng</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Áp dụng vào bữa ăn</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
