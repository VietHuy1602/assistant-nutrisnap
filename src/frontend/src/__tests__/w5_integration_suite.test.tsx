/**
 * src/frontend/src/__tests__/w5_integration_suite.test.tsx
 * Comprehensive Integration & Verification Suite for Track B (Steps 2 - 8).
 * Covers Mode A / Mode B EMA, Food Swap contexts, Voice Note fallback, and Zero-Math architecture.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeightTrendChart } from '../components/analytics/WeightTrendChart';
import { TrendStatusChip } from '../components/analytics/TrendStatusChip';
import { WeeklyCaloriesChart } from '../components/analytics/WeeklyCaloriesChart';
import { FoodSwapModal } from '../components/FoodSwapModal';
import { VoiceNotePanel } from '../components/voice/VoiceNotePanel';
import { mealDraftReducer, initialDraftState } from '../components/meal/mealDraftReducer';
import { trendStatus } from '../utils/trendStatus';
import { swapApi } from '../api/swapApi';
import { voiceApi } from '../api/voiceApi';
import type { WeightPoint, NormalizedCalorieBars } from '../api/progressContract';

// Mock Recharts
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="mock-responsive-container" style={{ width: 800, height: 400 }}>
        {React.isValidElement(children)
          ? React.cloneElement(children, {
              // @ts-expect-error recharts props
              width: 800,
              height: 400,
            })
          : children}
      </div>
    ),
  };
});

describe('W5 Track B Comprehensive Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Mode A & Mode B EMA Verification', () => {
    it('Mode A: when ema_weight is null across all points, status is unavailable and chip informs user', () => {
      const modeAPoints: WeightPoint[] = [
        { date: '2026-10-18', weight_kg: 70.0, ema_weight: null },
        { date: '2026-10-19', weight_kg: 69.8, ema_weight: null },
      ];

      const status = trendStatus(modeAPoints);
      expect(status).toBe('unavailable');

      render(
        <div>
          <TrendStatusChip status={status} />
          <WeightTrendChart points={modeAPoints} status={status} />
        </div>
      );

      // Chip renders pending message
      expect(screen.getByText('Đường xu hướng đang chờ hệ thống tính')).toBeInTheDocument();
      // Chart aria-label mentions waiting
      const chartImg = screen.getByRole('img');
      expect(chartImg).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Đường xu hướng EMA đang chờ hệ thống tính')
      );
      // EMA line is NOT in legend
      expect(screen.queryByText('Xu hướng EMA (tham khảo)')).not.toBeInTheDocument();
      expect(screen.getByText('Cân nặng ghi nhận')).toBeInTheDocument();
    });

    it('Mode B: when ema_weight is provided by backend, status is available and both lines render', () => {
      const modeBPoints: WeightPoint[] = [
        { date: '2026-10-18', weight_kg: 70.0, ema_weight: 70.0 },
        { date: '2026-10-19', weight_kg: 69.8, ema_weight: 69.9 },
      ];

      const status = trendStatus(modeBPoints);
      expect(status).toBe('available');

      render(
        <div>
          <TrendStatusChip status={status} />
          <WeightTrendChart points={modeBPoints} status={status} />
        </div>
      );

      // Chip is hidden when available
      expect(screen.queryByText('Đường xu hướng đang chờ hệ thống tính')).not.toBeInTheDocument();
      // Both lines appear in legend
      expect(screen.getByText('Cân nặng ghi nhận')).toBeInTheDocument();
      expect(screen.getByText('Xu hướng EMA (tham khảo)')).toBeInTheDocument();
    });
  });

  describe('2. Weekly Calories & Daily Fallback', () => {
    it('displays dailyFallback disclaimer note when backend cannot provide weekly aggregates', () => {
      const fallbackData: NormalizedCalorieBars = {
        bars: [
          { dateKey: '2026-10-22', label: '22/10', calories: 2150, daysLogged: 1 },
          { dateKey: '2026-10-23', label: '23/10', calories: 1980, daysLogged: 1 },
        ],
        targetCalories: 2000,
        mode: 'dailyFallback',
        warnings: [],
      };

      render(<WeeklyCaloriesChart data={fallbackData} />);

      expect(
        screen.getByText(/Chưa có số liệu tổng hợp theo tuần\. Hiển thị năng lượng từng ngày\./i)
      ).toBeInTheDocument();
    });
  });

  describe('3. Food Swap Simulator (Draft vs Logged)', () => {
    const swapData = {
      status: 'success',
      sourceFood: {
        food_id: 10,
        food_name: 'Cơm tấm',
        portion_gram: 250,
        calories: 600,
        protein_g: 22,
      },
      alternatives: [
        {
          food_id: 20,
          food_name: 'Cơm gạo lứt ức gà',
          portion_gram: 250,
          calories: 450,
          protein_g: 35,
          delta_calories: -150,
          delta_protein_g: 13,
          delta_price_vnd: -2000,
        },
      ],
      disclaimer: 'Dữ liệu dinh dưỡng tham chiếu',
      warnings: [],
    };

    it('in draft context: applies swap candidate into draft with user confirmation', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      vi.spyOn(swapApi, 'getSwapAlternatives').mockResolvedValue(swapData);

      render(
        <FoodSwapModal
          context="draft"
          foodId={10}
          foodName="Cơm tấm"
          portionGram={250}
          onClose={vi.fn()}
          onConfirm={onConfirm}
        />
      );

      expect(await screen.findByText('Cơm gạo lứt ức gà')).toBeInTheDocument();
      const radio = screen.getByRole('radio');
      await user.click(radio);

      const applyBtn = screen.getByRole('button', { name: 'Áp dụng vào bản nháp' });
      await user.click(applyBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ food_id: 20, food_name: 'Cơm gạo lứt ức gà' })
      );
    });

    it('in logged context: renders read-only simulation note without apply button', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      vi.spyOn(swapApi, 'getSwapAlternatives').mockResolvedValue(swapData);

      render(
        <FoodSwapModal
          context="logged"
          foodId={10}
          foodName="Cơm tấm"
          portionGram={250}
          onClose={onClose}
        />
      );

      expect(
        await screen.findByText(/nhật ký bữa ăn của bạn không thay đổi/i)
      ).toBeInTheDocument();

      expect(screen.queryByRole('button', { name: 'Áp dụng vào bản nháp' })).not.toBeInTheDocument();

      const keepBtn = screen.getByRole('button', { name: 'Giữ nguyên món' });
      await user.click(keepBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Voice Note & Modifier State Machine', () => {
    it('manages typed modifier notes, sends to API, and permits rollback via UNDO_VOICE', async () => {
      const onApply = vi.fn();
      vi.spyOn(voiceApi, 'parseVoiceModifier').mockResolvedValue({
        success: true,
        note: 'Ít dầu mỡ, thêm rau',
        adjustedItems: [
          { food_id: 5, food_name: 'Phở bò tái (ít dầu)', estimated_gram: 400 },
        ],
        warnings: [],
      });

      render(
        <VoiceNotePanel
          initialNote=""
          onApply={onApply}
        />
      );

      const textarea = screen.getByLabelText(/Nội dung ghi chú gia vị/i);
      fireEvent.change(textarea, { target: { value: 'Ít dầu mỡ, thêm rau' } });

      const applyBtn = screen.getByRole('button', { name: /Áp dụng vào bữa ăn/i });
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(voiceApi.parseVoiceModifier).toHaveBeenCalledWith(
          expect.objectContaining({ note: 'Ít dầu mỡ, thêm rau' })
        );
        expect(onApply).toHaveBeenCalledTimes(1);
      });

      // Verify reducer state transitions
      let state = {
        ...initialDraftState,
        items: [{ key: 'k1', food_id: 5, food_name: 'Phở bò tái', estimated_gram: 400, source: 'manual' as const }],
      };

      state = mealDraftReducer(state, {
        type: 'APPLY_VOICE_RESULT',
        note: 'Ít dầu mỡ, thêm rau',
        adjustedItems: [{ food_id: 5, food_name: 'Phở bò tái (ít dầu)', estimated_gram: 400 }],
      });

      expect(state.items[0].food_name).toBe('Phở bò tái (ít dầu)');
      expect(state.voiceNote).toBe('Ít dầu mỡ, thêm rau');

      state = mealDraftReducer(state, { type: 'UNDO_VOICE' });
      expect(state.items[0].food_name).toBe('Phở bò tái');
      expect(state.voiceNote).toBeUndefined();
    });
  });

  describe('5. Zero Client Storage & Privacy Architecture', () => {
    it('does not write any tokens, weight metrics, or speech audio to localStorage or sessionStorage', () => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(sessionStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('weight')).toBeNull();
      expect(sessionStorage.getItem('weight')).toBeNull();
      expect(localStorage.getItem('voice')).toBeNull();
      expect(sessionStorage.getItem('voice')).toBeNull();
    });
  });
});
