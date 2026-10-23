import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import type { AxiosResponse } from 'axios';
import { apiClient } from '../api/client';
import { DashboardPage } from '../pages/DashboardPage';
import type { DailyDashboardData } from '../types/api';

vi.mock('../api/client', () => ({ apiClient: { get: vi.fn() } }));
let hasGoal = true;
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'Nguyên' }, hasGoal }) }));

const populated: DailyDashboardData = {
  date: '2026-10-23', target_calories: 2000, consumed_calories: 800,
  remaining_calories: 1200, calories_progress_percent: 40,
  macros: {
    protein: { consumed: 40, target: 100, unit: 'g', progress_percent: 40 },
    carbs: { consumed: 80, target: 200, unit: 'g', progress_percent: 40 },
    fat: { consumed: 20, target: 60, unit: 'g', progress_percent: 33.3 },
  },
  meals_summary: [{ id: 1, meal_type: 'Trưa', logged_at: '2026-10-23T12:00:00', total_calories: 800, items: [] }],
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
};

const response = (data: DailyDashboardData) => ({ data } as AxiosResponse<DailyDashboardData>);
const openChat = vi.fn();
function renderDashboard() {
  return render(
    <MemoryRouter>
      <Routes><Route element={<Outlet context={{ openChat }} />}><Route path="/" element={<DashboardPage />} /></Route></Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasGoal = true;
    vi.mocked(apiClient.get).mockResolvedValue(response(populated));
  });

  it('renders server values, date, disclaimer and logging entry points', async () => {
    renderDashboard();
    expect(await screen.findByText('1.200')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/dashboard/daily');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nguyên');
    expect(screen.getByText('Ngày 23/10/2026')).toBeInTheDocument();
    expect(screen.getByText('800 kcal')).toBeInTheDocument();
    expect(screen.getByText('2.000 kcal')).toBeInTheDocument();
    expect(screen.getByText(populated.disclaimer)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chụp ảnh món ăn/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Thêm thủ công/ })).toBeEnabled();
    expect(screen.queryByText(/Chưa ghi nhận bữa ăn hôm nay/)).not.toBeInTheDocument();
    expect(screen.queryByText(/duy trì lượng đạm rất tốt/)).not.toBeInTheDocument();
  });

  it('announces loading without showing invented nutrition values', async () => {
    let resolve!: (value: AxiosResponse<DailyDashboardData>) => void;
    vi.mocked(apiClient.get).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    renderDashboard();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải dữ liệu');
    expect(screen.getByRole('region', { name: 'Đang tải tổng quan dinh dưỡng' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await act(async () => { resolve(response(populated)); });
    expect(await screen.findByText('1.200')).toBeInTheDocument();
  });

  it('labels missing-goal targets as defaults without presenting a saved plan', async () => {
    hasGoal = false;
    renderDashboard();
    expect(await screen.findByText(/chưa phải mục tiêu cá nhân/)).toBeInTheDocument();
    expect(screen.queryByText(/Kế hoạch đã lưu/)).not.toBeInTheDocument();
  });

  it('retains a zero calorie target without inventing a replacement target', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({ ...populated, target_calories: 0, remaining_calories: -800, calories_progress_percent: 0 }));
    renderDashboard();
    expect(await screen.findByText('0 kcal')).toBeInTheDocument();
    expect(screen.getByText('-800')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ năng lượng' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows failure without fallback totals and retries the same endpoint', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network unavailable'));
    const user = userEvent.setup();
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được dữ liệu dinh dưỡng');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/1.800|1800|120 g|200 g|55 g/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('1.200')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(apiClient.get).toHaveBeenLastCalledWith('/dashboard/daily');
  });

  it('shows actual zero consumption and an empty-day message', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({
      ...populated, consumed_calories: 0, remaining_calories: 2000, calories_progress_percent: 0, meals_summary: [],
      macros: Object.fromEntries(Object.entries(populated.macros).map(([key, macro]) => [key, { ...macro, consumed: 0, progress_percent: 0 }])) as DailyDashboardData['macros'],
    }));
    renderDashboard();
    expect(await screen.findByText(/Chưa ghi nhận bữa ăn hôm nay/)).toBeInTheDocument();
    expect(screen.getByText('0 kcal')).toBeInTheDocument();
    for (const bar of screen.getAllByRole('progressbar')) expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('preserves negative remaining calories and over-target percentages while clamping graphics', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({
      ...populated, consumed_calories: 2500, remaining_calories: -500, calories_progress_percent: 125,
      macros: { ...populated.macros, protein: { consumed: 150, target: 100, unit: 'g', progress_percent: 150 } },
    }));
    renderDashboard();
    expect(await screen.findByText('-500')).toBeInTheDocument();
    expect(screen.getByText('125% mục tiêu năng lượng')).toBeInTheDocument();
    expect(screen.getByText('150% mục tiêu')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ năng lượng' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'Tiến độ Đạm' })).toHaveAttribute('aria-valuenow', '100');
  });

  it.each([0, -10, NaN, Infinity])('handles invalid or zero macro target %s without invalid progress', async target => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({
      ...populated, macros: { ...populated.macros, protein: { consumed: 40, target, unit: 'g', progress_percent: Infinity } },
    }));
    renderDashboard();
    const bar = await screen.findByRole('progressbar', { name: 'Tiến độ Đạm' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuetext', 'Chưa có tiến độ hợp lệ');
    expect(bar.firstElementChild).toHaveStyle({ width: '0%' });
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it('clamps negative progress without altering its displayed source value', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({ ...populated, calories_progress_percent: -5 }));
    renderDashboard();
    expect(await screen.findByText('-5% mục tiêu năng lượng')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ năng lượng' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('treats missing required totals as unavailable, rather than zero', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({ ...populated, remaining_calories: NaN }));
    renderDashboard();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('opens chat through the outlet callback without another API request', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });
});
