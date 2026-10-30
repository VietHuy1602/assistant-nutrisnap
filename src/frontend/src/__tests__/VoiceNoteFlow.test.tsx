/**
 * src/frontend/src/__tests__/VoiceNoteFlow.test.tsx
 * Tests for Web Speech API integration, VoiceNotePanel, privacy guarantees, and reducer undo.
 * ADR-W5-05, ADR-W5-06, ASC-16 through ASC-20.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceNotePanel } from '../components/voice/VoiceNotePanel';
import { voiceApi } from '../api/voiceApi';
import { mealDraftReducer, initialDraftState } from '../components/meal/mealDraftReducer';

describe('VoiceNoteFlow (Speech, Privacy & Fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders privacy guarantee badge and privacy disclaimer', () => {
    render(<VoiceNotePanel />);

    expect(screen.getByText(/Bảo mật: Không thu hay lưu file âm thanh/i)).toBeInTheDocument();
    expect(
      screen.getByText(/NutriSnap tuyệt đối không ghi âm, không lưu trữ và không gửi file âm thanh/i)
    ).toBeInTheDocument();
  });

  it('provides seamless manual text fallback when speech recognition is not supported', async () => {
    // In headless jsdom, window.SpeechRecognition is undefined
    render(<VoiceNotePanel />);

    expect(screen.getByText(/Trình duyệt chưa hỗ trợ Web Speech API/i)).toBeInTheDocument();
    const textarea = screen.getByLabelText(/Nội dung ghi chú gia vị/i);
    expect(textarea).toBeEnabled();

    fireEvent.change(textarea, { target: { value: 'Nước sốt để riêng, ít dầu' } });
    expect(textarea).toHaveValue('Nước sốt để riêng, ít dầu');
  });

  it('applies voice note via voiceApi and supports undo', async () => {
    const onApply = vi.fn();
    const onUndo = vi.fn();

    vi.spyOn(voiceApi, 'parseVoiceModifier').mockResolvedValue({
      success: true,
      note: 'Ít dầu mỡ',
      warnings: [],
    });

    render(
      <VoiceNotePanel
        initialNote="Ít dầu mỡ"
        currentItems={[{ food_id: 1, food_name: 'Cơm tấm', estimated_gram: 200 }]}
        onApply={onApply}
        onUndo={onUndo}
      />
    );

    const applyBtn = screen.getByRole('button', { name: /Áp dụng vào bữa ăn/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(voiceApi.parseVoiceModifier).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'Ít dầu mỡ' })
      );
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Đã áp dụng')).toBeInTheDocument();

    // Undo button appears
    const undoBtn = screen.getByRole('button', { name: /Hoàn tác ghi chú/i });
    expect(undoBtn).toBeInTheDocument();

    fireEvent.click(undoBtn);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Đã hoàn tác ghi chú/i)).toBeInTheDocument();
  });

  describe('Mocked Web Speech API in browser', () => {
    let originalSpeech: unknown;
    let mockStart: ReturnType<typeof vi.fn<() => void>>;
    let mockStop: ReturnType<typeof vi.fn<() => void>>;
    let mockAbort: ReturnType<typeof vi.fn<() => void>>;
    let instanceRef: any;

    beforeEach(() => {
      mockStart = vi.fn<() => void>();
      mockStop = vi.fn<() => void>();
      mockAbort = vi.fn<() => void>();

      class MockSpeechRecognition {
        lang = 'vi-VN';
        continuous = false;
        interimResults = true;
        maxAlternatives = 1;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onresult: ((e: any) => void) | null = null;
        onerror: ((e: any) => void) | null = null;

        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          instanceRef = this;
        }

        start() {
          mockStart();
          this.onstart?.();
        }

        stop() {
          mockStop();
          this.onend?.();
        }

        abort() {
          mockAbort();
          this.onend?.();
        }
      }

      originalSpeech = (window as any).SpeechRecognition;
      (window as any).SpeechRecognition = MockSpeechRecognition;
    });

    afterEach(() => {
      (window as any).SpeechRecognition = originalSpeech;
    });

    it('starts listening with vi-VN language and updates transcript on result', async () => {
      const user = userEvent.setup();
      render(<VoiceNotePanel />);

      const micBtn = screen.getByRole('button', { name: /Nói ghi chú \(vi-VN\)/i });
      await user.click(micBtn);

      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Đang nghe…/i)).toBeInTheDocument();

      // Simulate interim speech event
      await act(async () => {
        instanceRef.onresult({
          resultIndex: 0,
          results: [
            {
              isFinal: false,
              0: { transcript: 'không đường', confidence: 0.9 },
            },
          ],
        });
      });

      expect(await screen.findByText(/Đang nghe: “không đường”…/i)).toBeInTheDocument();

      // Simulate final speech event
      await act(async () => {
        instanceRef.onresult({
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'không lấy đường', confidence: 0.95 },
            },
          ],
        });
      });

      await waitFor(() => {
        const textarea = screen.getByLabelText(/Nội dung ghi chú gia vị/i);
        expect(textarea).toHaveValue('không lấy đường');
      });
    });

    it('gracefully handles speech permission denial error', async () => {
      const user = userEvent.setup();
      render(<VoiceNotePanel />);

      await user.click(screen.getByRole('button', { name: /Nói ghi chú \(vi-VN\)/i }));

      // Trigger permission denied error
      await act(async () => {
        instanceRef.onerror({ error: 'not-allowed' });
      });

      expect(
        await screen.findByText(/Quyền truy cập micro bị từ chối\. Bạn vẫn có thể nhập ghi chú bằng bàn phím/i)
      ).toBeInTheDocument();

      // Textarea remains editable
      expect(screen.getByLabelText(/Nội dung ghi chú gia vị/i)).toBeEnabled();
    });
  });

  describe('mealDraftReducer voice actions', () => {
    it('APPLY_VOICE_RESULT attaches voiceNote and stores rollback snapshot', () => {
      const initial = {
        ...initialDraftState,
        items: [
          {
            key: 'item-1',
            food_id: 10,
            food_name: 'Phở bò',
            estimated_gram: 400,
            source: 'manual' as const,
          },
        ],
      };

      const updated = mealDraftReducer(initial, {
        type: 'APPLY_VOICE_RESULT',
        note: 'Ít bánh nhiều thịt',
        adjustedItems: [
          {
            food_id: 10,
            food_name: 'Phở bò (nhiều thịt)',
            estimated_gram: 450,
          },
        ],
      });

      expect(updated.voiceNote).toBe('Ít bánh nhiều thịt');
      expect(updated.items[0].food_name).toBe('Phở bò (nhiều thịt)');
      expect(updated.items[0].source).toBe('voice');
      expect(updated.previousVoiceSnapshot).not.toBeNull();
      expect(updated.previousVoiceSnapshot?.items[0].food_name).toBe('Phở bò');

      // Now undo
      const undone = mealDraftReducer(updated, { type: 'UNDO_VOICE' });
      expect(undone.items[0].food_name).toBe('Phở bò');
      expect(undone.voiceNote).toBeUndefined();
      expect(undone.previousVoiceSnapshot).toBeNull();
    });
  });
});
