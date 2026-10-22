import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Salad, Target, LayoutDashboard, MessageSquareText, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentTab?: string;
  onSelectTab?: (tab: string) => void;
  onOpenChat: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenChat }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const initial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-nutri-primary">
            <Salad className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Nutri<span className="text-nutri-primary">Snap</span>
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-nutri-primary">
              AI Assistant
            </span>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Tổng quan</span>
          </NavLink>

          <NavLink
            to="/goal-setup"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">Mục tiêu</span>
          </NavLink>

          {/* Quick Chat Assistant Trigger */}
          <button
            type="button"
            onClick={onOpenChat}
            className="flex items-center gap-1.5 px-3.5 py-2 ml-1 sm:ml-2 rounded-lg text-sm font-medium bg-nutri-primary hover:bg-nutri-dark text-white transition-all shadow-xs active:scale-95"
          >
            <MessageSquareText className="w-4 h-4" />
            <span>Trợ lý AI</span>
          </button>

          {/* User profile & Logout (P1) */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
            <div
              title={user?.username || 'Tài khoản'}
              className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700"
            >
              {initial}
            </div>
            <span className="hidden lg:inline text-xs font-semibold text-slate-700 max-w-[100px] truncate">
              {user?.username}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};
