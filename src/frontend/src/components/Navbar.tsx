import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Sparkles, Target, LayoutDashboard, LogOut, Camera, FileText, TrendingUp, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { draftStore } from '../storage/draftStore';
import { MobileAccountMenu } from './MobileAccountMenu';

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
        <Link to="/" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 lg:min-h-11">
          <img
            src="/branding/nutrisnap-logo-icon.webp"
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-2xl bg-slate-950 object-cover shadow-md shadow-emerald-900/20 ring-2 ring-white"
          />
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Nutri<span className="text-nutri-primary">Snap</span>
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-nutri-primary">
              AI Assistant
            </span>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <button type="button" onClick={onOpenChat} aria-label="Mở trợ lý ảo AI" aria-haspopup="dialog" aria-controls="assistant-title"
            className="relative flex min-h-12 items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 via-lime-500 to-amber-400 pl-3 pr-4 text-sm font-bold text-white shadow-md shadow-emerald-600/30 transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 motion-reduce:transition-none">
            <Sparkles aria-hidden="true" className="h-5 w-5" />
            <span aria-hidden="true">AI Coach</span>
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-lime-300" />
          </button>
          <MobileAccountMenu username={user?.username} onLogout={handleLogout} />
        </div>

        {/* Desktop destinations stay in the header; compact layouts use BottomNav. */}
        <nav aria-label="Điều hướng chính" className="hidden w-full flex-wrap items-center justify-between gap-1 lg:flex lg:w-auto sm:gap-2">
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
            className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-emerald-500 via-lime-500 to-amber-400 px-4 py-2 sm:ml-2 text-sm font-bold text-white shadow-md shadow-emerald-600/30 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Trợ lý AI</span>
          </button>

          {/* User profile & Logout (P1) */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
            <div
              title={user?.username || 'Tài khoản'}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-sky-500 ring-2 ring-white shadow-sm flex items-center justify-center text-sm font-bold text-white"
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
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-nutri-muted hover:text-amber-700 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};
