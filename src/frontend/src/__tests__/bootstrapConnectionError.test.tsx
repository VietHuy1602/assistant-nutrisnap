import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { ConnectionErrorScreen } from '../components/ConnectionErrorScreen';
import { authApi } from '../api/authApi';
import { ApiError } from '../utils/apiError';

vi.mock('../api/authApi');

describe('Bootstrap connection diagnostics', () => {
  it.each([403, 404, 500, 503])('shows HTTP %s rather than a network error', async (status) => {
    vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError('Error', { status }));
    render(<AuthProvider><ConnectionErrorScreen /></AuthProvider>);
    expect(await screen.findByText(`ERR_HTTP_${status}`)).toBeInTheDocument();
    expect(screen.queryByText('ERR_SERVER_UNREACHABLE')).not.toBeInTheDocument();
  });

  it('clears the previous HTTP status when retry fails without a response', async () => {
    vi.mocked(authApi.me)
      .mockRejectedValueOnce(new ApiError('Busy', { status: 503 }))
      .mockRejectedValueOnce(new ApiError('Network error', { isNetworkError: true }));
    render(<AuthProvider><ConnectionErrorScreen /></AuthProvider>);
    await screen.findByText('ERR_HTTP_503');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('ERR_SERVER_UNREACHABLE')).toBeInTheDocument();
  });
});
