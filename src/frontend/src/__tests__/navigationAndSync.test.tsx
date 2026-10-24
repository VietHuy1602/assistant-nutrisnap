import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { BottomNav } from '../components/BottomNav';
import { useAppSync } from '../hooks/useAppSync';
import { appBus } from '../app/appBus';
import { draftStore } from '../storage/draftStore';
import * as AuthContextModule from '../context/AuthContext';

describe('Step 7: Six-Section Navigation, Mobile BottomNav and Cross-Screen Sync', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 1, username: 'testuser', email: 'test@example.com' } as any,
      hasGoal: true,
      sessionExpired: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: mockLogout,
      refresh: vi.fn(),
      retryBootstrap: vi.fn(),
      setHasGoal: vi.fn(),
      clearSessionExpired: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Navbar desktop navigation', () => {
    it('1. renders all 6 sections (Tổng quan, Chụp bữa ăn, Mục tiêu, Tiến độ, Thói quen, Báo cáo) and AI trigger', () => {
      const openChat = vi.fn();
      render(
        <MemoryRouter initialEntries={['/']}>
          <Navbar onOpenChat={openChat} />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: /tổng quan/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /chụp bữa ăn/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /mục tiêu/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /tiến độ/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /thói quen/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /báo cáo/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /trợ lý ai/i })).toBeDefined();
    });

    it('2. sets aria-current on active link', () => {
      render(
        <MemoryRouter initialEntries={['/habits']}>
          <Navbar onOpenChat={vi.fn()} />
        </MemoryRouter>
      );

      const habitText = screen.getByText('Thói quen');
      expect(habitText.getAttribute('aria-current')).toBe('page');
    });

    it('3. purges encrypted draftStore on logout before auth logout (ISC-15)', async () => {
      const clearAllSpy = vi.spyOn(draftStore, 'clearAll').mockResolvedValue(undefined);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Navbar onOpenChat={vi.fn()} />
        </MemoryRouter>
      );

      const logoutBtn = screen.getByTitle('Đăng xuất');
      await act(async () => {
        fireEvent.click(logoutBtn);
      });

      expect(clearAllSpy).toHaveBeenCalledTimes(1);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('BottomNav mobile navigation', () => {
    it('4. renders mobile navigation bar with 5 sections', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <BottomNav />
        </MemoryRouter>
      );

      const nav = screen.getByRole('navigation', { name: 'Điều hướng di động' });
      expect(nav).toBeDefined();
      expect(screen.getByRole('link', { name: 'Tổng quan (di động)' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Thói quen' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Chụp ảnh' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Tiến độ' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Báo cáo' })).toBeDefined();
    });
  });

  describe('useAppSync hook', () => {
    it('5. reacts to meal-logged events via appBus and debounces by 300ms', async () => {
      vi.useFakeTimers();
      const onSyncMock = vi.fn();

      const { result } = renderHook(() => useAppSync({ onSync: onSyncMock, debounceMs: 300 }));
      expect(result.current.syncRevision).toBe(0);

      // Emit multiple meal-logged events rapidly
      act(() => {
        appBus.emit({ type: 'meal-logged', at: Date.now(), source: 'test' });
        appBus.emit({ type: 'meal-logged', at: Date.now(), source: 'test' });
      });

      // Still 0 before timer fires
      expect(result.current.syncRevision).toBe(0);
      expect(onSyncMock).not.toHaveBeenCalled();

      // Advance by 300ms
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.syncRevision).toBe(1);
      expect(onSyncMock).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('6. ignores non-sync bus events like connectivity-changed', () => {
      vi.useFakeTimers();
      const onSyncMock = vi.fn();

      const { result } = renderHook(() => useAppSync({ onSync: onSyncMock, debounceMs: 300 }));

      act(() => {
        appBus.emit({ type: 'connectivity-changed', at: Date.now(), source: 'test' });
        vi.advanceTimersByTime(300);
      });

      expect(result.current.syncRevision).toBe(0);
      expect(onSyncMock).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
