import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MealPlanPage from '../pages/MealPlanPage';
import { mealPlanApi, type MealPlan } from '../api/mealPlanApi';

const item = (id: number, name: string, role: string, kcal: number) => ({ food_id: id, food_name: name, role, grams: 100, calories: kcal, protein_g: 10, carbs_g: 10, fat_g: 5, price_vnd: 20000 });
const plan = (lunchDish = 'Cá lóc kho tộ', message?: string): MealPlan => ({
  start_date: '2026-11-05', days: 1, target_calories: 1800, target_protein_g: 100, goal_type: 'maintain', daily_budget_vnd: 50000, disclaimer: 'Tham khảo',
  replace_message: message,
  plan: [{ date: '2026-11-05', totals: { calories: 1750, protein_g: 95, carbs_g: 200, fat_g: 50, price_vnd: 120000 }, meals: [
    { meal_type: 'breakfast', label: 'Bữa sáng', target_calories: 450, totals: { calories: 450, protein_g: 20, carbs_g: 60, fat_g: 10, price_vnd: 40000 }, items: [item(1, 'Phở bò tái', 'main', 450)] },
    { meal_type: 'lunch', label: 'Bữa trưa', target_calories: 630, totals: { calories: 620, protein_g: 40, carbs_g: 70, fat_g: 15, price_vnd: 40000 },
      items: [item(2, 'Cơm trắng', 'rice', 260), item(lunchDish === 'Cá lóc kho tộ' ? 3 : 9, lunchDish, 'protein', 250), item(4, 'Canh chua cá lóc', 'soup', 110)] },
  ] }],
} as unknown as MealPlan);

beforeEach(() => vi.restoreAllMocks());

describe('MealPlanPage', () => {
  it('asks why a dish is rejected, swaps it with the given reason, and accepts the plan', async () => {
    vi.spyOn(mealPlanApi, 'current').mockResolvedValue(null);
    vi.spyOn(mealPlanApi, 'generate').mockResolvedValue(plan());
    const replace = vi.spyOn(mealPlanApi, 'replace').mockResolvedValue(plan('Gà kho gừng', 'Đã đổi “Cá lóc kho tộ” thành “Gà kho gừng”: không có cá.'));
    const accept = vi.spyOn(mealPlanApi, 'accept').mockResolvedValue();
    render(<MemoryRouter><MealPlanPage /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: 'Tạo thực đơn' }));
    expect(await screen.findByText('Phở bò tái')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Không thích Cơm trắng/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Không thích Cá lóc kho tộ/ }));
    const dialog = screen.getByRole('dialog', { name: 'Vì sao bạn muốn đổi món' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Không thích nguyên liệu chính/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đề xuất món khác' }));
    expect(replace).toHaveBeenCalledWith(expect.anything(), 0, 'lunch', 3, 'ingredient', undefined);
    expect(await screen.findByText('Gà kho gừng')).toBeInTheDocument();
    expect(screen.getByText(/không có cá/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Đồng ý tất cả' }));
    expect(accept).toHaveBeenCalled();
    expect(await screen.findByText(/Đã lưu thực đơn/)).toBeInTheDocument();
  });

  it('regenerates only the selected day and keeps the others', async () => {
    const two = plan();
    two.plan.push({ ...two.plan[0], date: '2026-11-06' });
    vi.spyOn(mealPlanApi, 'current').mockResolvedValue(two);
    const regen = vi.spyOn(mealPlanApi, 'regenerateDays').mockResolvedValue(two);
    render(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    await userEvent.click((await screen.findAllByRole('tab'))[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Đổi cả ngày này' }));
    expect(regen).toHaveBeenCalledWith(expect.anything(), [1]);
    expect(await screen.findByText(/các ngày khác giữ nguyên/)).toBeInTheDocument();
  });

  it('shows ingredients and cooking steps for a dish', async () => {
    vi.spyOn(mealPlanApi, 'current').mockResolvedValue(plan());
    const recipe = vi.spyOn(mealPlanApi, 'recipe').mockResolvedValue({
      food_id: 1, food_name: 'Phở bò tái', servings: 1, time_minutes: 45, difficulty: 'Trung bình',
      ingredients: [{ name: 'Bánh phở', amount: '200 g' }, { name: 'Thịt bò', amount: '100 g' }],
      steps: ['Hầm xương lấy nước dùng', 'Trụng bánh phở, xếp thịt bò'], tip: 'Bớt muối trong nước dùng',
    });
    render(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    const buttons = await screen.findAllByRole('button', { name: /Nguyên liệu & cách nấu/ });
    await userEvent.click(buttons[0]);
    expect(recipe).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Bánh phở')).toBeInTheDocument();
    expect(screen.getByText('Hầm xương lấy nước dùng')).toBeInTheDocument();
    expect(screen.getByText(/45 phút/)).toBeInTheDocument();
  });
});
