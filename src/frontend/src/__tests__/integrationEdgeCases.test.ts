import { describe, it, expect, vi } from 'vitest';
import { normalizeHabitStatus } from '../api/habitContract';
import { normalizeMonthlyReport } from '../api/reportContract';
import {
  shiftMonthKey,
  formatMonthDisplay,
  parseMonthKey,
  formatMonthKey,
  isFutureMonth,
  isValidDateKey,
} from '../utils/month';
import { planRetry, parseRetryAfterHeader } from '../utils/retry';
import {
  generateDraftKey,
  encryptPayload,
  decryptPayload,
} from '../storage/draftCrypto';
import { appBus } from '../app/appBus';
import type { MealDraftPayload } from '../storage/draftTypes';

describe('Step 9: Integration Edge Cases & Resilience (≥ 30 New Tests)', () => {
  describe('Contract Tolerant Reader Edge Cases', () => {
    it('1. coerces negative streak values to zero (nonnegative constraint)', () => {
      const res = normalizeHabitStatus({ streak: { current_streak: -5 } });
      expect(res.streak.currentStreak).toBe(0);
    });

    it('2. safely ignores unknown extraneous properties in habit response', () => {
      const res = normalizeHabitStatus({
        streak: { current_streak: 7 },
        unknown_cloud_metadata: { cluster: 'us-east-1', secret_key: 'xyz' },
      });
      expect(res.streak.currentStreak).toBe(7);
      expect((res as any).unknown_cloud_metadata).toBeUndefined();
    });

    it('3. provides default non-punitive message when back_on_track is missing', () => {
      const res = normalizeHabitStatus({ streak: { current_streak: 0 } });
      expect(res.backOnTrack.active).toBe(false);
      expect(res.backOnTrack.encouragementMessage).toContain('NutriSnap');
      expect(res.backOnTrack.caloriePenaltyApplied).toBe(false);
    });

    it('4. handles report with null weight records gracefully', () => {
      const res = normalizeMonthlyReport({
        month: '2026-10',
        weight_summary: {
          start_weight_kg: null,
          end_weight_kg: null,
          raw_weight_change_kg: null,
        },
      });
      expect(res.weightSummary.startWeightKg).toBeNull();
      expect(res.weightSummary.endWeightKg).toBeNull();
      expect(res.weightSummary.rawWeightChangeKg).toBeNull();
      expect(res.weightSummary.trendDirection).toBe('insufficient_data');
    });

    it('5. handles report with 0 logged days (consistency 0%)', () => {
      const res = normalizeMonthlyReport({
        month: '2026-10',
        logging_summary: {
          total_logged_days: 0,
          period_days: 31,
          consistency_rate_pct: 0,
        },
      });
      expect(res.loggingSummary.totalLoggedDays).toBe(0);
      expect(res.loggingSummary.consistencyRatePct).toBe(0);
    });

    it('6. retains all 3 mandatory transparent notices in reportContract', () => {
      const res = normalizeMonthlyReport({});
      expect(res.notices.length).toBe(3);
      expect(res.notices[0]).toContain('ước tính tham khảo');
      expect(res.notices[1]).toContain('lượng nước, muối');
      expect(res.notices[2]).toContain('tư vấn y khoa');
    });
  });

  describe('Month Date Arithmetic Edge Cases (Zero-Math, Asia/Ho_Chi_Minh)', () => {
    it('7. shifts month backward across year boundary (2026-01 -> 2025-12)', () => {
      expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    });

    it('8. shifts month forward across year boundary (2026-12 -> 2027-01)', () => {
      expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    });

    it('9. parses valid YYYY-MM key into year and month numbers', () => {
      expect(parseMonthKey('2026-10')).toEqual({ year: 2026, month: 10 });
    });

    it('10. formats year and month numbers into padded YYYY-MM string', () => {
      expect(formatMonthKey(2026, 5)).toBe('2026-05');
      expect(formatMonthKey(2026, 12)).toBe('2026-12');
    });

    it('11. formats month in Vietnamese correctly (Tháng 10/2026)', () => {
      expect(formatMonthDisplay('2026-10')).toBe('Tháng 10/2026');
      expect(formatMonthDisplay('2026-05')).toBe('Tháng 5/2026');
    });

    it('12. validates valid and invalid YYYY-MM-DD date strings', () => {
      expect(isValidDateKey('2026-10-25')).toBe(true);
      expect(isValidDateKey('2026-02-31')).toBe(true); // regex format check
      expect(isValidDateKey('invalid-date')).toBe(false);
      expect(isValidDateKey('')).toBe(false);
    });

    it('13. detects future months relative to current date', () => {
      expect(isFutureMonth('2099-01', '2026-10')).toBe(true);
      expect(isFutureMonth('2026-10', '2026-10')).toBe(false);
      expect(isFutureMonth('2026-09', '2026-10')).toBe(false);
    });

    it('14. shiftMonthKey handles multi-month jumps (+14 months)', () => {
      expect(shiftMonthKey('2026-01', 14)).toBe('2027-03');
    });
  });

  describe('Retry & Backoff Logic (utils/retry.ts)', () => {
    it('15. plans attempt 1 with 2s default wait', () => {
      const plan = planRetry(1);
      expect(plan).not.toBeNull();
      expect(plan!.waitSec).toBe(2);
    });

    it('16. plans attempt 2 with 4s wait', () => {
      const plan = planRetry(2);
      expect(plan).not.toBeNull();
      expect(plan!.waitSec).toBe(4);
    });

    it('17. returns null at attempt 3 to cap maximum automated retries', () => {
      const plan = planRetry(3);
      expect(plan).toBeNull();
    });

    it('18. returns null after 3 attempts to prevent infinite retry loops', () => {
      const plan = planRetry(4);
      expect(plan).toBeNull();
    });

    it('19. honors server Retry-After header integer seconds', () => {
      const plan = planRetry(1, 15);
      expect(plan).not.toBeNull();
      expect(plan!.waitSec).toBe(15);
    });

    it('20. parseRetryAfterHeader parses integer string and caps at 60s', () => {
      expect(parseRetryAfterHeader('15')).toBe(15);
      expect(parseRetryAfterHeader('120')).toBe(60);
      expect(parseRetryAfterHeader(null)).toBeNull();
    });
  });

  describe('draftCrypto Security & Vietnamese Unicode Integrity', () => {
    it('21. preserves complex Vietnamese dish names and diacritics in roundtrip', async () => {
      const key = await generateDraftKey();
      const payload: MealDraftPayload = {
        mealType: 'Trưa',
        items: [
          { foodId: 101, name: 'Bún chả Hà Nội nướng than', grams: 250 },
          { foodId: 102, name: 'Bánh cuốn Thanh Trì chả quế', grams: 180 },
          { foodId: 103, name: 'Rau kinh giới, húng lủi, tía tô', grams: 50 },
        ],
      };

      const { iv, cipher } = await encryptPayload(key, payload);
      const decrypted = await decryptPayload(key, iv, cipher);

      expect(decrypted.items[0].name).toBe('Bún chả Hà Nội nướng than');
      expect(decrypted.items[1].name).toBe('Bánh cuốn Thanh Trì chả quế');
      expect(decrypted.items[2].name).toBe('Rau kinh giới, húng lủi, tía tô');
    });

    it('22. throws error when decrypting with corrupted ciphertext', async () => {
      const key = await generateDraftKey();
      const payload: MealDraftPayload = {
        mealType: 'Sáng',
        items: [{ foodId: 1, name: 'Trứng luộc', grams: 50 }],
      };

      const { iv, cipher } = await encryptPayload(key, payload);
      const corruptedCipher = cipher.slice(0, -4) + 'AAAA';

      await expect(decryptPayload(key, iv, corruptedCipher)).rejects.toThrow();
    });

    it('23. throws error when decrypting with different AES key', async () => {
      const key1 = await generateDraftKey();
      const key2 = await generateDraftKey();

      const payload: MealDraftPayload = {
        mealType: 'Tối',
        items: [{ foodId: 1, name: 'Cá hồi áp chảo', grams: 150 }],
      };

      const { iv, cipher } = await encryptPayload(key1, payload);
      await expect(decryptPayload(key2, iv, cipher)).rejects.toThrow();
    });

    it('24. generates distinct 12-byte IVs for identical payloads', async () => {
      const key = await generateDraftKey();
      const payload: MealDraftPayload = {
        mealType: 'Phụ',
        items: [{ foodId: 1, name: 'Sữa chua không đường', grams: 100 }],
      };

      const enc1 = await encryptPayload(key, payload);
      const enc2 = await encryptPayload(key, payload);

      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.cipher).not.toBe(enc2.cipher);
    });
  });

  describe('appBus Coalesce & Isolation (M12)', () => {
    it('25. emitCoalesced debounces rapid calls into a single invocation', async () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const unsub = appBus.on('meal-logged', callback);

      appBus.emitCoalesced('meal-logged', 300, 'test-coalesce');
      appBus.emitCoalesced('meal-logged', 300, 'test-coalesce');
      appBus.emitCoalesced('meal-logged', 300, 'test-coalesce');

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(1);

      unsub();
      vi.useRealTimers();
    });

    it('26. isolates listener errors so other listeners still execute', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Explosion in bad listener');
      });
      const goodListener = vi.fn();

      const un1 = appBus.on('habit-updated', badListener);
      const un2 = appBus.on('habit-updated', goodListener);

      appBus.emit({
        type: 'habit-updated',
        at: Date.now(),
        source: 'isolation-test',
      });

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalledTimes(1);

      un1();
      un2();
      consoleErrorSpy.mockRestore();
    });

    it('27. throws immediate Error if calories key is smuggled in bus event', () => {
      expect(() => {
        appBus.emit({
          type: 'meal-logged',
          at: Date.now(),
          source: 'leak-attempt',
          calories: 2500,
        } as any);
      }).toThrow(/cấm truyền dữ liệu sức khỏe/i);
    });

    it('28. throws immediate Error if grams key is smuggled in bus event', () => {
      expect(() => {
        appBus.emit({
          type: 'meal-logged',
          at: Date.now(),
          source: 'leak-attempt',
          grams: 150,
        } as any);
      }).toThrow(/cấm truyền dữ liệu sức khỏe/i);
    });

    it('29. throws immediate Error if weight key is smuggled in bus event', () => {
      expect(() => {
        appBus.emit({
          type: 'habit-updated',
          at: Date.now(),
          source: 'leak-attempt',
          weight: 65.5,
        } as any);
      }).toThrow(/cấm truyền dữ liệu sức khỏe/i);
    });

    it('30. supports idempotent unsubscribe', () => {
      const listener = vi.fn();
      const unsub = appBus.on('meal-logged', listener);

      unsub();
      expect(() => unsub()).not.toThrow(); // second unsubscribe does not crash

      appBus.emit({ type: 'meal-logged', at: Date.now(), source: 'after-unsub' });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
