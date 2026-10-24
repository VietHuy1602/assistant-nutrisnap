/**
 * src/frontend/src/__tests__/chartFormat.test.ts
 * Tests for string-based date and number formatters in chartFormat.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  formatDayMonth,
  formatWeekLabel,
  formatKg,
  formatKcal,
  formatVnd,
} from '../utils/chartFormat';

describe('chartFormat utils', () => {
  describe('formatDayMonth', () => {
    it('formats YYYY-MM-DD correctly without timezone shifts', () => {
      expect(formatDayMonth('2026-10-24')).toBe('24/10');
      expect(formatDayMonth('2026-01-05')).toBe('05/01');
      expect(formatDayMonth('2026-12-31T00:00:00Z')).toBe('31/12');
    });

    it('handles empty or malformed strings safely', () => {
      expect(formatDayMonth('')).toBe('');
      expect(formatDayMonth(null)).toBe('');
      expect(formatDayMonth(undefined)).toBe('');
      expect(formatDayMonth('invalid')).toBe('invalid');
    });
  });

  describe('formatWeekLabel', () => {
    it('formats week label with prefix', () => {
      expect(formatWeekLabel('2026-10-24')).toBe('Tuần 24/10');
      expect(formatWeekLabel('')).toBe('Tuần');
    });
  });

  describe('formatKg', () => {
    it('formats valid kg numbers with 1 decimal digit', () => {
      expect(formatKg(68.5)).toBe('68,5 kg');
      expect(formatKg(70)).toBe('70 kg');
    });

    it('returns dash for null or undefined', () => {
      expect(formatKg(null)).toBe('—');
      expect(formatKg(undefined)).toBe('—');
    });
  });

  describe('formatKcal', () => {
    it('formats valid calories rounded to whole number', () => {
      expect(formatKcal(1850.4)).toBe('1.850 kcal');
      expect(formatKcal(2000)).toBe('2.000 kcal');
    });

    it('returns dash for null or undefined', () => {
      expect(formatKcal(null)).toBe('—');
      expect(formatKcal(undefined)).toBe('—');
    });
  });

  describe('formatVnd', () => {
    it('formats valid currency rounded with VNĐ symbol', () => {
      expect(formatVnd(35000)).toBe('35.000 VNĐ');
      expect(formatVnd(0)).toBe('0 VNĐ');
    });

    it('returns dash for null or undefined', () => {
      expect(formatVnd(null)).toBe('—');
      expect(formatVnd(undefined)).toBe('—');
    });
  });
});
