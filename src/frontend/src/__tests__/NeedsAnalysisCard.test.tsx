import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NeedsAnalysisCard } from '../components/goal/NeedsAnalysisCard';
import { goalDefaultsFromSurvey, preferenceApi, type PreferenceAnswers } from '../api/preferenceApi';

beforeEach(() => vi.restoreAllMocks());

describe('NeedsAnalysisCard', () => {
  it('runs the AI analysis after the goal is saved and shows needs, recommendations and cautions', async () => {
    vi.spyOn(preferenceApi, 'analyze').mockResolvedValue({
      headline: 'Giảm cân với 1.800 kcal mỗi ngày', needs: ['Đạm 110 g mỗi ngày'], recommendations: ['Ưu tiên ức gà, trứng'],
      sample_day: ['Bữa sáng: phở gà'], cautions: ['Tránh tuyệt đối: tôm cua'], source: 'ai', target_calories: 1800,
    });
    render(<MemoryRouter><NeedsAnalysisCard autoRun /></MemoryRouter>);
    expect(await screen.findByText('Giảm cân với 1.800 kcal mỗi ngày')).toBeInTheDocument();
    expect(screen.getByText('Ưu tiên ức gà, trứng')).toBeInTheDocument();
    expect(screen.getByText('Tránh tuyệt đối: tôm cua')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tạo thực đơn theo phân tích/ })).toHaveAttribute('href', '/meal-plan');
  });

  it('maps survey answers to safe goal defaults', () => {
    const d = goalDefaultsFromSurvey({ age_group: 'C', activity: 'D', goal: 'C', pace: 'C', daily_budget_vnd: 90000 } as PreferenceAnswers);
    expect(d).toEqual({ age: 29, activity_level: 'very_active', goal_type: 'gain_muscle', weekly_pace_kg: 0.5, daily_budget_vnd: 90000 });
  });
});
