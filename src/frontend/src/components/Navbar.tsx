import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Salad, Target, LayoutDashboard, MessageSquareText, LogOut, Camera, FileText, TrendingUp, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { draftStore } from '../storage/draftStore';

interface NavbarProps {
  currentTab?: string;
  onSelectTab?: (tab: string) => void;
  onOpenChat: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenChat }) => {
  const { user, logout, hasGoal } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await draftStore.clearAll();
    } catch {
      // ignore error during draft cleanup
    }
    await logout();
    navigate('/login', { replace: true });
  };

  const prefetchCapture = () => {
    import('../pages/MealCaptureFlow');
  };

  const prefetchProgress = () => {
    import('../pages/ProgressAnalyticsPage');
  };

  const prefetchHabits = () => {
    import('../pages/HabitPage');
  };

  const prefetchReports = () => {
    import('../pages/MonthlyReportPage');
  };

  const initial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex flex-wrap items-center justify-between gap-3 py-3 lg:flex-nowrap lg:py-0">
        {/* Brand Logo */}
        <Link to="/" className="flex min-h-11 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2">
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
        <nav aria-label="Điều hướng chính" className="flex w-full flex-wrap items-center justify-between gap-1 lg:w-auto sm:gap-2">
          <NavLink
            to="/"
            aria-label="Tổng quan"
            end
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Tổng quan</span>
          </NavLink>

          {hasGoal && (
            <NavLink
              to="/capture"
              aria-label="Chụp bữa ăn"
              onMouseEnter={prefetchCapture}
              onFocus={prefetchCapture}
              className={({ isActive }) =>
                `flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus ${
                  isActive
                    ? 'bg-emerald-50 text-nutri-primary font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`
              }
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Chụp bữa ăn</span>
            </NavLink>
          )}

          <NavLink
            to="/goal-setup"
            aria-label="Mục tiêu"
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">Mục tiêu</span>
          </NavLink>

          <NavLink
            to="/progress"
            aria-label="Tiến độ"
            onMouseEnter={prefetchProgress}
            onFocus={prefetchProgress}
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline" aria-current={isActive ? 'page' : undefined}>Tiến độ</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/habits"
            aria-label="Thói quen"
            onMouseEnter={prefetchHabits}
            onFocus={prefetchHabits}
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Flame className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline" aria-current={isActive ? 'page' : undefined}>Thói quen</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/monthly-report"
            aria-label="Báo cáo tháng"
            onMouseEnter={prefetchReports}
            onFocus={prefetchReports}
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus ${
                isActive
                  ? 'bg-emerald-50 text-nutri-primary font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <FileText className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline" aria-current={isActive ? 'page' : undefined}>Báo cáo tháng</span>
              </>
            )}
          </NavLink>

          {/* Quick Chat Assistant Trigger */}
          <button
            type="button"
            onClick={onOpenChat}
            aria-haspopup="dialog"
            aria-controls="assistant-title"
            className="flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3 py-2 sm:ml-2 rounded-lg text-sm font-medium bg-nutri-primary hover:bg-nutri-dark text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 motion-reduce:transition-none"
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
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-nutri-muted hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};
