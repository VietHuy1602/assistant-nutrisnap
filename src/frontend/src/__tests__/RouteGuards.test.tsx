import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PublicOnlyRoute } from '../components/PublicOnlyRoute';

let mockAuthStatus: 'loading' | 'authenticated' | 'unauthenticated' | 'unreachable' = 'loading';
let mockHasGoal = false;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    status: mockAuthStatus,
    hasGoal: mockHasGoal,
  }),
}));

describe('Route Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ProtectedRoute', () => {
    it('1. Đang kiểm tra phiên (loading): hiển thị màn hình chờ Spinner', async () => {
      mockAuthStatus = 'loading';
      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Trang Bảo Mật</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      // Nhãn trạng thái chỉ hiện sau 150ms để tránh nháy splash khi phiên được xác nhận nhanh.
      expect(await screen.findByText('Đang kiểm tra phiên đăng nhập…')).toBeInTheDocument();
      expect(screen.queryByText('Trang Bảo Mật')).not.toBeInTheDocument();
    });

    it('2. Chưa đăng nhập (unauthenticated): điều hướng sang /login', () => {
      mockAuthStatus = 'unauthenticated';
      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Trang Bảo Mật</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument();
      expect(screen.queryByText('Trang Bảo Mật')).not.toBeInTheDocument();
    });

    it('3. Đã đăng nhập (authenticated): hiển thị nội dung route con', () => {
      mockAuthStatus = 'authenticated';
      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Trang Bảo Mật</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Trang Bảo Mật')).toBeInTheDocument();
    });
  });

  describe('PublicOnlyRoute', () => {
    it('4. Đã đăng nhập và hasGoal=true: điều hướng sang / (Dashboard)', () => {
      mockAuthStatus = 'authenticated';
      mockHasGoal = true;

      render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/" element={<div>Trang Dashboard</div>} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Trang Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Trang Đăng Nhập')).not.toBeInTheDocument();
    });

    it('5. Đã đăng nhập và hasGoal=false: điều hướng sang /goal-setup', () => {
      mockAuthStatus = 'authenticated';
      mockHasGoal = false;

      render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/goal-setup" element={<div>Trang Thiết Lập Mục Tiêu</div>} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Trang Thiết Lập Mục Tiêu')).toBeInTheDocument();
      expect(screen.queryByText('Trang Đăng Nhập')).not.toBeInTheDocument();
    });

    it('6. Chưa đăng nhập: cho phép truy cập trang login/register', () => {
      mockAuthStatus = 'unauthenticated';

      render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument();
    });
  });
});
