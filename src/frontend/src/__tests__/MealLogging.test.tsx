// Isolated frontend integration tests. Transport is simulated; these do not prove live API saving.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import type { AxiosResponse } from 'axios';
import { apiClient } from '../api/client';
import { ApiError } from '../utils/apiError';
import { DashboardPage } from '../pages/DashboardPage';
import { liveAPI } from '../components/api';
import type { DailyDashboardData } from '../types/api';

vi.mock('../api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'Test' }, hasGoal: true }) }));

const day: DailyDashboardData = {
  date: '2026-10-23', target_calories: 2000, consumed_calories: 0, remaining_calories: 2000, calories_progress_percent: 0, meals_summary: [],
  macros: {
    protein: { consumed: 0, target: 150, unit: 'g', progress_percent: 0 },
    carbs: { consumed: 0, target: 200, unit: 'g', progress_percent: 0 },
    fat: { consumed: 0, target: 60, unit: 'g', progress_percent: 0 },
  }, disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
};
const rice = { id: 7, food_name: 'Cơm trắng', calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 };
const veg = { id: 8, food_name: 'Rau luộc', calories_per_100g: 30, protein_per_100g: 2, carbs_per_100g: 5, fat_per_100g: 0.3 };
const response = (data: unknown) => ({ data } as AxiosResponse);
const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

function renderDashboard() {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ openChat: vi.fn() }} />}><Route path="/" element={<DashboardPage />} /></Route></Routes></MemoryRouter>);
}
async function openManual(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Thêm thủ công/ }));
  expect(screen.getByRole('heading', { name: 'Kiểm tra khẩu phần' })).toBeInTheDocument();
}
async function addRice(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Thêm món từ danh sách tham chiếu' }), 'Cơm');
  await user.click(await screen.findByRole('button', { name: /Cơm trắng.*130 kcal/ }));
}

describe('Meal logging — simulated transport only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation(async (url, config) => {
      const query = (config?.params as { q?: string } | undefined)?.q;
      return response(url === '/foods/search' ? { items: query === 'Rau' ? [veg] : [rice] } : day);
    });
    vi.mocked(apiClient.post).mockResolvedValue(response({ success: true, status: 'logged', meal_id: 42, total_calories: 130 }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('opens photo capture without requesting permission or sending an API write, then closes', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Chụp ảnh món ăn/ }));
    expect(screen.getByRole('button', { name: 'Mở camera' })).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn ảnh bữa ăn')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Đóng ghi bữa ăn' }));
    expect(screen.queryByRole('button', { name: 'Mở camera' })).not.toBeInTheDocument();
  });

  it('retains an edited draft when cancellation is declined, and discards only explicitly', async () => {
    const user = userEvent.setup(); renderDashboard(); await openManual(user); await addRice(user);
    const grams = screen.getByRole('spinbutton', { name: 'Khối lượng Cơm trắng (g)' });
    await user.clear(grams); await user.type(grams, '175');
    await user.click(screen.getByRole('button', { name: 'Đóng ghi bữa ăn' }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    expect(grams).toHaveValue(175);
    await user.click(screen.getByRole('button', { name: 'Đóng ghi bữa ăn' }));
    await user.click(screen.getByRole('button', { name: 'Bỏ bản nháp' }));
    expect(screen.queryByRole('heading', { name: 'Kiểm tra khẩu phần' })).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('saves only after explicit confirmation, and requests fresh Dashboard data after confirmation', async () => {
    const user = userEvent.setup(); renderDashboard(); await openManual(user); await addRice(user);
    expect(apiClient.post).not.toHaveBeenCalled();
    const dashboardCalls = () => vi.mocked(apiClient.get).mock.calls.filter(([url]) => url === '/dashboard/daily').length;
    expect(dashboardCalls()).toBe(1);
    vi.mocked(apiClient.get).mockResolvedValueOnce(response({ ...day, consumed_calories: 130, remaining_calories: 1870, calories_progress_percent: 6.5,
      meals_summary: [{ id: 42, meal_type: 'Trưa', logged_at: '2026-10-23T12:00:00', total_calories: 130, items: [] }],
    }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' }));
    expect(await screen.findByRole('heading', { name: 'Đã lưu vào nhật ký' })).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/meals/log', { meal_type: 'lunch', items: [{ food_id: 7, food_name: 'Cơm trắng', estimated_gram: 100 }], is_confirmed: true, notes: '' });
    await waitFor(() => expect(dashboardCalls()).toBe(2));
    expect(await screen.findByText('1.870')).toBeInTheDocument();
    expect(screen.queryByText(/Chưa ghi nhận bữa ăn hôm nay/)).not.toBeInTheDocument();
  });

  it('keeps edits after a save failure, blocks duplicates in flight, and permits an explicit retry', async () => {
    let rejectSave!: (reason: unknown) => void;
    vi.mocked(apiClient.post).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSave = reject; }));
    const user = userEvent.setup(); renderDashboard(); await openManual(user); await addRice(user);
    await user.dblClick(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' }));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Đang lưu…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đóng ghi bữa ăn' })).toBeDisabled();
    await act(async () => { rejectSave(new ApiError('Chưa lưu được bữa ăn.')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa lưu được bữa ăn.');
    expect(screen.getByRole('spinbutton', { name: 'Khối lượng Cơm trắng (g)' })).toHaveValue(100);
    expect(screen.queryByRole('heading', { name: 'Đã lưu vào nhật ký' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' }));
    expect(await screen.findByRole('heading', { name: 'Đã lưu vào nhật ký' })).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });

  it('retains grams when replacing a food and prevents saving invalid portions', async () => {
    const user = userEvent.setup(); renderDashboard(); await openManual(user); await addRice(user);
    await user.clear(screen.getByRole('spinbutton', { name: 'Khối lượng Cơm trắng (g)' }));
    expect(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' })).toBeDisabled();
    await user.type(screen.getByRole('spinbutton', { name: 'Khối lượng Cơm trắng (g)' }), '150');
    await user.click(screen.getByRole('button', { name: 'Đổi tên / chọn món khác' }));
    await user.type(screen.getByRole('textbox', { name: 'Chọn món thay thế' }), 'Rau');
    await user.click(await screen.findByRole('button', { name: /Rau luộc.*30 kcal/ }));
    expect(screen.getByRole('spinbutton', { name: 'Khối lượng Rau luộc (g)' })).toHaveValue(150);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('recovers from denied camera access through manual entry', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } });
    const user = userEvent.setup(); renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Chụp ảnh món ăn/ }));
    await user.click(screen.getByRole('button', { name: 'Mở camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không mở được camera');
    await user.click(screen.getByRole('button', { name: 'Chọn món thủ công' }));
    expect(screen.getByRole('heading', { name: 'Kiểm tra khẩu phần' })).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('validates selected files before making a recognition request', async () => {
    const user = userEvent.setup({ applyAccept: false }); renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Chụp ảnh món ăn/ }));
    await user.upload(screen.getByLabelText('Chọn ảnh bữa ăn'), new File(['text'], 'meal.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn ảnh JPG, PNG hoặc WebP, tối đa 8 MB.');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('stops camera tracks when the capture flow is closed', async () => {
    const stop = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    const user = userEvent.setup(); renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Chụp ảnh món ăn/ }));
    await user.click(screen.getByRole('button', { name: 'Mở camera' }));
    expect(await screen.findByLabelText('Xem trước camera')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng ghi bữa ăn' }));
    expect(stop).toHaveBeenCalled();
  });

  it('maps a non-fallback recognition response into an editable preview without saving automatically', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(response({ success: true, is_fallback: false, status: 'pending_confirmation', detected_items: [
      { food_id: 7, food_name: 'Cơm trắng', estimated_gram: 100, estimated_calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, confidence: 0.9 },
    ] }));
    const user = userEvent.setup(); renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Chụp ảnh món ăn/ }));
    await user.upload(screen.getByLabelText('Chọn ảnh bữa ăn'), new File(['image'], 'meal.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Nhận diện món ăn' }));
    expect(await screen.findByRole('spinbutton', { name: 'Khối lượng Cơm trắng (g)' })).toHaveValue(100);
    expect(apiClient.post).toHaveBeenCalledWith('/ai/recognize-food', expect.objectContaining({ meal_type: 'lunch' }));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' })).toBeEnabled();
  });

  it('rejects backend recognition fallback instead of offering a fake meal', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(response({ success: true, is_fallback: true, status: 'pending_confirmation', detected_items: [] }));
    const user = userEvent.setup(); renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Chụp ảnh món ăn/ }));
    await user.upload(screen.getByLabelText('Chọn ảnh bữa ăn'), new File(['image'], 'meal.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Nhận diện món ăn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('dữ liệu dự phòng');
    expect(screen.queryByRole('button', { name: 'Xác nhận lưu bữa ăn' })).not.toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('does not report saved success for a preview-only server response', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(response({ success: true, status: 'pending_confirmation', meal_id: null, total_calories: 130 }));
    const user = userEvent.setup(); renderDashboard(); await openManual(user); await addRice(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ chưa xác nhận lưu');
    expect(screen.queryByRole('heading', { name: 'Đã lưu vào nhật ký' })).not.toBeInTheDocument();
  });

  it('filters unrelated search fallback and propagates session errors', async () => {
    expect(await liveAPI.search('không tồn tại')).toEqual([]);
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Unauthorized', { status: 401 }));
    const user = userEvent.setup(); renderDashboard(); await openManual(user); await addRice(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
  });
});
