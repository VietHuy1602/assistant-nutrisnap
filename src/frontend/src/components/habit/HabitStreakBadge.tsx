/**
 * src/frontend/src/components/habit/HabitStreakBadge.tsx
 * Hiển thị chuỗi ngày kiên trì do Backend cung cấp (ADR-W6-11).
 * TUÂN THỦ ZERO-MATH (M3): Tuyệt đối không tự đếm hay tính toán chuỗi ngày.
 */

import React from 'react';
import { Trophy } from 'lucide-react';
import type { StreakSummary } from '../../api/habitContract';

interface HabitStreakBadgeProps {
  streak: StreakSummary;
}

export const HabitStreakBadge: React.FC<HabitStreakBadgeProps> = ({ streak }) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-3xl p-5 text-white shadow-lg shadow-teal-900/15 flex flex-col justify-between">
      {/* Ngọn lửa trang trí lớn bên phải như thiết kế */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-1 top-3 select-none text-6xl drop-shadow-lg sm:text-7xl">🔥</span>
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold tracking-wider text-emerald-100">
            Chuỗi ngày duy trì
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-5xl font-extrabold tracking-tight drop-shadow-sm">{streak.currentStreak}</span>
          <span className="text-sm text-emerald-100 font-medium">ngày liên tiếp</span>
        </div>
        <div className="mt-2 text-xs text-emerald-100 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
          <span>
            Kỷ lục cao nhất: <strong className="text-white">{streak.longestStreak} ngày</strong>
          </span>
        </div>
      </div>
      <p className="relative mt-4 pt-3 border-t border-white/25 text-xs text-emerald-100">
        Tổng số ngày có nhật ký: <strong className="text-white">{streak.totalLoggedDays} ngày</strong>
      </p>
    </div>
  );
};
