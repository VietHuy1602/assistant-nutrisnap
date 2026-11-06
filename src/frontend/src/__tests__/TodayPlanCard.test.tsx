import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayPlanCard } from '../components/dashboard/TodayPlanCard';
import { mealPlanApi, type MealPlan } from '../api/mealPlanApi';
import type { DailyDashboardMeal } from '../types/api';

const it_ = (id: number, name: string, role: string) => ({ food_id: id, food_name: name, role, grams: 100, calories: 300, protein_g: 10, carbs_g: 10, fat_g: 5, price_vnd: 1 });
const t = { calories: 300, protein_g: 10, carbs_g: 10, fat_g: 5, price_vnd: 1 };
const plan = {
  start_date: '2026-11-05', days: 1, target_calories: 1800, target_protein_g: 100, goal_type: 'maintain', daily_budget_vnd: 1, disclaimer: '',
  plan: [{ date: '2026-11-05', totals: { ...t, calories: 1200 }, meals: [
    { meal_type: 'breakfast', label: 'Bữa sáng', target_calories: 300, totals: t, items: [it_(1, 'Phở bò tái', 'main')] },
    { meal_type: 'lunch', label: 'Bữa trưa', target_calories: 300, totals: t, items: [it_(2, 'Cơm trắng', 'rice'), it_(3, 'Cá lóc kho tộ', 'protein')] },
    { meal_type: 'dinner', label: 'Bữa tối', target_calories: 300, totals: t, items: [it_(4, 'Gà luộc', 'protein')] },
  ] }],
} as unknown as MealPlan;
const logged = (type: string, id: number, name: string) => ({ id, meal_type: type, logged_at: '', total_calories: 420, items: [{ food_id: id, food_name: name, estimated_gram: 100 }] }) as DailyDashboardMeal;

beforeEach(() => vi.restoreAllMocks());

describe('TodayPlanCard', () => {
  it('checks off each planned dish that was captured and links capture per dish', async () => {
    vi.spyOn(mealPlanApi, 'current').mockResolvedValue(plan);
    render(<MemoryRouter><TodayPlanCard date="2026-11-05" meals={[logged('breakfast', 1, 'Phở bò tái'), logged('lunch', 2, 'Cơm trắng'), logged('lunch', 9, 'Trà sữa')]} /></MemoryRouter>);
    expect(await screen.findByText('Đã chụp 2/4 món theo thực đơn')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Phở bò tái' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Cá lóc kho tộ' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Món ngoài thực đơn: Trà sữa/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chụp Gà luộc' })).toHaveAttribute('href', '/capture?meal=dinner&dish=G%C3%A0%20lu%E1%BB%99c');
  });

  it('invites the user to create a plan when the day has none', async () => {
    vi.spyOn(mealPlanApi, 'current').mockResolvedValue(null);
    render(<MemoryRouter><TodayPlanCard date="2026-11-05" meals={[]} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Tạo thực đơn/ })).toHaveAttribute('href', '/meal-plan');
    expect(screen.getByRole('link', { name: /Ghi bữa ăn mới|Chụp bữa ăn đầu tiên/ })).toHaveAttribute('href', '/capture');
  });
});
