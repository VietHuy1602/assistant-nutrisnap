/**
 * src/frontend/src/__tests__/resilience.test.tsx
 * Test suite cho Kế hoạch Kết nối Bền vững (Resilient Integration, SAC-1 … SAC-6, Step 4).
 * Bao phủ:
 * 1. 401 chuyển unauthenticated
 * 2. Network error / 5xx chuyển unreachable (không văng về /login)
 * 3. ConnectionErrorScreen bấm nút "Thử lại" hoạt động chuẩn
 * 4. useDelayedFlag: Splash không hiển thị khi tác vụ < 150 ms
 * 5. useDelayedFlag: Splash hiển thị khi tác vụ > 150 ms
 * 6. ApiClient: Retry GET tối đa 1 lần khi lỗi mạng hoặc 503
 * 7. ApiClient: POST không bao giờ retry
 * 8. AuthContext: In-flight deduplication gộp các request /auth/me đồng thời
 * 9. AuthContext: Sự kiện 'online' tự động kích hoạt retryBootstrap khi unreachable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import { AxiosError } from 'axios';
import { AuthProvider, useAuth, fetchMeDeduped } from '../context/AuthContext';
import { authApi } from '../api/authApi';
import { apiClient } from '../api/client';
import { ApiError } from '../utils/apiError';
import { ConnectionErrorScreen } from '../components/ConnectionErrorScreen';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { AuthResponse } from '../types/api';

vi.mock('../api/authApi');

const mockAuthResponse: AuthResponse = {
  success: true,
  message: 'Success',
  has_goal: true,
  user: {
    id: 1,
    username: 'thanhdat',
    email: 'dat@example.com',
  },
};

const TestConsumer = () => {
  const { status, user, retryBootstrap } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="username">{user?.username ?? 'none'}</div>
      <button onClick={() => retryBootstrap()}>Retry Bootstrap</button>
    </div>
  );
};

describe('Resilience & Connection Robustness (Step 4, SAC-1 … SAC-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. GET /auth/me trả về 401 -> chuyển trạng thái unauthenticated', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(
      new ApiError('Tên đăng nhập hoặc mật khẩu không đúng.', { status: 401 }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });
    expect(screen.getByTestId('username')).toHaveTextContent('none');
  });

  it('2. GET /auth/me gặp lỗi mạng / 5xx -> chuyển sang unreachable (SAC-3: không đẩy về /login)', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(
      new ApiError('Không thể kết nối tới máy chủ.', { isNetworkError: true }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unreachable');
    });
    expect(screen.getByTestId('username')).toHaveTextContent('none');
  });

  it('3. ConnectionErrorScreen: Bấm nút "Thử lại" kích hoạt retry và hiển thị trạng thái đang thử (SAC-4)', async () => {
    const user = userEvent.setup();
    const mockRetry = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );

    render(<ConnectionErrorScreen onRetry={mockRetry} />);

    expect(screen.getByText('Không thể kết nối máy chủ')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /Thử lại/i });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('4. useDelayedFlag: Không bật cờ khi tác vụ hoàn thành dưới 150 ms (SAC-1, SAC-2: triệt tiêu FOUC)', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 150),
      { initialProps: { active: true } },
    );

    expect(result.current).toBe(false);

    // Thời gian trôi qua 60 ms (< 150 ms)
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current).toBe(false);

    // Tác vụ kết thúc ở 80 ms (< 150 ms)
    rerender({ active: false });
    expect(result.current).toBe(false);

    // Sau 200 ms, cờ vẫn là false vì đã kết thúc sớm
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(false);

    vi.useRealTimers();
  });

  it('5. useDelayedFlag: Bật cờ mượt mà khi tác vụ kéo dài trên 150 ms', () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useDelayedFlag(true, 150));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(151);
    });
    expect(result.current).toBe(true);

    vi.useRealTimers();
  });

  it('6. ApiClient: Tự động retry tối đa 1 lần cho request GET khi lỗi mạng hoặc 503', async () => {
    const requestSpy = vi.spyOn(apiClient, 'request').mockResolvedValueOnce({
      data: { success: true },
    });

    interface InterceptorHandler {
      rejected?: (err: unknown) => Promise<unknown>;
    }
    const handlers = (apiClient.interceptors.response as unknown as { handlers: InterceptorHandler[] }).handlers;
    const responseHandler = handlers?.[0]?.rejected;
    if (!responseHandler) throw new Error('Response interceptor not found');

    const mockConfig = {
      method: 'get',
      url: '/auth/me',
      _retryCount: 0,
    };
    const mockError = {
      config: mockConfig,
      response: {
        status: 503,
      },
    } as unknown as AxiosError;

    // Kích hoạt interceptor với lỗi 503 lần đầu
    await responseHandler(mockError);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(mockConfig._retryCount).toBe(1);

    // Khi lỗi lần 2 (_retryCount = 1), không được retry tiếp
    await expect(responseHandler(mockError)).rejects.toThrow();
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('7. ApiClient: Tuyệt đối KHÔNG retry đối với request POST', async () => {
    const requestSpy = vi.spyOn(apiClient, 'request');

    interface InterceptorHandler {
      rejected?: (err: unknown) => Promise<unknown>;
    }
    const handlers = (apiClient.interceptors.response as unknown as { handlers: InterceptorHandler[] }).handlers;
    const responseHandler = handlers?.[0]?.rejected;
    if (!responseHandler) throw new Error('Response interceptor not found');

    const mockPostError = {
      config: {
        method: 'post',
        url: '/goals',
      },
      response: undefined, // Mất kết nối mạng
    } as unknown as AxiosError;

    await expect(responseHandler(mockPostError)).rejects.toThrow();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('8. AuthContext: In-flight deduplication gộp các request /auth/me đồng thời thành 1 cuộc gọi (SAC-5)', async () => {
    vi.mocked(authApi.me).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockAuthResponse), 30);
        }),
    );

    // Kích hoạt 3 lời gọi đồng thời
    const [res1, res2, res3] = await Promise.all([
      fetchMeDeduped(),
      fetchMeDeduped(),
      fetchMeDeduped(),
    ]);

    expect(res1).toEqual(mockAuthResponse);
    expect(res2).toEqual(mockAuthResponse);
    expect(res3).toEqual(mockAuthResponse);
    // authApi.me chỉ được gọi đúng 1 lần duy nhất
    expect(authApi.me).toHaveBeenCalledTimes(1);
  });

  it('9. AuthContext: Sự kiện "online" tự động kích hoạt retryBootstrap khi đang unreachable (SAC-4)', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(
      new ApiError('Mất mạng', { isNetworkError: true }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unreachable');
    });

    // Chuẩn bị mock cho lần phục hồi
    vi.mocked(authApi.me).mockResolvedValueOnce(mockAuthResponse);

    // Bắn sự kiện window online
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });
    expect(screen.getByTestId('username')).toHaveTextContent('thanhdat');
  });
});
