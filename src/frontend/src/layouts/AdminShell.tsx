/**
 * src/frontend/src/layouts/AdminShell.tsx
 * Khung giao diện riêng cho tài khoản quản trị: chỉ có logo, menu tài khoản (chế độ tối, đăng xuất)
 * và trang Quản trị. Không có thanh điều hướng, AI Coach, chụp món hay nhắc bữa ăn của khách hàng.
 */

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MobileAccountMenu } from '../components/MobileAccountMenu';

export const AdminShell: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-nutri-surface flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 min-h-16 flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/branding/nutrisnap-logo-icon.webp"
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 -rotate-6 object-contain drop-shadow-md"
            />
            <div className="min-w-0">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Nutri<span className="text-nutri-primary">Snap</span>
              </span>
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Admin</span>
            </div>
          </div>
          <MobileAccountMenu username={user?.username} isAdmin onLogout={handleLogout} />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};
