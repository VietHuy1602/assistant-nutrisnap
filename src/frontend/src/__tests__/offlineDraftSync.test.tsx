import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { setupMockIndexedDB } from './mockIndexedDB';
import { draftStore } from '../storage/draftStore';
import { useDraftAutosave } from '../offline/useDraftAutosave';
import { DraftReviewDialog } from '../offline/DraftReviewDialog';
import { DraftBanner } from '../offline/DraftBanner';
import { ConnectivityProvider, useConnectivity } from '../app/ConnectivityProvider';
import { mealApi } from '../api/mealApi';
import { appBus } from '../app/appBus';

// setImmediate is not faked below, so yielding through it lets real async work finish.
async function waitForSaveToSettle(isSaving: () => boolean) {
  for (let i = 0; i < 200 && isSaving(); i++) {
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
  }
}

describe('Step 8: Offline Draft Autosave, Confirmed Sync and 429 Queue Handling', () => {
  let restoreIDB: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreIDB = setupMockIndexedDB();
    draftStore.close();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (typeof restoreIDB === 'function') {
      restoreIDB();
    }
    await draftStore.clearAll().catch(() => {});
    draftStore.close();
    vi.restoreAllMocks();
  });

  describe('useDraftAutosave', () => {
    it('1. autosaves draft with 800ms debounce and updates existing draftId', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const payload1 = {
        mealType: 'lunch',
        items: [{ foodId: 1, name: 'Cơm trắng', grams: 150 }],
      };

      const { result, rerender } = renderHook(
        ({ p }) => useDraftAutosave(p, { enabled: true, debounceMs: 800 }),
        { initialProps: { p: payload1 } }
      );

      expect(result.current.draftId).toBeNull();

      // Advance timers asynchronously by 850ms to trigger save
      await act(async () => {
        await vi.advanceTimersByTimeAsync(850);
      });

      // WebCrypto encryption completes on real I/O, which fake setTimeout cannot advance.
      await waitForSaveToSettle(() => result.current.isSaving);
      const firstId = result.current.draftId;

      // Update payload
      const payload2 = {
        mealType: 'lunch',
        items: [
          { foodId: 1, name: 'Cơm trắng', grams: 200 },
          { foodId: 2, name: 'Ức gà luộc', grams: 100 },
        ],
      };

      rerender({ p: payload2 });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(850);
      });
      await waitForSaveToSettle(() => result.current.isSaving);

      // Still same ID (updated, not duplicated)
      expect(result.current.draftId).toBe(firstId);

      vi.useRealTimers();
    });

    it('2. clearDraft removes draft from draftStore', async () => {
      const payload = {
        mealType: 'dinner',
        items: [{ foodId: 3, name: 'Canh rau cải', grams: 200 }],
      };

      const { result } = renderHook(() =>
        useDraftAutosave(payload, { enabled: false })
      );

      let savedId: string | null = null;
      await act(async () => {
        savedId = await result.current.saveNow(payload);
      });

      expect(savedId).not.toBeNull();
      const countBefore = await draftStore.countDrafts();
      expect(countBefore).toBe(1);

      await act(async () => {
        await result.current.clearDraft();
      });

      const countAfter = await draftStore.countDrafts();
      expect(countAfter).toBe(0);
      expect(result.current.draftId).toBeNull();
    });
  });

  describe('DraftReviewDialog & Zero-Auto-Sync Protection (S8, M6, AS-6)', () => {
    it('3. ZERO AUTO-SYNC: opening dialog does NOT send any network requests', async () => {
      const logMealSpy = vi.spyOn(mealApi, 'logMeal');

      // Pre-save a draft
      await draftStore.saveDraft({
        mealType: 'breakfast',
        items: [{ foodId: 1, name: 'Phở bò', grams: 350 }],
      });

      render(<DraftReviewDialog isOpen={true} onClose={vi.fn()} />);

      expect(await screen.findByText('Phở bò')).toBeDefined();
      expect(screen.getByText('350g')).toBeDefined();
      expect(screen.getByText('Bữa sáng')).toBeDefined();

      // Zero auto writes!
      expect(logMealSpy).not.toHaveBeenCalled();
    });

    it('4. CONFIRMED SYNC ONLY: sends to backend ONLY when user explicitly clicks confirm', async () => {
      const logMealSpy = vi.spyOn(mealApi, 'logMeal').mockResolvedValue({} as any);
      const busSpy = vi.spyOn(appBus, 'emit');

      await draftStore.saveDraft({
        mealType: 'lunch',
        items: [{ foodId: 2, name: 'Cơm tấm sườn', grams: 300 }],
      });

      render(<DraftReviewDialog isOpen={true} onClose={vi.fn()} />);

      const confirmBtn = await screen.findByRole('button', { name: /xác nhận lưu vào csdl/i });
      expect(confirmBtn).toBeDefined();

      // Click confirm
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(logMealSpy).toHaveBeenCalledTimes(1);
      expect(logMealSpy).toHaveBeenCalledWith({
        meal_type: 'lunch',
        items: [{ food_id: 2, food_name: 'Cơm tấm sườn', estimated_gram: 300 }],
        image_path: null,
      });

      // Emits appBus event for cross-screen sync
      expect(busSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'meal-logged',
          source: 'offline-sync',
        })
      );

      // Draft deleted from store
      const remainingCount = await draftStore.countDrafts();
      expect(remainingCount).toBe(0);
    });

    it('5. provides anti-duplication check button for today meals', async () => {
      const checkTodayMock = vi.fn();

      await draftStore.saveDraft({
        mealType: 'lunch',
        items: [{ foodId: 2, name: 'Trứng ốp la', grams: 60 }],
      });

      render(
        <DraftReviewDialog isOpen={true} onClose={vi.fn()} onCheckTodayMeals={checkTodayMock} />
      );

      const checkLink = await screen.findByRole('button', {
        name: /kiểm tra nhật ký hôm nay trước khi lưu/i,
      });
      fireEvent.click(checkLink);

      expect(checkTodayMock).toHaveBeenCalledTimes(1);
    });

    it('6. deletes draft when trash icon is clicked without calling mealApi', async () => {
      const logMealSpy = vi.spyOn(mealApi, 'logMeal');

      await draftStore.saveDraft({
        mealType: 'snack',
        items: [{ foodId: 4, name: 'Táo', grams: 120 }],
      });

      render(<DraftReviewDialog isOpen={true} onClose={vi.fn()} />);

      const trashBtn = await screen.findByTitle('Bỏ bản nháp này');
      await act(async () => {
        fireEvent.click(trashBtn);
      });

      expect(logMealSpy).not.toHaveBeenCalled();
      const count = await draftStore.countDrafts();
      expect(count).toBe(0);
    });
  });

  describe('DraftBanner', () => {
    it('7. displays pending count and opens review dialog when clicked', async () => {
      await draftStore.saveDraft({
        mealType: 'dinner',
        items: [{ foodId: 5, name: 'Salad gà', grams: 200 }],
      });

      render(
        <ConnectivityProvider>
          <DraftBanner />
        </ConnectivityProvider>
      );

      const bannerText = await screen.findByText(/bản nháp bữa ăn/i);
      expect(bannerText).toBeDefined();

      const openDialogBtn = screen.getByRole('button', { name: /xem và lưu vào csdl/i });
      fireEvent.click(openDialogBtn);

      expect(await screen.findByRole('dialog')).toBeDefined();
    });
  });

  describe('429 Friendly Queue & Rate Limit Handling in ConnectivityProvider', () => {
    const TestConsumer = () => {
      const { status, rateLimitCountdown, triggerRateLimit } = useConnectivity();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="countdown">{rateLimitCountdown}</span>
          <button onClick={() => triggerRateLimit(15)}>Trigger 429</button>
        </div>
      );
    };

    it('8. handles 429 status with friendly countdown and caps max retries to 3', async () => {
      render(
        <ConnectivityProvider>
          <TestConsumer />
        </ConnectivityProvider>
      );

      expect(screen.getByTestId('status').textContent).toBe('online');

      // Trigger 1
      fireEvent.click(screen.getByText('Trigger 429'));
      expect(screen.getByTestId('status').textContent).toBe('rateLimited');
      expect(screen.getByTestId('countdown').textContent).toBe('15');

      // Banner is rendered with countdown
      expect(screen.getByText(/bạn thao tác hơi nhanh/i)).toBeDefined();
    });
  });
});
