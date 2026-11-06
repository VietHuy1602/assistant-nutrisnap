/**
 * src/frontend/src/api/preferenceApi.ts
 * Bộ câu hỏi khi tạo tài khoản: lưu câu trả lời, AI tổng hợp hồ sơ ăn uống.
 */

import { apiClient } from './client';

export type Choice = 'A' | 'B' | 'C' | 'D';

export interface PreferenceAnswers {
  age_group: Choice;
  activity: Choice;
  goal: Choice;
  pace: Choice;
  diet: Choice;
  taste: Choice;
  protein: Choice;
  allergies: string;
  cooking: Choice;
  meals: Choice;
  daily_budget_vnd: number;
}

export interface Preferences extends PreferenceAnswers {
  summary: string;
  summary_source: 'ai' | 'rule';
  avoid_keywords: string[];
  avoid_groups: string[];
}

export interface NeedsAnalysis {
  headline: string;
  needs: string[];
  recommendations: string[];
  sample_day: string[];
  cautions: string[];
  source: 'ai' | 'rule';
  target_calories: number;
}

/** Khảo sát ban đầu → giá trị điền sẵn cho trang Mục tiêu (người dùng cụ thể hoá thêm). */
export function goalDefaultsFromSurvey(p: PreferenceAnswers) {
  const age = { A: 17, B: 21, C: 29, D: 40 }[p.age_group];
  const activity = ({ A: 'sedentary', B: 'light', C: 'moderate', D: 'very_active' } as const)[p.activity];
  const goal_type = ({ A: 'lose_weight', B: 'maintain', C: 'gain_muscle', D: 'maintain' } as const)[p.goal];
  const pace = { A: 0.25, B: 0.5, C: 0.75, D: 0 }[p.pace] || 0.25;
  // Tăng cơ an toàn tối đa 0,5 kg/tuần
  const weekly_pace_kg = goal_type === 'maintain' ? 0 : goal_type === 'gain_muscle' ? Math.min(pace, 0.5) : pace;
  return { age, activity_level: activity, goal_type, weekly_pace_kg, daily_budget_vnd: p.daily_budget_vnd || undefined };
}

export const preferenceApi = {
  async analysis(): Promise<NeedsAnalysis | null> {
    const res = await apiClient.get<{ analysis: NeedsAnalysis | null }>('/preferences/analysis');
    return res.data.analysis;
  },
  async analyze(): Promise<NeedsAnalysis> {
    const res = await apiClient.post<{ analysis: NeedsAnalysis }>('/preferences/analysis', {}, { timeout: 45_000 });
    return res.data.analysis;
  },
  async get(): Promise<Preferences | null> {
    const res = await apiClient.get<{ preferences: Preferences | null }>('/preferences');
    return res.data.preferences;
  },
  async save(answers: PreferenceAnswers): Promise<Preferences> {
    const res = await apiClient.put<{ preferences: Preferences }>('/preferences', answers, { timeout: 40_000 }); // AI tổng hợp có thể mất vài giây
    return res.data.preferences;
  },
};
