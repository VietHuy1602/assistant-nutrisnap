import { describe, it, expect } from 'vitest';
import {
  parseMonthKey,
  formatMonthKey,
  shiftMonthKey,
  isFutureMonth,
  formatMonthDisplay,
  currentMonthKey,
  todayDateKey,
  isValidDateKey,
} from '../utils/month';
import { planRetry, parseRetryAfterHeader, MAX_RETRY_ATTEMPTS } from '../utils/retry';

describe('Step 2: Month & Retry Utilities', () => {
  describe('utils/month.ts', () => {
    it('1. correctly parses valid month keys', () => {
      expect(parseMonthKey('2026-10')).toEqual({ year: 2026, month: 10 });
      expect(parseMonthKey('2025-01')).toEqual({ year: 2025, month: 1 });
      expect(parseMonthKey('invalid')).toBeNull();
      expect(parseMonthKey('2026-13')).toBeNull();
      expect(parseMonthKey('2026-00')).toBeNull();
    });

    it('2. formats year and month with padding', () => {
      expect(formatMonthKey(2026, 5)).toBe('2026-05');
      expect(formatMonthKey(2026, 12)).toBe('2026-12');
    });

    it('3. shifts month forward and backward across year boundaries', () => {
      expect(shiftMonthKey('2026-10', 1)).toBe('2026-11');
      expect(shiftMonthKey('2026-10', -1)).toBe('2026-09');
      // Year rollovers
      expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
      expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
      // Multi-month jump
      expect(shiftMonthKey('2026-05', 12)).toBe('2027-05');
    });

    it('4. detects future months against reference', () => {
      expect(isFutureMonth('2026-11', '2026-10')).toBe(true);
      expect(isFutureMonth('2026-10', '2026-10')).toBe(false);
      expect(isFutureMonth('2026-09', '2026-10')).toBe(false);
    });

    it('5. formats user-friendly Vietnamese display label', () => {
      expect(formatMonthDisplay('2026-10')).toBe('Tháng 10/2026');
      expect(formatMonthDisplay('2025-02')).toBe('Tháng 2/2025');
    });

    it('6. generates valid YYYY-MM and YYYY-MM-DD from system time', () => {
      const m = currentMonthKey();
      expect(m).toMatch(/^\d{4}-\d{2}$/);
      const d = todayDateKey();
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isValidDateKey(d)).toBe(true);
      expect(isValidDateKey('invalid-date')).toBe(false);
    });
  });

  describe('utils/retry.ts', () => {
    it('7. returns default backoffs for attempts 1 and 2', () => {
      const plan1 = planRetry(1);
      expect(plan1).not.toBeNull();
      expect(plan1?.waitSec).toBe(2);

      const plan2 = planRetry(2);
      expect(plan2).not.toBeNull();
      expect(plan2?.waitSec).toBe(4);
    });

    it('8. exhausts retries at attempt >= MAX_RETRY_ATTEMPTS (S9: max 3 attempts)', () => {
      expect(planRetry(3)).toBeNull();
      expect(planRetry(4)).toBeNull();
      expect(MAX_RETRY_ATTEMPTS).toBe(3);
    });

    it('9. respects server Retry-After up to 60s cap', () => {
      const planCustom = planRetry(1, 15);
      expect(planCustom?.waitSec).toBe(15);

      const planCapped = planRetry(1, 120);
      expect(planCapped?.waitSec).toBe(60); // Cap at 60s
    });

    it('10. safely parses Retry-After header string', () => {
      expect(parseRetryAfterHeader('10')).toBe(10);
      expect(parseRetryAfterHeader('999')).toBe(60); // Capped
      expect(parseRetryAfterHeader(null)).toBeNull();
      expect(parseRetryAfterHeader('invalid')).toBeNull();
    });
  });
});
