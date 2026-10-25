/**
 * src/frontend/src/pages/HabitPage.tsx
 * Trang quản lý Thói quen (/habits) theo đặc tả Tuần 6 (Mục 9.1).
 * Tích hợp HabitCalendar, HabitStreakBadge, HabitMilestone và BackOnTrackBanner.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Calendar as CalendarIcon } from 'lucide-react';
import { useHabitMonth } from '../hooks/useHabitMonth';
import { HabitCalendar } from '../components/HabitCalendar';
import { HabitStreakBadge } from '../components/habit/HabitStreakBadge';
import { HabitMilestone } from '../components/habit/HabitMilestone';
import { BackOnTrackBanner } from '../components/habit/BackOnTrackBanner';
import { currentMonthKey, todayDateKey, parseMonthKey } from '../utils/month';
import type { CalendarMonth } from '../types/habit';

export const HabitPage: React.FC = () => {
  const todayStr = todayDateKey();
  const currentKey = currentMonthKey();

  const [month, setMonth] = useState<CalendarMonth>(() => {
    const parsed = parseMonthKey(currentKey);
    return parsed || { year: 2026, month: 10 };
  });

  const [selectedDate, setSelectedDate] = useState<string | undefined>(todayStr);

  const { habitStatus, days, loadState, errorMessage, refetch } = useHabitMonth(month, todayStr);

  const isCompletelyEmpty =
    loadState === 'ready' && habitStatus && habitStatus.streak.totalLoggedDays === 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 sm:px-6 py-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-nutri-primary font-semibold text-xs tracking-wider uppercase">
            <CalendarIcon className="w-4 h-4" aria-hidden="true" />
            <span>Habit Tracker</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Thói quen & Chuỗi ngày
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Duy trì thói quen ghi nhật ký dinh dưỡng đều đặn mỗi ngày (Asia/Ho_Chi_Minh).
          </p>
        </div>

        <Link
          to="/capture"
          className="inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-sm font-semibold shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus shrink-0"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Ghi nhận bữa ăn</span>
        </Link>
      </div>

      {/* Cards Summary Grid */}
      {habitStatus && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HabitStreakBadge streak={habitStatus.streak} />
          <HabitMilestone challenge={habitStatus.sevenDayChallenge} />
          <BackOnTrackBanner backOnTrack={habitStatus.backOnTrack} />
        </div>
      )}

      {/* Empty State Banner (nếu chưa có bất kỳ bữa ăn nào) */}
      {isCompletelyEmpty && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center space-y-3">
          <p className="text-base font-bold text-emerald-950">
            Bắt đầu ghi bữa ăn để thấy lịch của bạn!
          </p>
          <p className="text-xs text-emerald-800 max-w-md mx-auto">
            Mỗi lần bạn lưu một bữa ăn, ngày đó sẽ được tự động đánh dấu hoàn thành trên lịch mà
            không cần thao tác check-in phức tạp.
          </p>
          <div className="pt-1">
            <Link
              to="/capture"
              className="inline-flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-xs font-bold"
            >
              <Camera className="w-4 h-4" />
              <span>Chụp bữa ăn ngay</span>
            </Link>
          </div>
        </div>
      )}

      {/* Habit Calendar Component */}
      <HabitCalendar
        month={month}
        today={todayStr}
        days={days}
        loadState={loadState}
        source="verified"
        selectedDate={selectedDate}
        errorMessage={errorMessage}
        onMonthChange={setMonth}
        onDateSelect={setSelectedDate}
        onRetry={refetch}
      />

      {/* Footer non-punitive notice */}
      <footer className="text-center py-4 border-t border-slate-100 text-xs text-slate-400">
        <p>
          Thói quen được ghi nhận khi bạn lưu bữa ăn. Không có ngày nào bị tính là thất bại.
        </p>
        <p className="mt-1 text-[11px] text-slate-400/80">
          {habitStatus?.disclaimer}
        </p>
      </footer>
    </div>
  );
};

export default HabitPage;
