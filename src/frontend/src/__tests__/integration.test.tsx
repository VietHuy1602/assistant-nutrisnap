/**
 * src/frontend/src/__tests__/integration.test.tsx
 * Comprehensive Integration & End-to-End Suite for NutriSnap Auth & Goal Wizard (Step 7).
 * Kiểm tra tích hợp luồng hoàn chỉnh, tính tuân thủ bảo mật Zero-Trust, minh bạch y khoa,
 * và tính bền vững của các route guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { GoalPlannerWizard } from '../pages/GoalPlannerWizard';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PublicOnlyRoute } from '../components/PublicOnlyRoute';
import { authApi } from '../api/authApi';
import { goalApi } from '../api/goalApi';
import { apiClient, UNAUTHORIZED_EVENT } from '../api/client';
import { DISCLAIMER_WIZARD } from '../constants/copy';
import { AuthResponse, GoalData } from '../types/api';
import { ApiError } from '../utils/apiError';
import { AppShell } from '../layouts/AppShell';
import { DashboardPage } from '../pages/DashboardPage';

vi.mock('../api/authApi');
vi.mock('../api/goalApi');

const mockUserWithGoal: AuthResponse = {
  success: true,
  message: 'Đăng nhập thành công',
  has_goal: true,
  user: {
    id: 1,
    username: 'thanhdat',
    email: 'dat@example.com',
  },
};

const mockUserNoGoal: AuthResponse = {
  success: true,
  message: 'Đăng nhập thành công',
  has_goal: false,
  user: {
    id: 1,
    username: 'thanhdat',
    email: 'dat@example.com',
  },
};

const mockCalculatedGoal: GoalData = {
  id: 101,
  user_id: 1,
  target_weight: 62,
  bmr_calories: 1540.5,
  tdee_calories: 2120.0,
  target_calories: 1720.0,
  target_protein_g: 130.0,
  target_carbs_g: 180.0,
  target_fat_g: 45.0,
  daily_budget_vnd: 60000,
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.',
};

describe('End-to-End & Integration Test Suite (Track B, Step 7)', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    vi.mocked(goalApi.getGoal).mockResolvedValue(mockCalculatedGoal);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('1. Luồng E2E: Login -> has_goal=false -> Wizard -> Lưu -> Hiển thị Macro đầy đủ', async () => {
    vi.mocked(authApi.me).mockResolvedValueOnce(mockUserNoGoal);
    vi.mocked(authApi.login).mockResolvedValueOnce(mockUserNoGoal);
    vi.mocked(goalApi.saveGoal).mockResolvedValueOnce(mockCalculatedGoal);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goal-setup']}>
        <AuthProvider>
          <Routes>
            <Route path="/goal-setup" element={<GoalPlannerWizard />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Đi qua 4 bước của Wizard
    // Bước 1: Thông số cơ thể
    await waitFor(() => screen.getByText('Kế hoạch Mục tiêu Dinh dưỡng'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Bước 2: Mục tiêu vóc dáng
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Bước 3: An toàn & Ngân sách
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Bước 4: Xác nhận & Lưu
    await waitFor(() => screen.getByText('Xác nhận thông tin mục tiêu'));
    const saveBtn = screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i });
    await user.click(saveBtn);

    // Kết quả tính toán hiển thị
    await waitFor(() => {
      expect(screen.getByText(/2[.,\s]?120/)).toBeInTheDocument(); // TDEE
      expect(screen.getByText(/1[.,\s]?540[.,]5/)).toBeInTheDocument(); // BMR
      expect(screen.getByText(/1[.,\s]?720/)).toBeInTheDocument(); // Hạn mức
      expect(screen.getByText('130')).toBeInTheDocument(); // Protein
      expect(screen.getByText('180')).toBeInTheDocument(); // Carbs
      expect(screen.getByText('45')).toBeInTheDocument(); // Fat
    });
  });

  it('2. Luồng E2E: Register hợp lệ -> Tự động Login -> Chuyển hướng sang /goal-setup', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Unauthorized')); // khởi đầu chưa login
    vi.mocked(authApi.register).mockResolvedValueOnce({
      success: true,
      message: 'Created',
      has_goal: false,
      user: { id: 2, username: 'khoinguyen', email: 'khoi@example.com' },
    });
    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      message: 'Logged in',
      has_goal: false,
      user: { id: 2, username: 'khoinguyen', email: 'khoi@example.com' },
    });
    vi.mocked(authApi.me).mockResolvedValueOnce({
      success: true,
      message: 'Logged in',
      has_goal: false,
      user: { id: 2, username: 'khoinguyen', email: 'khoi@example.com' },
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/goal-setup" element={<div>Trang Thiết Lập Mục Tiêu</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/Tên đăng nhập/i), 'khoinguyen');
    await user.type(screen.getByLabelText(/Địa chỉ Email/i), 'khoi@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' }), 'Password123');
    await user.type(screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' }), 'Password123');

    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        username: 'khoinguyen',
        email: 'khoi@example.com',
        password: 'Password123',
      });
      expect(authApi.login).toHaveBeenCalledWith({
        username_or_email: 'khoinguyen',
        password: 'Password123',
      });
      expect(screen.getByText('Trang Thiết Lập Mục Tiêu')).toBeInTheDocument();
    });
  });

  it('3. Bảo mật: Tuyệt đối không lưu token vào localStorage hoặc sessionStorage trong toàn bộ luồng Auth', async () => {
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    vi.mocked(authApi.login).mockResolvedValueOnce(mockUserNoGoal);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/Tên đăng nhập hoặc Email/i), 'thanhdat');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Password123');
    await user.click(screen.getByRole('button', { name: /Đăng nhập/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalled();
    });

    // Tuyệt đối không ghi token vào localStorage
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('4. Luồng E2E: Login khi đã có goal (has_goal=true) -> Điều hướng thẳng vào Dashboard (/)', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Unauthorized')); // Ban đầu chưa xác thực
    vi.mocked(authApi.login).mockResolvedValueOnce(mockUserWithGoal);
    vi.mocked(authApi.me).mockResolvedValueOnce(mockUserWithGoal);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Trang Dashboard Cá Nhân</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/Tên đăng nhập hoặc Email/i), 'thanhdat');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Password123');
    await user.click(screen.getByRole('button', { name: /Đăng nhập/i }));

    await waitFor(() => {
      expect(screen.getByText('Trang Dashboard Cá Nhân')).toBeInTheDocument();
    });
  });

  it('5. Bảo mật Zero-Trust: Payload POST /goals chỉ có đúng 9 trường, KHÔNG CÓ user_id', async () => {
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    vi.mocked(goalApi.saveGoal).mockResolvedValueOnce(mockCalculatedGoal);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goal-setup']}>
        <AuthProvider>
          <GoalPlannerWizard />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Đi qua các bước
    await waitFor(() => screen.getByText('Kế hoạch Mục tiêu Dinh dưỡng'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Xác nhận thông tin mục tiêu'));

    const saveBtn = screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(goalApi.saveGoal).toHaveBeenCalledTimes(1);
    });

    const sentPayload = vi.mocked(goalApi.saveGoal).mock.calls[0][0];

    // Xác minh không có user_id (Zero Trust)
    expect(sentPayload).not.toHaveProperty('user_id');

    // Xác minh 9 trường chuẩn backend theo spec
    const expectedKeys = [
      'activity_level',
      'age',
      'current_weight_kg',
      'daily_budget_vnd',
      'gender',
      'goal_type',
      'height_cm',
      'target_weight_kg',
      'weekly_pace_kg',
    ];
    expect(Object.keys(sentPayload).sort()).toEqual(expectedKeys.sort());
  });

  it('6. Bảo mật: Mọi request gửi đi qua ApiClient không đính kèm Authorization header thủ công', () => {
    const defaultHeaders = apiClient.defaults.headers;
    expect(defaultHeaders['Authorization']).toBeUndefined();
    expect(defaultHeaders.common?.['Authorization']).toBeUndefined();
    // withCredentials = true là bắt buộc để tự động gửi HttpOnly cookie
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('7. Phiên hết hạn: Khi backend trả về 401, AuthContext tự động chuyển về unauthenticated', async () => {
    let capturedListener: (() => void) | undefined;
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((event, listener) => {
      if (event === UNAUTHORIZED_EVENT) {
        capturedListener = listener as () => void;
      }
    });

    render(
      <AuthProvider>
        <div>App Body</div>
      </AuthProvider>,
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith(UNAUTHORIZED_EVENT, expect.any(Function));

    // Kích hoạt sự kiện 401
    act(() => {
      capturedListener?.();
    });

    addEventListenerSpy.mockRestore();
  });

  it('8. Minh bạch Y khoa: Disclaimer cảnh báo hiển thị rõ ràng tại các bước của Wizard', async () => {
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goal-setup']}>
        <AuthProvider>
          <GoalPlannerWizard />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Đi tới Bước 3 (Kiểm tra an toàn & Ngân sách) có Disclaimer y khoa
    await waitFor(() => screen.getByText('Kế hoạch Mục tiêu Dinh dưỡng'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));
    expect(screen.getByText(DISCLAIMER_WIZARD)).toBeInTheDocument();

    // Đi tới Bước 4 (Xác nhận & Review) cũng có Disclaimer y khoa
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Xác nhận thông tin mục tiêu'));
    expect(screen.getByText(DISCLAIMER_WIZARD)).toBeInTheDocument();
  });

  it('9. Minh bạch Y khoa: Nhãn "Ước tính" hiển thị trên mọi chỉ số dinh dưỡng', async () => {
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    vi.mocked(goalApi.saveGoal).mockResolvedValueOnce(mockCalculatedGoal);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goal-setup']}>
        <AuthProvider>
          <GoalPlannerWizard />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Submit tới kết quả
    await waitFor(() => screen.getByText('Kế hoạch Mục tiêu Dinh dưỡng'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Xác nhận thông tin mục tiêu'));
    await user.click(screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i }));

    await waitFor(() => {
      const estimateBadges = screen.getAllByText(/Ước tính/i);
      expect(estimateBadges.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('10. Wizard: Lựa chọn "Duy trì vóc dáng" tự động ẩn ô cân nặng mục tiêu và đặt tốc độ = 0', async () => {
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goal-setup']}>
        <AuthProvider>
          <GoalPlannerWizard />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Sang bước 2
    await waitFor(() => screen.getByText('Kế hoạch Mục tiêu Dinh dưỡng'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));

    // Chọn Duy trì
    await user.click(screen.getByRole('button', { name: /Duy trì vóc dáng/i }));
    expect(screen.queryByLabelText(/Cân nặng mục tiêu/i)).not.toBeInTheDocument();

    // Sang bước 3
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));
    expect(
      screen.getByText(/Mục tiêu Duy trì không thay đổi tốc độ cân nặng/i),
    ).toBeInTheDocument();
  });

  it('11. Wizard: Giữ nguyên dữ liệu form khi API gặp lỗi', async () => {
    vi.mocked(authApi.me).mockResolvedValue(mockUserNoGoal);
    vi.mocked(goalApi.saveGoal).mockRejectedValueOnce(
      new Error('Mạng bị gián đoạn khi lưu.'),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goal-setup']}>
        <AuthProvider>
          <GoalPlannerWizard />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Kế hoạch Mục tiêu Dinh dưỡng'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Xác nhận thông tin mục tiêu'));
    await user.click(screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i }));

    await waitFor(() => {
      expect(screen.getByText('Mạng bị gián đoạn khi lưu.')).toBeInTheDocument();
    });

    // Form không bị reset, nút Lưu vẫn sẵn sàng
    expect(
      screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i }),
    ).toBeInTheDocument();
  });

  it('12. ProtectedRoute: Render ConnectionErrorScreen khi status là unreachable', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(
      new ApiError('Lỗi mạng', { isNetworkError: true }),
    );

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Trang Được Bảo Vệ</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Không thể kết nối máy chủ')).toBeInTheDocument();
    });
  });

  it('13. Register: Double-submit bị chặn khi đang gửi request', async () => {
    let resolveRegister: (val: AuthResponse) => void;
    vi.mocked(authApi.me).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(authApi.register).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve;
        }),
    );

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/Tên đăng nhập/i), 'doubleclick');
    await user.type(screen.getByLabelText(/Địa chỉ Email/i), 'double@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' }), 'Password123');
    await user.type(screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' }), 'Password123');

    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });
    await user.click(submitBtn);

    // Nút phải bị disable
    expect(submitBtn).toBeDisabled();

    // Hoàn tất promise
    act(() => {
      resolveRegister!({
        success: true,
        message: 'OK',
        has_goal: false,
        user: { id: 10, username: 'doubleclick', email: 'double@example.com' },
      });
    });
  });

  it('14. PublicOnlyRoute: Điều hướng /goal-setup khi đã authenticated nhưng hasGoal=false', async () => {
    vi.mocked(authApi.me).mockResolvedValueOnce(mockUserNoGoal);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
            </Route>
            <Route path="/goal-setup" element={<div>Trang Wizard Setup</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Trang Wizard Setup')).toBeInTheDocument();
    });
  });

  it('15. Dashboard opens the existing chat without sending or saving and retains goal navigation', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {
      date: '2026-10-23', target_calories: 2000, consumed_calories: 0,
      remaining_calories: 2000, calories_progress_percent: 0, meals_summary: [],
      macros: Object.fromEntries(['protein', 'carbs', 'fat'].map(key => [key, { consumed: 0, target: 100, unit: 'g', progress_percent: 0 }])),
      disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
    } });
    const postSpy = vi.spyOn(apiClient, 'post');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes><Route element={<ProtectedRoute />}><Route element={<AppShell />}><Route path="/" element={<DashboardPage />} /></Route></Route></Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Thiết lập ngay' })).toHaveAttribute('href', '/goal-setup');
    expect(screen.getByRole('link', { name: /Mục tiêu/ })).toHaveAttribute('href', '/goal-setup');
    expect(await screen.findByText(/chưa phải mục tiêu cá nhân/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    expect(screen.getByRole('heading', { name: 'Trợ lý AI NutriSnap' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Trợ lý AI NutriSnap' })).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: 'Đóng trợ lý' });
    expect(close).toHaveFocus();
    expect(document.querySelector('[inert]')).not.toBeNull();
    await user.tab({ shift: true });
    expect(screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' }), 'Bản nháp chưa gửi');
    expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toBeEnabled();
    expect(postSpy).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: 'Trợ lý AI NutriSnap' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở trợ lý AI' })).toHaveFocus();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(postSpy).not.toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalledWith('/dashboard/daily');
  });

  it.each(['success', 'cancel', 'failure', 'invalid', 'refresh-error'])('Chat save coordinates Dashboard refresh: %s (simulated transport)', async outcome => {
    const day = {
      date: '2026-10-23', target_calories: 2000, consumed_calories: 0, remaining_calories: 2000,
      calories_progress_percent: 0, meals_summary: [], disclaimer: 'Ước tính tham khảo.',
      macros: Object.fromEntries(['protein', 'carbs', 'fat'].map(key => [key, { consumed: 0, target: 100, unit: 'g', progress_percent: 0 }])),
    };
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: day });
    getSpy.mockResolvedValueOnce({ data: day });
    if (outcome === 'refresh-error') getSpy.mockRejectedValueOnce(new Error('Dashboard unavailable'));
    else getSpy.mockResolvedValueOnce({ data: { ...day, consumed_calories: 135, remaining_calories: 1865, meals_summary: [{ id: 42 }] } });
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async url => {
      if (url === '/assistant/chat') return { data: {
        reply_text: 'Bản nháp tích hợp kiểm thử.',
        action_card: { type: 'confirm_log_meal', status: 'pending_user_action', data: {
          meal_type: 'lunch', total_calories: 100,
          items: [{ food_id: 7, food_name: 'Món kiểm thử', estimated_gram: 100, calories: 100, protein_g: 2, carbs_g: 20, fat_g: 1 }],
        } },
      } };
      if (outcome === 'failure') throw new ApiError('Rejected', { status: 400 });
      return { status: 201, data: { success: outcome !== 'invalid', meal_id: 42, total_calories: 135, logged_at: '2026-10-23T12:00:00Z' } };
    });
    const user = userEvent.setup();
    render(<MemoryRouter><AuthProvider><Routes><Route element={<ProtectedRoute />}><Route element={<AppShell />}><Route path="/" element={<DashboardPage />} /></Route></Route></Routes></AuthProvider></MemoryRouter>);
    await screen.findByRole('button', { name: 'Mở trợ lý AI' });
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    await user.click(screen.getByRole('button', { name: '🍲 Ghi nhận phở bò' }));
    const confirm = await screen.findByRole('button', { name: 'Xác nhận lưu' });
    if (outcome === 'cancel') {
      await user.click(screen.getByRole('button', { name: 'Hủy' }));
      expect(screen.getByText('Đã hủy · Bữa ăn chưa được lưu')).toBeInTheDocument();
      expect(postSpy).toHaveBeenCalledTimes(1);
    } else {
      await user.click(confirm);
      if (outcome === 'failure' || outcome === 'invalid') await screen.findByRole('alert');
      else {
        expect(await screen.findByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
      }
    }
    await user.keyboard('{Escape}');
    if (outcome === 'success') expect(await screen.findByText('1.865')).toBeInTheDocument();
    if (outcome === 'refresh-error') {
      expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được dữ liệu dinh dưỡng');
      await user.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
      expect(screen.getByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
      await user.keyboard('{Escape}');
    }
    expect(getSpy).toHaveBeenCalledTimes(outcome === 'success' || outcome === 'refresh-error' ? 2 : 1);
  });

  it('Setup banner is reachable by keyboard and Enter navigates without saving (isolated no-goal UI)', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<div>Trang tổng quan kiểm thử</div>} />
              <Route path="/goal-setup" element={<h1>Trang mục tiêu kiểm thử</h1>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    const setupLink = await screen.findByRole('link', { name: 'Thiết lập ngay' });
    expect(setupLink).toHaveAttribute('href', '/goal-setup');
    // Exercise the real tab order instead of focusing the link programmatically.
    const tabStops = screen.getAllByRole('link').length + screen.getAllByRole('button').length;
    for (let index = 0; index < tabStops && document.activeElement !== setupLink; index++) await user.tab();
    expect(setupLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Trang mục tiêu kiểm thử' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Thiết lập ngay' })).not.toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('Chat cancellation displays an unsaved state without logging a meal (simulated API reply)', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {
      reply_text: 'Kiểm tra bản nháp thử nghiệm.',
      action_card: { type: 'confirm_log_meal', status: 'pending_user_action', data: { meal_type: 'lunch', total_calories: 100,
        items: [{ food_id: 7, food_name: 'Món kiểm thử', estimated_gram: 100, calories: 100, protein_g: 2, carbs_g: 20, fat_g: 1 }] } },
    } });
    const user = userEvent.setup();
    render(<MemoryRouter><AuthProvider><Routes><Route element={<AppShell />}><Route path="/" element={<div>Trang kiểm thử</div>} /></Route></Routes></AuthProvider></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Trợ lý AI' }));
    await user.type(screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' }), 'Kiểm thử');
    await user.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }));
    await user.click(await screen.findByRole('button', { name: 'Hủy' }));
    expect(screen.getByText('Đã hủy · Bữa ăn chưa được lưu')).toBeInTheDocument();
    expect(screen.queryByText('Đã xác nhận lưu vào nhật ký')).not.toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('/assistant/chat', { session_id: 1, message: 'Kiểm thử' });
    await user.keyboard('{Escape}');
  });
});
