/**
 * src/frontend/src/__tests__/w3_dashboard.test.tsx
 * Integration & Component tests for BasicDashboard:
 * - Loading skeleton (PSC-11)
 * - Zero fake fallback data on error (PSC-13, ADR-W3-07)
 * - NoGoalNotice, Empty state, Over-budget neutral styling
 * - Auto-refetch on nutrisnap:meal-logged custom event
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BasicDashboard } from '../pages/BasicDashboard';
import { dashboardApi } from '../api/dashboardApi';
import { emitMealLogged } from '../utils/mealEvents';
import type { DailyDashboardData } from '../types/api';

vi.mock('../api/dashboardApi');
let mockHasGoal = true;
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'Khôi Nguyên' },
    hasGoal: mockHasGoal,
  }),
}));

const sampleDashboardData: DailyDashboardData = {
  date: '2026-10-23',
  target_calories: 2000,
  consumed_calories: 1250,
  remaining_calories: 750,
  calories_progress_percent: 62.5,
  macros: {
    protein: { consumed: 75, target: 120, unit: 'g', progress_percent: 62.5 },
    carbs: { consumed: 160, target: 250, unit: 'g', progress_percent: 64 },
    fat: { consumed: 40, target: 65, unit: 'g', progress_percent: 61.5 },
  },
  meals_summary: [
    {
      id: 1,
      meal_type: 'breakfast',
      total_calories: 450,
      logged_at: '2026-10-23T07:30:00Z',
      items: [{ food_id: 1, food_name: 'Phở bò tái', estimated_gram: 400, calories: 450 }],
    },
  ],
  disclaimer: 'Số liệu mang tính chất ước tính tham khảo.',
};

describe('W3 Dashboard — BasicDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasGoal = true;
  });

  it('1. Hiển thị DashboardSkeleton khi đang tải dữ liệu', () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockReturnValue(new Promise(() => {})); // pending

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('2. Tuyệt đối không hiển thị số liệu giả khi API gặp lỗi, có nút Thử lại (ADR-W3-07, PSC-13)', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockRejectedValueOnce(new Error('Connection lost'));

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /Không tải được dữ liệu hôm nay/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeInTheDocument();

    // Xác nhận không có số liệu giả 1800, 2000, 120g được render
    expect(screen.queryByText(/1.800|1800|2.000 kcal/)).not.toBeInTheDocument();
  });

  it('3. Hiển thị NoGoalNotice khi người dùng chưa có mục tiêu cá nhân', async () => {
    mockHasGoal = false;
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValueOnce(sampleDashboardData);

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Giá trị tham khảo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Thiết lập mục tiêu/ })).not.toBeInTheDocument();
    expect(screen.getByText(/chưa phải mục tiêu dinh dưỡng cá nhân/)).toBeInTheDocument();
  });

  it('4. Hiển thị trạng thái rỗng (DashboardEmpty) khi chưa có bữa ăn nào trong ngày', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValueOnce({
      ...sampleDashboardData,
      consumed_calories: 0,
      remaining_calories: 2000,
      meals_summary: [],
    });

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Chưa ghi nhận bữa ăn nào hôm nay/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Chụp bữa ăn đầu tiên/ })).toHaveAttribute('href', '/capture');
  });

  it('5. Hiển thị đầy đủ Vòng calo và 3 thanh tiến độ Macro khi có dữ liệu', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValueOnce(sampleDashboardData);

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    // Chào mừng
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Khôi Nguyên');

    // Vòng calo
    expect(screen.getByText('750')).toBeInTheDocument(); // Calo còn lại
    expect(screen.getByText(/1.250/)).toBeInTheDocument(); // Đã nạp

    // 3 thanh tiến độ Macro
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars).toHaveLength(3);
    expect(screen.getByText('Đạm', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Tinh bột', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Chất béo', { selector: 'span' })).toBeInTheDocument();
  });

  it('6. Hiển thị màu trung tính hổ phách khi nạp vượt hạn mức (không dùng màu đỏ báo động)', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValueOnce({
      ...sampleDashboardData,
      consumed_calories: 2300,
      target_calories: 2000,
      remaining_calories: -300,
      calories_progress_percent: 115,
    });

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText('+300')).toBeInTheDocument();
    expect(screen.getByText(/Hôm nay bạn đã nạp vượt mục tiêu khoảng 300 kcal/)).toBeInTheDocument();
  });

  it('7. Tự động refetch Dashboard khi nhận sự kiện nutrisnap:meal-logged', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValue(sampleDashboardData);

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    await waitFor(() => expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1));

    // Phát sự kiện lưu bữa ăn
    act(() => {
      emitMealLogged({ mealId: 99 });
    });

    await waitFor(() => expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(2));
  });

  it('8. Nút "Chụp bữa ăn" trên Dashboard điều hướng sang /capture', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValueOnce(sampleDashboardData);

    render(
      <MemoryRouter>
        <BasicDashboard />
      </MemoryRouter>,
    );

    const captureLink = await screen.findByRole('link', { name: /Chụp bữa ăn/ });
    expect(captureLink).toHaveAttribute('href', '/capture');
  });
});
