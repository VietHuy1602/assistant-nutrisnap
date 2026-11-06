/**
 * src/frontend/src/components/BottomNav.tsx
 * Thanh điều hướng di động 5 phân hệ + nút chụp ảnh trung tâm nổi (ADR-W6-04).
 * Hiển thị trên thiết bị di động (lg:hidden), tuân thủ ARIA aria-current="page".
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, Camera, Target, UtensilsCrossed } from 'lucide-react';

type IconKind = 'grid' | 'flame' | 'target' | 'menu';

// Biểu tượng nhiều màu: dùng chung các dải màu khai báo một lần trong <defs> bên dưới
function NavIcon({ kind, active }: { kind: IconKind; active: boolean }) {
  const size = `h-7 w-7 transition-transform ${active ? 'scale-110' : ''}`;
  if (kind === 'flame') {
    return <span aria-hidden="true" className={`grid place-items-center text-2xl leading-none ${size}`}>🔥</span>;
  }
  if (kind === 'grid') {
    return <LayoutGrid aria-hidden="true" className={size} stroke="url(#navGradBlue)" fill="url(#navGradBlue)" strokeWidth={1.5} />;
  }
  if (kind === 'target') {
    return <Target aria-hidden="true" className={size} stroke="url(#navGradBlue)" strokeWidth={2.5} />;
  }
  return <UtensilsCrossed aria-hidden="true" className={size} stroke="url(#navGradViolet)" strokeWidth={2.4} />;
}

export const BottomNav: React.FC = () => {
  const navItems: Array<{ to: string; label: string; ariaLabel?: string; icon?: IconKind; end?: boolean; isAction?: boolean }> = [
    { to: '/', label: 'Tổng quan', ariaLabel: 'Tổng quan (di động)', icon: 'grid', end: true },
    { to: '/habits', label: 'Thói quen', icon: 'flame' },
    { to: '/capture', label: 'Chụp ảnh', isAction: true },
    { to: '/goal-setup', label: 'Mục tiêu', icon: 'target' },
    { to: '/meal-plan', label: 'Thực đơn', icon: 'menu' },
  ];

  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed bottom-3 inset-x-3 z-30 lg:hidden rounded-[30px] bg-gradient-to-r from-green-400 via-sky-300 to-fuchsia-500 p-[2px] shadow-xl shadow-slate-900/15 pb-[calc(2px+env(safe-area-inset-bottom,0px))]"
    >
      {/* Dải màu dùng chung cho các biểu tượng */}
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="navGradBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id="navGradViolet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
      </svg>

      <div className="grid grid-cols-5 items-end rounded-[28px] bg-white/90 px-2 py-1.5 backdrop-blur-md">
        {navItems.map((item) => {
          if (item.isAction) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  `group flex min-h-12 min-w-12 flex-col items-center justify-end rounded-2xl pb-0.5 ${focus} ${isActive ? 'nav-active' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Nút chụp nổi lên giữa thanh, có mầm cây như logo */}
                    <span className="relative -mt-9 mb-0.5 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-lime-300 via-green-400 to-emerald-500 shadow-lg shadow-green-500/40 ring-4 ring-white transition-transform group-active:scale-95">
                      <span aria-hidden="true" className="absolute -top-4 text-xl leading-none">🌱</span>
                      <Camera aria-hidden="true" className="h-7 w-7 text-slate-900" strokeWidth={isActive ? 2.5 : 2.1} />
                    </span>
                    <span className="text-xs font-bold tracking-tight text-emerald-900">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.ariaLabel || item.label}
              className={({ isActive }) =>
                `relative flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors motion-reduce:transition-none ${focus} ${
                  isActive ? 'nav-active bg-white font-bold text-slate-900 shadow-md ring-1 ring-slate-100' : 'text-slate-700 hover:bg-white/70'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden="true" className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-sky-200" />}
                  <NavIcon kind={item.icon!} active={isActive} />
                  <span className="text-xs tracking-tight font-semibold">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
