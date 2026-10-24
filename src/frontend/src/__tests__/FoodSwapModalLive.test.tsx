/**
 * src/frontend/src/__tests__/FoodSwapModalLive.test.tsx
 * Unit & component tests for FoodSwapModal with swapApi, draft and logged contexts.
 * Verifies Zero-Math signed deltas and prominent [Giữ nguyên món] button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FoodSwapModal } from '../components/FoodSwapModal';
import { swapApi } from '../api/swapApi';
import type { NormalizedSwapResponse } from '../api/swapContract';

describe('FoodSwapModal (Live API & Contexts)', () => {
  const mockSwapResponse: NormalizedSwapResponse = {
    status: 'success',
    sourceFood: {
      food_id: 101,
      food_name: 'Cơm sườn nướng',
      portion_gram: 250,
      calories: 650,
      protein_g: 25,
      estimated_price_vnd: 45000,
    },
    alternatives: [
      {
        food_id: 201,
        food_name: 'Cơm ức gà áp chảo',
        portion_gram: 250,
        calories: 480,
        protein_g: 38,
        carbs_g: 50,
        fat_g: 8,
        estimated_price_vnd: 42000,
        delta_calories: -170,
        delta_protein_g: 13,
        delta_price_vnd: -3000,
      },
      {
        food_id: 202,
        food_name: 'Bún cá rô đồng',
        portion_gram: 300,
        calories: 420,
        protein_g: 28,
        carbs_g: 55,
        fat_g: 6,
        estimated_price_vnd: 40000,
        delta_calories: -230,
        delta_protein_g: 3,
        delta_price_vnd: -5000,
      },
    ],
    disclaimer: 'Dữ liệu ước tính dinh dưỡng tham chiếu',
    warnings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(swapApi, 'getSwapAlternatives').mockResolvedValue(mockSwapResponse);
  });

  it('in draft context, renders source food, choices with backend deltas, and applies to draft on confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <FoodSwapModal
        context="draft"
        foodId={101}
        foodName="Cơm sườn nướng"
        portionGram={250}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Displays source food
    expect(await screen.findByText(/Hiện tại: Cơm sườn nướng/)).toBeInTheDocument();
    expect(screen.getByText('Cơm ức gà áp chảo')).toBeInTheDocument();
    
    // Displays backend deltas directly without frontend arithmetic
    expect(screen.getByText(/Chênh lệch: -170 kcal · \+13 g đạm · -3.000 VNĐ/)).toBeInTheDocument();

    // Prominent [Giữ nguyên món] button is present
    const keepBtn = screen.getByRole('button', { name: 'Giữ nguyên món' });
    expect(keepBtn).toBeInTheDocument();

    // Confirm button is initially disabled until candidate is selected
    const applyBtn = screen.getByRole('button', { name: 'Áp dụng vào bản nháp' });
    expect(applyBtn).toBeDisabled();

    // Select first alternative
    const radios = screen.getAllByRole('radio');
    await user.click(radios[0]);
    expect(applyBtn).toBeEnabled();

    // Apply into draft
    await user.click(applyBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 201,
        food_name: 'Cơm ức gà áp chảo',
        portion_gram: 250,
      })
    );
  });

  it('in logged context, shows read-only notice, no apply button, and closes on [Giữ nguyên món]', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <FoodSwapModal
        context="logged"
        foodId={101}
        foodName="Cơm sườn nướng"
        portionGram={250}
        onClose={onClose}
      />
    );

    // Shows logged simulation disclaimer notice
    expect(
      await screen.findByText(/Đây là mô phỏng đổi món nhằm mục đích tham khảo; nhật ký bữa ăn của bạn không thay đổi/i)
    ).toBeInTheDocument();

    // Does NOT render "Áp dụng vào bản nháp"
    expect(screen.queryByRole('button', { name: 'Áp dụng vào bản nháp' })).not.toBeInTheDocument();

    // Has [Giữ nguyên món] button
    const keepBtn = screen.getByRole('button', { name: 'Giữ nguyên món' });
    await user.click(keepBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('changing swap goal re-fetches from swapApi with selected goal', async () => {
    const user = userEvent.setup();
    render(
      <FoodSwapModal
        context="draft"
        foodId={101}
        foodName="Cơm sườn nướng"
        portionGram={250}
        onClose={vi.fn()}
      />
    );

    await screen.findByText('Cơm ức gà áp chảo');
    expect(swapApi.getSwapAlternatives).toHaveBeenCalledWith(
      expect.objectContaining({ swapGoal: 'reduce_calories' })
    );

    // Select 'high_protein'
    await user.selectOptions(screen.getByRole('combobox'), 'high_protein');

    await waitFor(() => {
      expect(swapApi.getSwapAlternatives).toHaveBeenCalledWith(
        expect.objectContaining({ swapGoal: 'high_protein' })
      );
    });
  });
});
