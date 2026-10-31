import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PublicOnlyRoute } from '../components/PublicOnlyRoute';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn(), AuthContext: { Provider: undefined } }));

describe('Branded loading presentation keeps existing gates', () => {
  beforeEach(() => vi.mocked(useAuth).mockReturnValue({ status: 'loading' } as ReturnType<typeof useAuth>));

  it('leaves the protected loading screen as soon as authentication is ready', () => {
    const view = render(<MemoryRouter><ProtectedRoute><p>Protected content</p></ProtectedRoute></MemoryRouter>);
    expect(screen.getByAltText(/NutriSnap — Chụp phát biết liền/)).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    vi.mocked(useAuth).mockReturnValue({ status: 'authenticated' } as ReturnType<typeof useAuth>);
    view.rerender(<MemoryRouter><ProtectedRoute><p>Protected content</p></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByAltText(/NutriSnap — Chụp phát biết liền/)).not.toBeInTheDocument();
  });

  it('does not hold the public login behind a splash after the guest result', () => {
    const view = render(<MemoryRouter><PublicOnlyRoute><p>Login content</p></PublicOnlyRoute></MemoryRouter>);
    expect(screen.getByAltText(/NutriSnap — Chụp phát biết liền/)).toBeInTheDocument();
    vi.mocked(useAuth).mockReturnValue({ status: 'unauthenticated', hasGoal: false } as ReturnType<typeof useAuth>);
    view.rerender(<MemoryRouter><PublicOnlyRoute><p>Login content</p></PublicOnlyRoute></MemoryRouter>);
    expect(screen.getByText('Login content')).toBeInTheDocument();
    expect(screen.queryByAltText(/NutriSnap — Chụp phát biết liền/)).not.toBeInTheDocument();
  });
});
