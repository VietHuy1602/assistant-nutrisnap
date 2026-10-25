/**
 * src/frontend/src/api/reportContract.ts
 * Tolerant Reader Zod Schemas & Normalizer for Monthly Report (/api/v1/reports/monthly).
 * Tuân thủ Zero-Math (M3): các số liệu trung bình/tổng do backend tính, Frontend không tự tính.
 */

import { z } from 'zod';
import { habitStatusSchema, normalizeHabitStatus, type HabitStatus } from './habitContract';

export const REPORT_NOTICES = [
  'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
  'Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo.',
  'Báo cáo không thay thế tư vấn y khoa.',
] as const;

const firstDefined = <T>(obj: Record<string, unknown>, keys: readonly string[]): T | undefined => {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k] as T;
  }
  return undefined;
};

const numOrNull = z.number().nullable().optional();

export const reportPeriodSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  periodDays: z.number().int().nonnegative().default(30),
});

export const reportLoggingSummarySchema = z.object({
  totalLoggedDays: z.number().int().nonnegative().default(0),
  totalMealsLogged: z.number().int().nonnegative().default(0),
  consistencyRatePct: z.number().nonnegative().default(0),
  periodDays: z.number().int().nonnegative().default(30),
});

export const reportWeightSummarySchema = z.object({
  startWeightKg: numOrNull,
  endWeightKg: numOrNull,
  rawWeightChangeKg: numOrNull,
  emaStartKg: numOrNull,
  emaEndKg: numOrNull,
  emaWeightChangeKg: numOrNull,
  trendDirection: z
    .enum(['stable', 'increasing', 'decreasing', 'insufficient_data'])
    .default('insufficient_data'),
  recordsCount: z.number().int().nonnegative().default(0),
});

export const reportNutritionSummarySchema = z.object({
  avgDailyCalories: numOrNull,
  avgProteinG: numOrNull,
  avgCarbsG: numOrNull,
  avgFatG: numOrNull,
  targetTdeeCalories: numOrNull,
  targetProteinG: numOrNull,
  targetCarbsG: numOrNull,
  targetFatG: numOrNull,
});

export const reportDayRowSchema = z.object({
  date: z.string(),
  state: z.enum(['available', 'unavailable', 'error', 'future', 'invalid']).default('available'),
  calories: numOrNull,
  proteinG: numOrNull,
  carbsG: numOrNull,
  fatG: numOrNull,
});

export type ReportDayRow = z.infer<typeof reportDayRowSchema>;

export const monthlyReportSchema = z.object({
  month: z.string(), // YYYY-MM
  period: reportPeriodSchema,
  loggingSummary: reportLoggingSummarySchema,
  weightSummary: reportWeightSummarySchema,
  nutritionSummary: reportNutritionSummarySchema,
  habitSummary: habitStatusSchema.optional(),
  strengths: z.array(z.string()).default([]),
  disclaimer: z.string().default(REPORT_NOTICES[0]),
  notices: z.array(z.string()).default([...REPORT_NOTICES]),
  insufficient: z.boolean().default(false),
  days: z.array(reportDayRowSchema).default([]),
  summary: z
    .object({
      totalCalories: numOrNull,
      averageDailyCalories: numOrNull,
    })
    .default({}),
});

export type MonthlyReport = z.infer<typeof monthlyReportSchema>;

export function normalizeMonthlyReport(raw: unknown, requestedMonth?: string): MonthlyReport {
  if (!raw || typeof raw !== 'object') {
    const fallbackMonth = requestedMonth || '2026-10';
    return monthlyReportSchema.parse({
      month: fallbackMonth,
      period: {},
      loggingSummary: {},
      weightSummary: {},
      nutritionSummary: {},
      strengths: [],
      insufficient: true,
      days: [],
      summary: {},
    });
  }

  const r = raw as Record<string, unknown>;
  const month = String(firstDefined<string>(r, ['month', 'report_month']) || requestedMonth || '2026-10');

  // Logging summary aliases
  const rawLogging = (r.logging_summary || r.loggingSummary || {}) as Record<string, unknown>;
  const totalLoggedDays = Number(
    firstDefined<number>(r, ['total_logged_days', 'totalLoggedDays', 'days_logged']) ??
      firstDefined<number>(rawLogging, ['total_logged_days', 'totalLoggedDays']) ??
      0
  );
  const totalMealsLogged = Number(
    firstDefined<number>(r, ['total_meals_logged', 'totalMealsLogged', 'meals_logged']) ??
      firstDefined<number>(rawLogging, ['total_meals_logged', 'totalMealsLogged']) ??
      0
  );
  const consistencyRatePct = Number(
    firstDefined<number>(r, ['consistency_rate_pct', 'consistencyRatePct']) ??
      firstDefined<number>(rawLogging, ['consistency_rate_pct', 'consistencyRatePct']) ??
      0
  );
  const periodDays = Number(
    firstDefined<number>(rawLogging, ['period_days', 'periodDays']) ?? 30
  );

  // Weight summary aliases
  const rawWeight = (r.weight_summary || r.weightSummary || {}) as Record<string, unknown>;
  const startWeightKg = firstDefined<number>(rawWeight, ['start_weight_kg', 'startWeightKg', 'weight_start']);
  const endWeightKg = firstDefined<number>(rawWeight, ['end_weight_kg', 'endWeightKg', 'weight_end']);
  const rawWeightChangeKg = firstDefined<number>(rawWeight, [
    'raw_weight_change_kg',
    'rawWeightChangeKg',
    'weight_change',
  ]);
  const emaStartKg = firstDefined<number>(rawWeight, ['ema_start_kg', 'emaStartKg']);
  const emaEndKg = firstDefined<number>(rawWeight, ['ema_end_kg', 'emaEndKg']);
  const emaWeightChangeKg = firstDefined<number>(rawWeight, ['ema_weight_change_kg', 'emaWeightChangeKg']);
  const rawTrend = String(firstDefined<string>(rawWeight, ['trend_direction', 'trendDirection']) ?? 'insufficient_data');
  const trendDirection = (['stable', 'increasing', 'decreasing', 'insufficient_data'].includes(rawTrend)
    ? rawTrend
    : 'insufficient_data') as 'stable' | 'increasing' | 'decreasing' | 'insufficient_data';
  const recordsCount = Number(firstDefined<number>(rawWeight, ['records_count', 'recordsCount']) ?? 0);

  // Nutrition summary aliases
  const rawNutrition = (r.nutrition_summary || r.nutritionSummary || {}) as Record<string, unknown>;
  const avgDailyCalories = firstDefined<number>(rawNutrition, [
    'avg_daily_calories',
    'avgDailyCalories',
    'average_calories',
    'avg_kcal',
  ]);
  const avgProteinG = firstDefined<number>(rawNutrition, ['avg_protein_g', 'avgProteinG', 'avg_protein']);
  const avgCarbsG = firstDefined<number>(rawNutrition, ['avg_carbs_g', 'avgCarbsG', 'avg_carbs']);
  const avgFatG = firstDefined<number>(rawNutrition, ['avg_fat_g', 'avgFatG', 'avg_fat']);
  const targetTdeeCalories = firstDefined<number>(rawNutrition, [
    'target_tdee_calories',
    'targetTdeeCalories',
    'tdee',
  ]);
  const targetProteinG = firstDefined<number>(rawNutrition, ['target_protein_g', 'targetProteinG']);
  const targetCarbsG = firstDefined<number>(rawNutrition, ['target_carbs_g', 'targetCarbsG']);
  const targetFatG = firstDefined<number>(rawNutrition, ['target_fat_g', 'targetFatG']);

  // Strengths
  const rawStrengths = firstDefined<string[]>(r, ['strengths', 'insights']);
  const strengths = Array.isArray(rawStrengths) ? rawStrengths.filter((s) => typeof s === 'string') : [];

  // Habit summary
  let habitSummary: HabitStatus | undefined = undefined;
  if (r.habit_summary || r.habitSummary) {
    habitSummary = normalizeHabitStatus(r.habit_summary || r.habitSummary);
  }

  // Days list
  const rawDays = (Array.isArray(r.days) ? r.days : []) as Array<Record<string, unknown>>;
  const days: ReportDayRow[] = rawDays.map((d) => ({
    date: String(d.date || ''),
    state: (['available', 'unavailable', 'error', 'future', 'invalid'].includes(String(d.state))
      ? d.state
      : 'available') as ReportDayRow['state'],
    calories: typeof d.calories === 'number' && Number.isFinite(d.calories) ? d.calories : null,
    proteinG: typeof d.proteinG === 'number' && Number.isFinite(d.proteinG) ? d.proteinG : null,
    carbsG: typeof d.carbsG === 'number' && Number.isFinite(d.carbsG) ? d.carbsG : null,
    fatG: typeof d.fatG === 'number' && Number.isFinite(d.fatG) ? d.fatG : null,
  }));

  // Summary object
  const rawSummary = (r.summary && typeof r.summary === 'object' ? r.summary : {}) as Record<string, unknown>;
  const totalCalories = firstDefined<number>(rawSummary, ['totalCalories', 'total_calories']);
  const averageDailyCalories = firstDefined<number>(rawSummary, [
    'averageDailyCalories',
    'avg_calories',
    'avgDailyCalories',
  ]);

  // Insufficient flag
  const isInsufficient =
    Boolean(firstDefined<boolean>(r, ['insufficient', 'not_enough_data'])) ||
    (totalLoggedDays === 0 && recordsCount === 0);

  return monthlyReportSchema.parse({
    month,
    period: {
      startDate: firstDefined<string>(r.period as Record<string, unknown> || {}, ['start_date', 'startDate']),
      endDate: firstDefined<string>(r.period as Record<string, unknown> || {}, ['end_date', 'endDate']),
      periodDays,
    },
    loggingSummary: {
      totalLoggedDays,
      totalMealsLogged,
      consistencyRatePct,
      periodDays,
    },
    weightSummary: {
      startWeightKg: typeof startWeightKg === 'number' && Number.isFinite(startWeightKg) ? startWeightKg : null,
      endWeightKg: typeof endWeightKg === 'number' && Number.isFinite(endWeightKg) ? endWeightKg : null,
      rawWeightChangeKg:
        typeof rawWeightChangeKg === 'number' && Number.isFinite(rawWeightChangeKg) ? rawWeightChangeKg : null,
      emaStartKg: typeof emaStartKg === 'number' && Number.isFinite(emaStartKg) ? emaStartKg : null,
      emaEndKg: typeof emaEndKg === 'number' && Number.isFinite(emaEndKg) ? emaEndKg : null,
      emaWeightChangeKg:
        typeof emaWeightChangeKg === 'number' && Number.isFinite(emaWeightChangeKg) ? emaWeightChangeKg : null,
      trendDirection,
      recordsCount,
    },
    nutritionSummary: {
      avgDailyCalories:
        typeof avgDailyCalories === 'number' && Number.isFinite(avgDailyCalories) ? avgDailyCalories : null,
      avgProteinG: typeof avgProteinG === 'number' && Number.isFinite(avgProteinG) ? avgProteinG : null,
      avgCarbsG: typeof avgCarbsG === 'number' && Number.isFinite(avgCarbsG) ? avgCarbsG : null,
      avgFatG: typeof avgFatG === 'number' && Number.isFinite(avgFatG) ? avgFatG : null,
      targetTdeeCalories:
        typeof targetTdeeCalories === 'number' && Number.isFinite(targetTdeeCalories) ? targetTdeeCalories : null,
      targetProteinG: typeof targetProteinG === 'number' && Number.isFinite(targetProteinG) ? targetProteinG : null,
      targetCarbsG: typeof targetCarbsG === 'number' && Number.isFinite(targetCarbsG) ? targetCarbsG : null,
      targetFatG: typeof targetFatG === 'number' && Number.isFinite(targetFatG) ? targetFatG : null,
    },
    habitSummary,
    strengths,
    disclaimer: String(firstDefined<string>(r, ['disclaimer', 'notice']) || REPORT_NOTICES[0]),
    notices: [...REPORT_NOTICES],
    insufficient: isInsufficient,
    days,
    summary: {
      totalCalories: typeof totalCalories === 'number' && Number.isFinite(totalCalories) ? totalCalories : null,
      averageDailyCalories:
        typeof averageDailyCalories === 'number' && Number.isFinite(averageDailyCalories)
          ? averageDailyCalories
          : (typeof avgDailyCalories === 'number' ? avgDailyCalories : null),
    },
  });
}
