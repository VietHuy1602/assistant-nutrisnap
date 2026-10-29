import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { authApi } from '../api/authApi';
import { ApiError } from '../utils/apiError';
import { apiClient } from '../api/client';

vi.mock('../api/authApi');
const session = { success: true, message: 'OK', has_goal: false,
  user: { id: 1, username: 'test', email: 'test@example.com', created_at: '2026-01-01T00:00:00Z' } };
function Consumer() {
  const { status, login, refresh } = useAuth();
  const [error, setError] = useState('');
  return <><p>{status}</p><p>{error}</p>
    <button onClick={() => void login({ username_or_email: 'test', password: 'Test123!' })
      .catch(e => setError(e.message))}>Login</button>
    <button onClick={() => void refresh()}>Refresh</button></>;
}
async function start() {
  vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError('Unauthorized', { status: 401 }));
  render(<AuthProvider><Consumer /></AuthProvider>);
  await screen.findByText('unauthenticated');
}
beforeEach(() => vi.resetAllMocks());

describe('Cookie session verification', () => {
  it('keeps credentials enabled, verifies login, then refreshes the session', async () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
    await start();
    vi.mocked(authApi.login).mockResolvedValue(session);
    vi.mocked(authApi.me).mockResolvedValue(session);
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('authenticated');
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(3));
    expect(screen.getByText('authenticated')).toBeInTheDocument();
  });

  it('does not verify a session after failed credentials', async () => {
    await start();
    vi.mocked(authApi.login).mockRejectedValue(new ApiError('Wrong credentials', { status: 401 }));
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('Wrong credentials');
    expect(authApi.me).toHaveBeenCalledTimes(1);
    expect(screen.getByText('unauthenticated')).toBeInTheDocument();
  });

  it('reports a missing session only when login succeeded and me returns 401', async () => {
    await start();
    vi.mocked(authApi.login).mockResolvedValue(session);
    vi.mocked(authApi.me).mockRejectedValue(new ApiError('Unauthorized', { status: 401 }));
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText(/Đăng nhập thành công nhưng phiên chưa được lưu/);
  });

  it('preserves connection failures instead of blaming cookie storage', async () => {
    await start();
    vi.mocked(authApi.login).mockResolvedValue(session);
    vi.mocked(authApi.me).mockRejectedValue(new ApiError('Network unavailable', { isNetworkError: true }));
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('Network unavailable');
    expect(screen.getByText('unreachable')).toBeInTheDocument();
  });
});
