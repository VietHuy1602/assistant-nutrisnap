/**
 * src/frontend/src/api/progressContract.ts
 * Tolerant Reader normalizers and Zod schemas for Progress Analytics (Weight trend, Patterns, Weekly calories).
 * ADR-W5-01, ADR-W5-02, ADR-W5-03 of NS-FE-W5-001.
 */

import { z } from 'zod';

// Centralized aliases: maps backend fields to standardized frontend interface
const WEIGHT_ALIASES = {
  series: ['series', 'weights', 'weight_logs', 'data', 'items'],
  date: ['date', 'logged_date', 'day'],
  weight: ['weight_kg', 'raw_weight_kg', 'weight', 'actual_weight'],
  ema: ['ema_weight_kg', 'ema_weight', 'ema', 'trend_weight'],
} as const;

const firstDefined = (o: Record<string, unknown>, keys: readonly string[]) =>
  keys.map((k) => o[k]).find((v) => v !== undefined);

export const weightPointSchema = z.object({
  date: z.string().min(8), // string matching YYYY-MM-DD
  weight_kg: z.number().nullable().optional(),
  ema_weight: z.number().nullable().optional(), // ADR-W5-02: nullable/optional
});
export type WeightPoint = z.infer<typeof weightPointSchema>;

export interface NormalizedWeightSeries {
  points: WeightPoint[];
  pointsCount: number;
  latestWeightKg: number | null;
  latestEmaKg: number | null;
  startWeightKg: number | null;
  rawChangeKg: number | null;
  emaChangeKg: number | null;
  disclaimer: string;
  warnings: string[];
}

export function normalizeWeightSeries(raw: unknown): NormalizedWeightSeries {
  const warnings: string[] = []; // Cảnh báo chỉ chứa tên field, không lộ giá trị người dùng
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(raw)
    ? raw
    : ((firstDefined(root, WEIGHT_ALIASES.series) as unknown[] | undefined) ?? []);

  const byDate = new Map<string, WeightPoint>();

  if (Array.isArray(list)) {
    for (const item of list) {
      const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const rawDate = firstDefined(o, WEIGHT_ALIASES.date);
      const rawWeight = firstDefined(o, WEIGHT_ALIASES.weight);
      const rawEma = firstDefined(o, WEIGHT_ALIASES.ema);

      const parsed = weightPointSchema.safeParse({
        date: typeof rawDate === 'string' ? rawDate.slice(0, 10) : '',
        weight_kg: typeof rawWeight === 'number' && Number.isFinite(rawWeight) ? rawWeight : null,
        ema_weight: typeof rawEma === 'number' && Number.isFinite(rawEma) ? rawEma : null,
      });

      if (parsed.success) {
        if (parsed.data.date.length === 10) {
          byDate.set(parsed.data.date, parsed.data);
        } else {
          warnings.push('point.date:invalid_length');
        }
      } else {
        warnings.push(...parsed.error.issues.map((i) => `point.${i.path.join('.')}:${i.code}`));
      }
    }
  }

  // Sắp xếp chuỗi ngày tăng dần theo chuẩn YYYY-MM-DD (Zero-Math string sort)
  const points = [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  return {
    points,
    pointsCount: typeof root.points_count === 'number' ? root.points_count : points.length,
    latestWeightKg: numOrNull(root.latest_weight_kg),
    latestEmaKg: numOrNull(root.latest_ema_kg),
    startWeightKg: numOrNull(root.start_weight_kg),
    rawChangeKg: numOrNull(root.raw_change_kg),
    emaChangeKg: numOrNull(root.ema_change_kg),
    disclaimer: typeof root.disclaimer === 'string' ? root.disclaimer : '',
    warnings,
  };
}

// ============================================================================
// PATTERN INSIGHTS CONTRACT
// ============================================================================

export interface PatternInsightItem {
  pattern_code: string;
  title: string;
  severity: string;
  recommendation: string;
  metrics?: Record<string, unknown>;
}

export interface NormalizedPatternInsights {
  status: 'analyzed' | 'insufficient_data' | 'error';
  isSufficientData: boolean;
  loggedDaysCount: number;
  minimumRequiredDays: number;
  patterns: PatternInsightItem[];
  lockedDailyTargetCalories: number | null;
  message?: string;
  disclaimer?: string;
  warnings: string[];
}

export function normalizePatternInsights(raw: unknown): NormalizedPatternInsights {
  const warnings: string[] = [];
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const isSufficient = Boolean(root.is_sufficient_data);
  const rawStatus = typeof root.status === 'string' ? root.status : '';
  const status: 'analyzed' | 'insufficient_data' | 'error' =
    rawStatus === 'analyzed' || isSufficient ? 'analyzed' : 'insufficient_data';

  const loggedDays = typeof root.logged_days_count === 'number' ? root.logged_days_count : 0;
  const minDays = typeof root.minimum_required_days === 'number' ? root.minimum_required_days : 5;
  const lockedCalories =
    typeof root.locked_daily_target_calories === 'number'
      ? root.locked_daily_target_calories
      : null;

  const patternsList = Array.isArray(root.patterns) ? root.patterns : [];
  const patterns: PatternInsightItem[] = [];

  for (const item of patternsList) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const code = typeof o.pattern_code === 'string' ? o.pattern_code : 'unknown';
      const title = typeof o.title === 'string' ? o.title : 'Nhận xét thói quen';
      const severity = typeof o.severity === 'string' ? o.severity : 'gentle_reminder';
      const rec = typeof o.recommendation === 'string' ? o.recommendation : '';
      patterns.push({
        pattern_code: code,
        title,
        severity,
        recommendation: rec,
        metrics: o.metrics && typeof o.metrics === 'object' ? (o.metrics as Record<string, unknown>) : undefined,
      });
    }
  }

  return {
    status,
    isSufficientData: isSufficient,
    loggedDaysCount: loggedDays,
    minimumRequiredDays: minDays,
    patterns,
    lockedDailyTargetCalories: lockedCalories,
    message: typeof root.message === 'string' ? root.message : undefined,
    disclaimer: typeof root.disclaimer === 'string' ? root.disclaimer : undefined,
    warnings,
  };
}

// ============================================================================
// WEEKLY / DAILY FALLBACK CALORIES CONTRACT (ADR-W5-03)
// ============================================================================

export interface CalorieBarPoint {
  label: string; // e.g. "Tuần 24/10" or "24/10"
  dateKey: string; // ISO date or week start
  calories: number;
  daysLogged: number;
  targetCalories?: number;
  isSufficientData?: boolean;
}

export interface NormalizedCalorieBars {
  mode: 'weekly' | 'dailyFallback';
  bars: CalorieBarPoint[];
  targetCalories: number | null;
  disclaimer?: string;
  warnings: string[];
}

export function normalizeWeeklyCalories(raw: unknown): NormalizedCalorieBars {
  const warnings: string[] = [];
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // Check if backend provided aggregated weekly records
  if (Array.isArray(root.weeks) && root.weeks.length > 0) {
    const bars: CalorieBarPoint[] = [];
    for (const w of root.weeks) {
      if (w && typeof w === 'object') {
        const o = w as Record<string, unknown>;
        const start = typeof o.week_start === 'string' ? o.week_start.slice(0, 10) : '';
        const cal = typeof o.calories === 'number' ? o.calories : (typeof o.avg_calories === 'number' ? o.avg_calories : 0);
        const days = typeof o.days_logged === 'number' ? o.days_logged : 0;
        bars.push({
          label: typeof o.label === 'string' ? o.label : `Tuần ${start.slice(8, 10)}/${start.slice(5, 7)}`,
          dateKey: start,
          calories: cal,
          daysLogged: days,
          targetCalories: typeof o.target_calories === 'number' ? o.target_calories : undefined,
          isSufficientData: days >= 4,
        });
      }
    }
    return {
      mode: 'weekly',
      bars,
      targetCalories: typeof root.target_calories === 'number' ? root.target_calories : null,
      disclaimer: typeof root.disclaimer === 'string' ? root.disclaimer : undefined,
      warnings,
    };
  }

  // Phương án suy giảm D (dailyFallback): Đọc từ daily_rows hoặc data theo ngày
  const dailyList = Array.isArray(root.daily_rows)
    ? root.daily_rows
    : Array.isArray(root.days)
      ? root.days
      : Array.isArray(raw)
        ? raw
        : [];

  const bars: CalorieBarPoint[] = [];
  for (const item of dailyList) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const dateStr = typeof o.date === 'string' ? o.date.slice(0, 10) : '';
      const cal = typeof o.calories === 'number' ? o.calories : 0;
      if (dateStr.length === 10) {
        bars.push({
          label: `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`,
          dateKey: dateStr,
          calories: cal,
          daysLogged: 1,
        });
      }
    }
  }

  // Sắp xếp chuỗi ngày tăng dần
  bars.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  return {
    mode: 'dailyFallback',
    bars,
    targetCalories:
      typeof root.target_tdee_calories === 'number'
        ? root.target_tdee_calories
        : typeof root.target_calories === 'number'
          ? root.target_calories
          : null,
    disclaimer: 'Chưa có số liệu tổng hợp theo tuần. Hiển thị năng lượng từng ngày.',
    warnings,
  };
}
