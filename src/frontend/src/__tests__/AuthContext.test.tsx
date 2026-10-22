import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { authApi } from '../api/authApi';
import { UNAUTHORIZED_EVENT } from '../api/client';
import { AuthResponse, BaseResponse } from '../types/api';

vi.mock('../api/authApi');

const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  created_at: '2026-01-01T00:00:00Z',
};

const mockAuthResponseWithGoal: AuthResponse = {
  success: true,
  message: 'Success',
  has_goal: true,
  user: mockUser,
};

const mockAuthResponseNoGoal: AuthResponse = {
  success: true,
  message: 'Success',
  has_goal: false,
  user: mockUser,
};

const mockBaseResponse: BaseResponse = {
  success: true,
  message: 'Logged out',
  disclaimer: 'Disclaimer',
};

// Component helper để đọc AuthContext trong test
const TestConsumer = () => {
  const { status, user, hasGoal, sessionExpired, login, register, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="username">{user?.username ?? 'none'}</div>
      <div data-testid="hasGoal">{hasGoal ? 'yes' : 'no'}</div>
      <div data-testid="sessionExpired">{sessionExpired ? 'yes' : 'no'}</div>
      <button onClick={() => login({ username_or_email: 'testuser', password: 'Password1' })}>
        Action Login
      </button>
      <button
        onClick={() =>
          register({ username: 'newuser', email: 'new@example.com', password: 'Password1' })
        }
      >
        Action Register
      </button>
      <button onClick={() => logout()}>Action Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Bootstrap 200: Khởi động thành công, chuyển sang authenticated với thông tin user', async () => {
    vi.mocked(authApi.me).mockResolvedValueOnce(mockAuthResponseWithGoal);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('username')).toHaveTextContent('testuser');
    expect(screen.getByTestId('hasGoal')).toHaveTextContent('yes');
    expect(screen.getByTestId('sessionExpired')).toHaveTextContent('no');
  });

  it('2. Bootstrap 401: Khởi động khi chưa đăng nhập, chuyển sang unauthenticated', async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });

    expect(screen.getByTestId('username')).toHaveTextContent('none');
    expect(screen.getByTestId('hasGoal')).toHaveTextContent('no');
  });

  it('3. login(): gọi authApi.login rồi gọi authApi.me để xác nhận HttpOnly cookie', async () => {
    vi.mocked(authApi.me)
      .mockRejectedValueOnce(new Error('Unauthorized')) // bootstrap ban đầu
      .mockResolvedValueOnce(mockAuthResponseWithGoal); // sau khi login

    vi.mocked(authApi.login).mockResolvedValueOnce(mockAuthResponseWithGoal);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });

    await user.click(screen.getByText('Action Login'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });

    expect(authApi.login).toHaveBeenCalledWith({
      username_or_email: 'testuser',
      password: 'Password1',
    });
    // Gọi me ít nhất 2 lần: bootstrap (1) + sau login (2)
    expect(authApi.me).toHaveBeenCalledTimes(2);
  });

  it('4. register(): gọi authApi.register rồi tự động gọi login + me', async () => {
    vi.mocked(authApi.me)
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce(mockAuthResponseNoGoal);

    vi.mocked(authApi.register).mockResolvedValueOnce(mockAuthResponseNoGoal);
    vi.mocked(authApi.login).mockResolvedValueOnce(mockAuthResponseNoGoal);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });

    await user.click(screen.getByText('Action Register'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });

    expect(authApi.register).toHaveBeenCalledWith({
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password1',
    });
    expect(authApi.login).toHaveBeenCalledWith({
      username_or_email: 'newuser',
      password: 'Password1',
    });
  });

  it('5. logout(): gọi authApi.logout và dọn dẹp state cục bộ', async () => {
    vi.mocked(authApi.me).mockResolvedValueOnce(mockAuthResponseWithGoal);
    vi.mocked(authApi.logout).mockResolvedValueOnce(mockBaseResponse);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });

    await user.click(screen.getByText('Action Logout'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });

    expect(screen.getByTestId('username')).toHaveTextContent('none');
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });

  it('6. Lắng nghe UNAUTHORIZED_EVENT: chuyển unauthenticated và set sessionExpired = true', async () => {
    vi.mocked(authApi.me).mockResolvedValueOnce(mockAuthResponseWithGoal);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });

    // Phát sự kiện 401 toàn cục
    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
      expect(screen.getByTestId('sessionExpired')).toHaveTextContent('yes');
    });
  });
});
