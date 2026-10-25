import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HabitPage } from '../pages/HabitPage';
import { habitApi } from '../api/habitApi';
import { appBus } from '../app/appBus';
import type { HabitStatus } from '../api/habitContract';

const mockHabitData: HabitStatus = {
  streak: {
    currentStreak: 6,
    longestStreak: 15,
    totalLoggedDays: 28,
    loggedDatesLast7Days: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
  },
  sevenDayChallenge: {
    windowStart: '2026-10-18',
    windowEnd: '2026-10-24',
    completedDays: 4,
    targetDays: 7,
    progressPct: 57.1,
    isCompleted: false,
    badgeName: 'Khởi Đầu Vững Chắc',
  },
  backOnTrack: {
    active: true,
    triggerReason: 'missed_day',
    caloriePenaltyApplied: false,
    nextDayTargetCalories: 2000,
    encouragementMessage: 'Bỏ lỡ một ngày ghi nhật ký là điều hoàn toàn bình thường.',
    suggestedMicroAction: 'Ghi nhận 1 bữa ăn lành mạnh hôm nay.',
  },
  disclaimer: 'Số liệu thói quen mang tính chất khích lệ.',
  referenceDate: '2026-10-24',
};

describe('Step 4: HabitPage & Habit Tracker Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    appBus.clear();
  });

  it('1. renders HabitPage with streak badge, milestone and non-punitive back-on-track card', async () => {
    vi.spyOn(habitApi, 'getHabitStatus').mockResolvedValue(mockHabitData);

    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>
    );

    // Header
    expect(screen.getByText('Thói quen & Chuỗi ngày')).toBeInTheDocument();

    // Streak badge
    await waitFor(() => {
      expect(screen.getByText('ngày liên tiếp')).toBeInTheDocument();
      expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Kỷ lục cao nhất/)).toBeInTheDocument();
    });

    // Milestone
    expect(screen.getByText(/4 \/ 7 ngày/)).toBeInTheDocument();
    expect(screen.getByText('Khởi Đầu Vững Chắc')).toBeInTheDocument();

    // Back-on-track
    expect(screen.getByText('Quay lại đường đua')).toBeInTheDocument();
    expect(
      screen.getByText(/Bỏ lỡ một ngày ghi nhật ký là điều hoàn toàn bình thường/)
    ).toBeInTheDocument();
    expect(screen.getByText(/2000 kcal/)).toBeInTheDocument();
  });

  it('2. NON-PUNITIVE (ADR-W6-11): does not use red colors or punishment words', async () => {
    vi.spyOn(habitApi, 'getHabitStatus').mockResolvedValue(mockHabitData);

    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quay lại đường đua')).toBeInTheDocument();
    });

    // Check non-punitive messaging
    expect(screen.getByText(/Không có ngày nào bị tính là thất bại/)).toBeInTheDocument();

    // Check no red background classes on back-on-track card
    const botCard = screen.getByText('Quay lại đường đua').closest('div');
    expect(botCard?.className).not.toContain('bg-red');
    expect(botCard?.className).not.toContain('text-red');
    expect(botCard?.className).not.toContain('rose');
  });

  it('3. CROSS-SCREEN SYNC: refetches habit status when appBus receives meal-logged event', async () => {
    const fetchSpy = vi.spyOn(habitApi, 'getHabitStatus').mockResolvedValue(mockHabitData);

    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate meal-logged event from other screens (e.g. Chat or Capture)
    appBus.emit({
      type: 'meal-logged',
      at: Date.now(),
      source: 'chat-flow',
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('4. displays empty state CTA when user has 0 logged days', async () => {
    vi.spyOn(habitApi, 'getHabitStatus').mockResolvedValue({
      ...mockHabitData,
      streak: { ...mockHabitData.streak, currentStreak: 0, totalLoggedDays: 0 },
    });

    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Bắt đầu ghi bữa ăn để thấy lịch của bạn!')
      ).toBeInTheDocument();
      expect(screen.getByText('Chụp bữa ăn ngay')).toBeInTheDocument();
    });
  });

  it('5. handles API error with friendly message and retry button', async () => {
    const fetchSpy = vi
      .spyOn(habitApi, 'getHabitStatus')
      .mockRejectedValueOnce(new Error('Lỗi kết nối máy chủ'));

    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Lỗi kết nối máy chủ/)).toBeInTheDocument();
    });

    // Test retry
    fetchSpy.mockResolvedValueOnce(mockHabitData);
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('ngày liên tiếp')).toBeInTheDocument();
    });
  });
});
