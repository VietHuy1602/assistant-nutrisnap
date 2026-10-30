import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BasicDashboard } from '../pages/BasicDashboard';
import { dashboardApi } from '../api/dashboardApi';
import { mealApi } from '../api/mealApi';
import { ApiError } from '../utils/apiError';
import type { DailyDashboardData } from '../types/api';

vi.mock('../api/dashboardApi');
vi.mock('../api/mealApi');
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'An' }, hasGoal: true }) }));

const sample: DailyDashboardData = {
  date: '2026-10-30', target_calories: 2000, consumed_calories: 450, remaining_calories: 1550, calories_progress_percent: 22.5,
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
  macros: {
    protein: { consumed: 20, target: 100, unit: 'g', progress_percent: 20 },
    carbs: { consumed: 60, target: 200, unit: 'g', progress_percent: 30 },
    fat: { consumed: 15, target: 60, unit: 'g', progress_percent: 25 },
  },
  meals_summary: [{ id: 17, meal_type: 'breakfast', logged_at: '2026-10-30T07:30:00+07:00', total_calories: 450,
    items: [{ food_id: 1, food_name: 'Phở bò tái', estimated_gram: 400, calories: 450 }] }],
};

const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  // jsdom does not implement the native dialog top layer or its focus handling.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterAll(() => {
  for (const [name, descriptor] of [['showModal', showModal], ['close', close]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValue(sample);
});

async function openDeletion() {
  const user = userEvent.setup();
  render(<MemoryRouter><BasicDashboard /></MemoryRouter>);
  const opener = await screen.findByRole('button', { name: /Xóa bữa ăn/ });
  await user.click(opener);
  return { user, opener, dialog: screen.getByRole('alertdialog', { name: 'Xóa bữa ăn này?' }) };
}

describe('Dashboard meal deletion safeguards', () => {
  it('identifies the meal, starts on the safe action, and cancels without a request', async () => {
    const { user, opener, dialog } = await openDeletion();
    expect(within(dialog).getByText(/Bữa Sáng/)).toHaveTextContent('30/10/2026');
    expect(within(dialog).getByText('Phở bò tái')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Giữ lại bữa ăn' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Giữ lại bữa ăn' }));
    expect(mealApi.deleteMeal).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('blocks repeat confirmations and announces success after the server deletes the meal', async () => {
    let resolveDelete!: (value: { success: boolean; message: string }) => void;
    vi.mocked(mealApi.deleteMeal).mockReturnValue(new Promise(resolve => { resolveDelete = resolve; }));
    const { user, dialog } = await openDeletion();
    await user.dblClick(within(dialog).getByRole('button', { name: 'Xóa bữa ăn' }));
    expect(mealApi.deleteMeal).toHaveBeenCalledTimes(1);
    expect(mealApi.deleteMeal).toHaveBeenCalledWith(17);
    expect(within(dialog).getByText(/Đang xóa bữa ăn/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đang xóa…' })).toBeDisabled();
    expect(dialog).toHaveFocus();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValue({ ...sample, meals_summary: [] });
    await act(async () => { resolveDelete({ success: true, message: 'Deleted' }); });
    expect(await screen.findByText('Đã xóa bữa sáng khỏi nhật ký.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Xóa bữa ăn/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByText('Đã xóa bữa sáng khỏi nhật ký.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('keeps failure visible, preserves the meal, and permits an explicit retry', async () => {
    vi.mocked(mealApi.deleteMeal).mockRejectedValueOnce(new ApiError('Offline', { isNetworkError: true }))
      .mockResolvedValueOnce({ success: true, message: 'Deleted' });
    const { user, dialog } = await openDeletion();
    await user.click(within(dialog).getByRole('button', { name: 'Xóa bữa ăn' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kiểm tra kết nối và thử lại');
    expect(within(dialog).getByText('Phở bò tái')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xóa bữa ăn/ })).toBeInTheDocument();
    vi.mocked(dashboardApi.getDailyDashboard).mockResolvedValue({ ...sample, meals_summary: [] });
    await user.click(within(dialog).getByRole('button', { name: 'Thử xóa lại' }));
    expect(mealApi.deleteMeal).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Đã xóa bữa sáng khỏi nhật ký.')).toBeInTheDocument();
  });

  it('does not announce success when the response rejects deletion', async () => {
    vi.mocked(mealApi.deleteMeal).mockResolvedValue({ success: false, message: 'Rejected' });
    const { user, dialog } = await openDeletion();
    await user.click(within(dialog).getByRole('button', { name: 'Xóa bữa ăn' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Đã xóa bữa sáng khỏi nhật ký.')).not.toBeInTheDocument();
    expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(1);
  });

  it('dismisses the confirmation through the native cancel event without deleting', async () => {
    const { opener, dialog } = await openDeletion();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(mealApi.deleteMeal).not.toHaveBeenCalled();
  });

  it('keeps deletion success distinct from a subsequent dashboard refresh failure', async () => {
    vi.mocked(mealApi.deleteMeal).mockResolvedValue({ success: true, message: 'Deleted' });
    const { user, dialog } = await openDeletion();
    vi.mocked(dashboardApi.getDailyDashboard).mockRejectedValue(new Error('Refresh unavailable'));
    await user.click(within(dialog).getByRole('button', { name: 'Xóa bữa ăn' }));
    expect(await screen.findByText('Đã xóa bữa sáng khỏi nhật ký.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Không tải được dữ liệu hôm nay' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mealApi.deleteMeal).toHaveBeenCalledTimes(1);
  });

  it('connects disclosure to its content and keeps the expanded food action keyboard accessible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><BasicDashboard /></MemoryRouter>);
    const disclosure = await screen.findByRole('button', { name: /Xem chi tiết món: Bữa Sáng/ });
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const details = document.getElementById(disclosure.getAttribute('aria-controls')!);
    expect(details).toHaveTextContent('Phở bò tái');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mô phỏng đổi món cho Phở bò tái' })).toHaveFocus();
  });
});
