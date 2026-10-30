/**
 * src/frontend/src/components/BottomNav.tsx
 * Thanh điều hướng di động 5 phân hệ + nút chụp ảnh trung tâm (ADR-W6-04).
 * Hiển thị trên thiết bị di động (lg:hidden), tuân thủ ARIA aria-current="page".
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Flame, Camera, TrendingUp, FileText } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const navItems = [
    {
      to: '/',
      label: 'Tổng quan',
      ariaLabel: 'Tổng quan (di động)',
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: '/habits',
      label: 'Thói quen',
      icon: Flame,
    },
    {
      to: '/capture',
      label: 'Chụp ảnh',
      icon: Camera,
      isAction: true,
    },
    {
      to: '/progress',
      label: 'Tiến độ',
      icon: TrendingUp,
    },
    {
      to: '/reports',
      label: 'Báo cáo',
      icon: FileText,
    },
  ];

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed bottom-3 inset-x-3 rounded-[28px] z-30 lg:hidden bg-white/95 backdrop-blur-md border border-slate-100 shadow-sm pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="grid grid-cols-5 items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isAction) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                className="flex flex-col items-center justify-center -mt-5 min-h-12 min-w-12 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 rounded-full"
              >
                {({ isActive }) => (
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform group-active:scale-95 ${
                      isActive
                        ? 'bg-[#9ADA26] text-[#171717] ring-4 ring-white'
                        : 'bg-[#9ADA26] hover:bg-[#E0F1B8] text-[#171717] ring-4 ring-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
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
                `flex flex-col items-center justify-center min-h-12 min-w-12 py-1 px-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 motion-reduce:transition-none ${
                  isActive
                    ? 'bg-[#E0F1B8] text-[#171717] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 transition-transform ${
                      isActive ? 'stroke-[2.5px] scale-110' : 'stroke-[1.75px]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs mt-0.5 tracking-tight font-medium">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
