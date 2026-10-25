/**
 * src/frontend/src/api/habitContract.ts
 * Tolerant Reader Zod Schemas & Normalizer for Habit Tracker (/api/v1/habits/status).
 * Tuân thủ Zero-Math (M3): không tự tính toán streak hay phần trăm ở client.
 */

import { z } from 'zod';

const firstDefined = <T>(obj: Record<string, unknown>, keys: readonly string[]): T | undefined => {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k] as T;
  }
  return undefined;
};

export const sevenDayChallengeSchema = z.object({
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  completedDays: z.number().int().nonnegative().default(0),
  targetDays: z.number().int().positive().default(7),
  progressPct: z.number().nonnegative().default(0),
  isCompleted: z.boolean().default(false),
  badgeName: z.string().default('Hành Trình Mới'),
});

export type SevenDayChallenge = z.infer<typeof sevenDayChallengeSchema>;

export const backOnTrackSchema = z.object({
  active: z.boolean().default(false),
  triggerReason: z.enum(['on_track', 'missed_day', 'over_target_calories']).default('on_track'),
  caloriePenaltyApplied: z.boolean().default(false),
  nextDayTargetCalories: z.number().nullable().optional(),
  encouragementMessage: z.string().default(
    'Chào mừng bạn đến với NutriSnap! Hãy tiếp tục duy trì thói quen tích cực nhé.'
  ),
  suggestedMicroAction: z.string().default('Ghi nhận 1 bữa ăn lành mạnh hôm nay.'),
});

export type BackOnTrack = z.infer<typeof backOnTrackSchema>;

export const streakSummarySchema = z.object({
  currentStreak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  totalLoggedDays: z.number().int().nonnegative().default(0),
  loggedDatesLast7Days: z.array(z.string()).default([]),
});

export type StreakSummary = z.infer<typeof streakSummarySchema>;

export const habitStatusSchema = z.object({
  streak: streakSummarySchema,
  sevenDayChallenge: sevenDayChallengeSchema,
  backOnTrack: backOnTrackSchema,
  disclaimer: z.string().default(
    'Số liệu thói quen và chuỗi ngày duy trì mang tính chất khích lệ, đồng hành cùng bạn trên hành trình chăm sóc sức khỏe.'
  ),
  referenceDate: z.string().optional(),
});

export type HabitStatus = z.infer<typeof habitStatusSchema>;

export function normalizeHabitStatus(raw: unknown): HabitStatus {
  if (!raw || typeof raw !== 'object') {
    return habitStatusSchema.parse({
      streak: {},
      sevenDayChallenge: {},
      backOnTrack: {},
    });
  }

  const r = raw as Record<string, unknown>;

  // Streak aliases
  const rawStreak = (r.streak && typeof r.streak === 'object' ? r.streak : {}) as Record<string, unknown>;
  const currentStreak = Number(
    firstDefined<number>(r, ['current_streak', 'currentStreak']) ??
      firstDefined<number>(rawStreak, ['current_streak', 'currentStreak']) ??
      0
  );
  const longestStreak = Number(
    firstDefined<number>(r, ['longest_streak', 'longestStreak']) ??
      firstDefined<number>(rawStreak, ['longest_streak', 'longestStreak']) ??
      0
  );
  const totalLoggedDays = Number(
    firstDefined<number>(r, ['total_logged_days', 'totalLoggedDays', 'logged_days']) ??
      firstDefined<number>(rawStreak, ['total_logged_days', 'totalLoggedDays']) ??
      0
  );
  const loggedDatesLast7Days = (firstDefined<string[]>(r, [
    'logged_dates_last_7_days',
    'loggedDatesLast7Days',
  ]) ??
    firstDefined<string[]>(rawStreak, ['logged_dates_last_7_days', 'loggedDatesLast7Days']) ??
    []) as string[];

  // 7-day challenge aliases
  const rawChallenge = (r.seven_day_challenge || r.sevenDayChallenge || {}) as Record<string, unknown>;
  const completedDays = Number(
    firstDefined<number>(rawChallenge, ['completed_days', 'completedDays']) ?? 0
  );
  const targetDays = Number(
    firstDefined<number>(rawChallenge, ['target_days', 'targetDays']) ?? 7
  );
  const progressPct = Number(
    firstDefined<number>(rawChallenge, ['progress_pct', 'progressPct']) ??
      (targetDays > 0 ? (completedDays / targetDays) * 100 : 0)
  );
  const isCompleted = Boolean(
    firstDefined<boolean>(rawChallenge, ['is_completed', 'isCompleted']) ?? (completedDays >= targetDays)
  );
  const badgeName = String(
    firstDefined<string>(rawChallenge, ['badge_name', 'badgeName']) ?? 'Hành Trình Mới'
  );

  // Back-on-track aliases
  const rawBot = (r.back_on_track || r.backOnTrack || {}) as Record<string, unknown>;
  const botActive = Boolean(
    firstDefined<boolean>(rawBot, ['back_on_track_active', 'backOnTrackActive', 'active']) ?? false
  );
  const rawReason = String(
    firstDefined<string>(rawBot, ['trigger_reason', 'triggerReason']) ?? 'on_track'
  );
  const triggerReason = (['on_track', 'missed_day', 'over_target_calories'].includes(rawReason)
    ? rawReason
    : 'on_track') as 'on_track' | 'missed_day' | 'over_target_calories';

  const caloriePenaltyApplied = Boolean(
    firstDefined<boolean>(rawBot, ['calorie_penalty_applied', 'caloriePenaltyApplied']) ?? false
  );
  const nextDayTargetCalories = firstDefined<number>(rawBot, [
    'next_day_target_calories',
    'nextDayTargetCalories',
  ]);
  const encouragementMessage = String(
    firstDefined<string>(rawBot, ['encouragement_message', 'encouragementMessage']) ??
      'Chào mừng bạn đến với NutriSnap! Hãy tiếp tục duy trì thói quen tích cực nhé.'
  );
  const suggestedMicroAction = String(
    firstDefined<string>(rawBot, ['suggested_micro_action', 'suggestedMicroAction']) ??
      'Ghi nhận 1 bữa ăn lành mạnh hôm nay.'
  );

  const disclaimer = String(
    firstDefined<string>(r, ['disclaimer', 'notice']) ??
      'Số liệu thói quen và chuỗi ngày duy trì mang tính chất khích lệ, đồng hành cùng bạn trên hành trình chăm sóc sức khỏe.'
  );
  const referenceDate = firstDefined<string>(r, ['reference_date', 'referenceDate']);

  return habitStatusSchema.parse({
    streak: {
      currentStreak: Number.isFinite(currentStreak) && currentStreak >= 0 ? currentStreak : 0,
      longestStreak: Number.isFinite(longestStreak) && longestStreak >= 0 ? longestStreak : 0,
      totalLoggedDays: Number.isFinite(totalLoggedDays) && totalLoggedDays >= 0 ? totalLoggedDays : 0,
      loggedDatesLast7Days: Array.isArray(loggedDatesLast7Days) ? loggedDatesLast7Days : [],
    },
    sevenDayChallenge: {
      windowStart: firstDefined<string>(rawChallenge, ['window_start', 'windowStart']),
      windowEnd: firstDefined<string>(rawChallenge, ['window_end', 'windowEnd']),
      completedDays: Number.isFinite(completedDays) && completedDays >= 0 ? completedDays : 0,
      targetDays: Number.isFinite(targetDays) && targetDays > 0 ? targetDays : 7,
      progressPct: Number.isFinite(progressPct) && progressPct >= 0 ? progressPct : 0,
      isCompleted,
      badgeName,
    },
    backOnTrack: {
      active: botActive,
      triggerReason,
      caloriePenaltyApplied,
      nextDayTargetCalories:
        typeof nextDayTargetCalories === 'number' && Number.isFinite(nextDayTargetCalories)
          ? nextDayTargetCalories
          : null,
      encouragementMessage,
      suggestedMicroAction,
    },
    disclaimer,
    referenceDate,
  });
}
