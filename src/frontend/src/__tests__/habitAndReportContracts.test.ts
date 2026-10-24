import { describe, it, expect } from 'vitest';
import { normalizeHabitStatus, habitStatusSchema } from '../api/habitContract';
import { normalizeMonthlyReport, monthlyReportSchema, REPORT_NOTICES } from '../api/reportContract';

describe('Step 2: Habit & Monthly Report Contracts (Tolerant Reader)', () => {
  describe('habitContract: normalizeHabitStatus', () => {
    it('1. correctly normalizes full backend response with snake_case', () => {
      const mockRaw = {
        current_streak: 5,
        longest_streak: 12,
        total_logged_days: 20,
        logged_dates_last_7_days: ['2026-10-20', '2026-10-21', '2026-10-22'],
        seven_day_challenge: {
          window_start: '2026-10-18',
          window_end: '2026-10-24',
          completed_days: 5,
          target_days: 7,
          progress_pct: 71.4,
          is_completed: false,
          badge_name: 'Người Đồng Hành Đều Đặn',
        },
        back_on_track: {
          back_on_track_active: false,
          trigger_reason: 'on_track',
          calorie_penalty_applied: false,
          next_day_target_calories: 2000,
          encouragement_message: 'Bạn đang duy trì nhịp điệu rất tuyệt vời!',
          suggested_micro_action: 'Uống đủ nước.',
        },
        disclaimer: 'Số liệu mang tính chất khích lệ.',
      };

      const result = normalizeHabitStatus(mockRaw);
      expect(result.streak.currentStreak).toBe(5);
      expect(result.streak.longestStreak).toBe(12);
      expect(result.streak.totalLoggedDays).toBe(20);
      expect(result.sevenDayChallenge.completedDays).toBe(5);
      expect(result.sevenDayChallenge.badgeName).toBe('Người Đồng Hành Đều Đặn');
      expect(result.backOnTrack.active).toBe(false);
      expect(result.backOnTrack.caloriePenaltyApplied).toBe(false);
    });

    it('2. tolerates camelCase fields and nested streak object', () => {
      const mockRaw = {
        streak: {
          currentStreak: 7,
          longestStreak: 14,
          totalLoggedDays: 25,
          loggedDatesLast7Days: ['2026-10-24'],
        },
        sevenDayChallenge: {
          completedDays: 7,
          targetDays: 7,
          progressPct: 100,
          isCompleted: true,
          badgeName: 'Chiến binh 7 Ngày Bền Bỉ',
        },
        backOnTrack: {
          active: true,
          triggerReason: 'missed_day',
          caloriePenaltyApplied: false,
          encouragementMessage: 'Bỏ lỡ một ngày là bình thường.',
        },
      };

      const result = normalizeHabitStatus(mockRaw);
      expect(result.streak.currentStreak).toBe(7);
      expect(result.sevenDayChallenge.isCompleted).toBe(true);
      expect(result.backOnTrack.active).toBe(true);
      expect(result.backOnTrack.triggerReason).toBe('missed_day');
    });

    it('3. returns safe non-punitive defaults when given null/empty input', () => {
      const result = normalizeHabitStatus(null);
      expect(result.streak.currentStreak).toBe(0);
      expect(result.streak.longestStreak).toBe(0);
      expect(result.sevenDayChallenge.completedDays).toBe(0);
      expect(result.sevenDayChallenge.badgeName).toBe('Hành Trình Mới');
      expect(result.backOnTrack.active).toBe(false);
      expect(result.backOnTrack.caloriePenaltyApplied).toBe(false);
      expect(result.disclaimer).toBeTruthy();
    });

    it('4. sanitizes negative numbers and invalid reason codes', () => {
      const mockRaw = {
        current_streak: -5,
        longest_streak: -10,
        back_on_track: {
          trigger_reason: 'unsupported_code_123',
        },
      };

      const result = normalizeHabitStatus(mockRaw);
      expect(result.streak.currentStreak).toBe(0);
      expect(result.streak.longestStreak).toBe(0);
      expect(result.backOnTrack.triggerReason).toBe('on_track');
    });

    it('5. strictly validates against habitStatusSchema', () => {
      const validated = habitStatusSchema.safeParse(normalizeHabitStatus({}));
      expect(validated.success).toBe(true);
    });
  });

  describe('reportContract: normalizeMonthlyReport', () => {
    it('6. correctly normalizes full monthly report from backend', () => {
      const mockRaw = {
        month: '2026-10',
        period: {
          start_date: '2026-10-01',
          end_date: '2026-10-31',
          period_days: 31,
        },
        logging_summary: {
          total_logged_days: 15,
          total_meals_logged: 42,
          consistency_rate_pct: 48.4,
        },
        weight_summary: {
          start_weight_kg: 70.5,
          end_weight_kg: 69.8,
          raw_weight_change_kg: -0.7,
          ema_start_kg: 70.4,
          ema_end_kg: 69.9,
          ema_weight_change_kg: -0.5,
          trend_direction: 'decreasing',
          records_count: 8,
        },
        nutrition_summary: {
          avg_daily_calories: 1950.5,
          avg_protein_g: 110.2,
          avg_carbs_g: 210.0,
          avg_fat_g: 52.0,
          target_tdee_calories: 2000,
        },
        strengths: ['Duy trì thói quen ghi nhật ký', 'Cung cấp nguồn protein tốt'],
        summary: {
          totalCalories: 29257.5,
          averageDailyCalories: 1950.5,
        },
        days: [
          { date: '2026-10-01', state: 'available', calories: 2050, proteinG: 120, carbsG: 220, fatG: 55 },
        ],
      };

      const result = normalizeMonthlyReport(mockRaw);
      expect(result.month).toBe('2026-10');
      expect(result.loggingSummary.totalLoggedDays).toBe(15);
      expect(result.weightSummary.startWeightKg).toBe(70.5);
      expect(result.weightSummary.trendDirection).toBe('decreasing');
      expect(result.nutritionSummary.avgDailyCalories).toBe(1950.5);
      expect(result.strengths.length).toBe(2);
      expect(result.insufficient).toBe(false);
      expect(result.notices.length).toBe(3);
      expect(result.days.length).toBe(1);
    });

    it('7. detects insufficient state when totalLoggedDays === 0 and recordsCount === 0', () => {
      const mockRaw = {
        month: '2026-10',
        logging_summary: { total_logged_days: 0 },
        weight_summary: { records_count: 0 },
      };

      const result = normalizeMonthlyReport(mockRaw);
      expect(result.insufficient).toBe(true);
    });

    it('8. preserves null for missing weight logs without guessing or fabricating data', () => {
      const mockRaw = {
        month: '2026-10',
        weight_summary: {
          start_weight_kg: null,
          end_weight_kg: null,
          raw_weight_change_kg: null,
          trend_direction: 'insufficient_data',
        },
      };

      const result = normalizeMonthlyReport(mockRaw);
      expect(result.weightSummary.startWeightKg).toBeNull();
      expect(result.weightSummary.endWeightKg).toBeNull();
      expect(result.weightSummary.rawWeightChangeKg).toBeNull();
      expect(result.weightSummary.trendDirection).toBe('insufficient_data');
    });

    it('9. enforces the 3 mandatory transparent disclaimers', () => {
      const result = normalizeMonthlyReport({});
      expect(result.notices).toEqual([...REPORT_NOTICES]);
      expect(result.notices).toContain('Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.');
      expect(result.notices).toContain('Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo.');
      expect(result.notices).toContain('Báo cáo không thay thế tư vấn y khoa.');
    });

    it('10. parses gracefully without throwing when given completely empty or invalid input', () => {
      expect(() => normalizeMonthlyReport(null, '2026-09')).not.toThrow();
      const result = normalizeMonthlyReport(undefined, '2026-09');
      expect(result.month).toBe('2026-09');
      expect(result.insufficient).toBe(true);
      expect(monthlyReportSchema.safeParse(result).success).toBe(true);
    });
  });
});
