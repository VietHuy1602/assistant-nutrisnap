/**
 * src/frontend/src/__tests__/progressContract.test.ts
 * Unit tests for Tolerant Reader contracts (progress, swap, voice).
 * ADR-W5-01 / ADR-W5-02 / ADR-W5-04 of NS-FE-W5-001.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWeightSeries,
  normalizePatternInsights,
  normalizeWeeklyCalories,
} from '../api/progressContract';
import { normalizeSwapResponse } from '../api/swapContract';
import { normalizeVoiceResult } from '../api/voiceContract';
import {
  mockWeightSeriesWithEma,
  mockWeightSeriesWithoutEma,
  mockWeightSeriesPartialEma,
  mockPatternInsightsAnalyzed,
  mockPatternInsightsInsufficient,
  mockFoodSwapResponse,
} from './fixtures/analytics';

describe('progressContract - Tolerant Reader Normalizers', () => {
  describe('normalizeWeightSeries', () => {
    it('normalizes realistic weight series with full EMA', () => {
      const res = normalizeWeightSeries(mockWeightSeriesWithEma);
      expect(res.points).toHaveLength(5);
      expect(res.points[0]).toEqual({
        date: '2026-10-10',
        weight_kg: 68.5,
        ema_weight: 68.5,
      });
      expect(res.latestWeightKg).toBe(67.5);
      expect(res.latestEmaKg).toBe(68.28);
      expect(res.rawChangeKg).toBe(-1.0);
    });

    it('normalizes series in Mode A where ema_weight is completely absent or null', () => {
      const res = normalizeWeightSeries(mockWeightSeriesWithoutEma);
      expect(res.points).toHaveLength(4);
      expect(res.points[0].ema_weight).toBeNull();
      expect(res.latestEmaKg).toBeNull();
    });

    it('handles partial EMA series without crashing or interpolating numbers', () => {
      const res = normalizeWeightSeries(mockWeightSeriesPartialEma);
      expect(res.points[0].ema_weight).toBeNull();
      expect(res.points[1].ema_weight).toBeNull();
      expect(res.points[2].ema_weight).toBe(68.0);
    });

    it('sorts points ascending by YYYY-MM-DD date string', () => {
      const unsorted = {
        series: [
          { date: '2026-10-20', weight_kg: 68.0 },
          { date: '2026-10-10', weight_kg: 69.0 },
          { date: '2026-10-15', weight_kg: 68.5 },
        ],
      };
      const res = normalizeWeightSeries(unsorted);
      expect(res.points.map((p) => p.date)).toEqual([
        '2026-10-10',
        '2026-10-15',
        '2026-10-20',
      ]);
    });

    it('deduplicates multiple entries for the same date by keeping the last record', () => {
      const dup = {
        series: [
          { date: '2026-10-24', weight_kg: 68.0 },
          { date: '2026-10-24', weight_kg: 67.5 },
        ],
      };
      const res = normalizeWeightSeries(dup);
      expect(res.points).toHaveLength(1);
      expect(res.points[0].weight_kg).toBe(67.5);
    });

    it('gracefully handles null, array, empty or malformed inputs without throwing', () => {
      expect(normalizeWeightSeries(null).points).toEqual([]);
      expect(normalizeWeightSeries(undefined).points).toEqual([]);
      expect(normalizeWeightSeries({}).points).toEqual([]);
      expect(normalizeWeightSeries('invalid').points).toEqual([]);
      expect(normalizeWeightSeries([{ date: 'bad-date', weight: 'abc' }]).points).toEqual([]);
    });

    it('ensures warnings do not leak user metric values', () => {
      const res = normalizeWeightSeries([
        { date: 'bad-date', weight_kg: 999.99 },
      ]);
      expect(res.warnings.length).toBeGreaterThan(0);
      for (const w of res.warnings) {
        expect(w).not.toContain('999.99');
      }
    });
  });

  describe('normalizePatternInsights', () => {
    it('normalizes analyzed pattern insights with patterns array', () => {
      const res = normalizePatternInsights(mockPatternInsightsAnalyzed);
      expect(res.status).toBe('analyzed');
      expect(res.isSufficientData).toBe(true);
      expect(res.loggedDaysCount).toBe(8);
      expect(res.patterns).toHaveLength(3);
      expect(res.patterns[0].pattern_code).toBe('skipping_breakfast');
    });

    it('normalizes insufficient data response when logged days < 5', () => {
      const res = normalizePatternInsights(mockPatternInsightsInsufficient);
      expect(res.status).toBe('insufficient_data');
      expect(res.isSufficientData).toBe(false);
      expect(res.patterns).toHaveLength(0);
      expect(res.minimumRequiredDays).toBe(5);
    });

    it('handles malformed insights response gracefully', () => {
      const res = normalizePatternInsights(null);
      expect(res.status).toBe('insufficient_data');
      expect(res.patterns).toEqual([]);
    });
  });

  describe('normalizeWeeklyCalories', () => {
    it('normalizes weekly aggregated mode if backend provides weeks', () => {
      const raw = {
        weeks: [
          { week_start: '2026-10-01', calories: 12500, days_logged: 7, target_calories: 14000 },
          { week_start: '2026-10-08', calories: 13000, days_logged: 6, target_calories: 14000 },
        ],
        target_calories: 2000,
      };
      const res = normalizeWeeklyCalories(raw);
      expect(res.mode).toBe('weekly');
      expect(res.bars).toHaveLength(2);
      expect(res.bars[0].daysLogged).toBe(7);
      expect(res.bars[0].isSufficientData).toBe(true);
    });

    it('falls back to dailyFallback mode (ADR-W5-03) when only daily records exist', () => {
      const raw = {
        daily_rows: [
          { date: '2026-10-10', calories: 1850 },
          { date: '2026-10-11', calories: 1920 },
        ],
        target_tdee_calories: 2000,
      };
      const res = normalizeWeeklyCalories(raw);
      expect(res.mode).toBe('dailyFallback');
      expect(res.bars).toHaveLength(2);
      expect(res.bars[0].label).toBe('10/10');
      expect(res.targetCalories).toBe(2000);
    });
  });

  describe('normalizeSwapResponse', () => {
    it('normalizes food swap response with source food and delta fields', () => {
      const res = normalizeSwapResponse(mockFoodSwapResponse);
      expect(res.status).toBe('success');
      expect(res.sourceFood?.food_name).toBe('Cơm tấm sườn nướng');
      expect(res.alternatives).toHaveLength(2);
      expect(res.alternatives[0].food_name).toBe('Phở gà xé');
      expect(res.alternatives[0].delta_calories).toBe(-342.5);
      expect(res.alternatives[0].delta_price_vnd).toBe(-5000);
    });

    it('handles empty or malformed alternatives gracefully', () => {
      const res = normalizeSwapResponse({ status: 'success', alternatives: [] });
      expect(res.alternatives).toHaveLength(0);
      expect(res.sourceFood).toBeNull();
    });
  });

  describe('normalizeVoiceResult', () => {
    it('normalizes voice result with adjusted items and summary', () => {
      const raw = {
        success: true,
        note: 'thêm một muỗng dầu ăn',
        items: [
          { food_id: 1, food_name: 'Phở bò tái', estimated_gram: 400 },
          { food_id: 100, food_name: 'Dầu ăn', estimated_gram: 15 },
        ],
        modifiers_summary: 'Đã bổ sung 15g dầu ăn',
      };
      const res = normalizeVoiceResult(raw);
      expect(res.success).toBe(true);
      expect(res.adjustedItems).toHaveLength(2);
      expect(res.adjustedItems?.[1].source).toBe('voice');
      expect(res.modifiersSummary).toBe('Đã bổ sung 15g dầu ăn');
    });

    it('falls back safely when items are not present', () => {
      const res = normalizeVoiceResult({}, 'ghi chú');
      expect(res.success).toBe(true);
      expect(res.note).toBe('ghi chú');
      expect(res.adjustedItems).toBeUndefined();
    });
  });
});
