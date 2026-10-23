/**
 * src/frontend/src/pages/BasicDashboard.tsx
 * Daily Nutrition Progress Dashboard.
 * Tuân thủ ADR-W3-02 (Zero FE math - mọi số liệu từ Backend),
 * ADR-W3-07 & PSC-13 (Tuyệt đối không dùng số liệu giả định; lỗi hiển thị thật + Thử lại),
 * và PSC-10..PSC-14.
 */

import React from 'react';
import { Camera, AlertTriangle, RefreshCw, Bot } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDailyDashboard } from '../hooks/useDailyDashboard';
import { CalorieRing } from '../components/dashboard/CalorieRing';
import { MacroBar } from '../components/dashboard/MacroBar';
import { MealTimeline } from '../components/dashboard/MealTimeline';
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton';
import { DateNavigator } from '../components/dashboard/DateNavigator';
import { NoGoalNotice } from '../components/dashboard/NoGoalNotice';
import { DashboardEmpty } from '../components/dashboard/DashboardEmpty';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { mealApi } from '../api/mealApi';
import { emitMealLogged } from '../utils/mealEvents';
import { DISCLAIMER_RECOGNITION } from '../constants/copy';
import type { AppShellContext } from '../layouts/AppShell';

export const BasicDashboard: React.FC = () => {
  const { user, hasGoal } = useAuth();
  const outletContext = useOutletContext<AppShellContext | undefined>();
  const openChat = outletContext?.openChat;

  const {
    data,
    status,
    error,
    selectedDate,
    setSelectedDate,
    refetch,
  } = useDailyDashboard();

  const handleDeleteMeal = async (mealId: number) => {
    try {
      await mealApi.deleteMeal(mealId);
      emitMealLogged({ deletedMealId: mealId });
      await refetch();
    } catch {
      // ignore
    }
  };

  // 1. Trạng thái Đang tải (Loading Skeleton - PSC-11)
  if (status === 'loading') {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8">
        <DashboardSkeleton />
      </div>
    );
  }

  // 2. Trạng thái Lỗi kết nối (Error State - PSC-13: 0 số liệu giả)
  if (status === 'error' || !data) {
    return (
      <div className="w-full max-w-lg mx-auto px-4 py-16 text-center flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
          <AlertTriangle className="w-7 h-7" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Không tải được dữ liệu hôm nay</h2>
          <p className="text-xs text-slate-500 mt-1">
            {error || 'Máy chủ dinh dưỡng chưa phản hồi. Vui lòng kiểm tra kết nối mạng và thử lại.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  const meals = data.meals_summary || data.meals || [];
  const hasMeals = meals.length > 0;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header chào mừng & Bộ điều hướng ngày */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            DINH DƯỠNG TRONG NGÀY
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
            Chào {user?.username || 'bạn'} 👋
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi năng lượng và dinh dưỡng tất định từ CSDL khoa học.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DateNavigator currentDate={selectedDate} onDateChange={setSelectedDate} />

          <Link
            to="/capture"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-sm shadow-emerald-600/20 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>Chụp bữa ăn</span>
          </Link>

          {openChat && (
            <button
              type="button"
              onClick={openChat}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl border border-slate-200/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-label="Mở trợ lý ảo AI"
            >
              <Bot className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span>Trợ lý AI</span>
            </button>
          )}
        </div>
      </div>

      {/* Thông báo nếu chưa tạo mục tiêu cá nhân */}
      {!hasGoal && <NoGoalNotice />}

      {/* Khối chính 2 cột: Vòng Calo & 3 Thanh Macro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <CalorieRing
          consumed={data.consumed_calories}
          target={data.target_calories}
          remaining={data.remaining_calories}
          progressPercent={data.calories_progress_percent}
        />

        <MacroBar macros={data.macros} />
      </div>

      {/* Danh sách các bữa ăn trong ngày */}
      <div className="mt-2">
        {hasMeals ? (
          <MealTimeline meals={meals} onDeleteMeal={handleDeleteMeal} />
        ) : (
          <DashboardEmpty />
        )}
      </div>

      {/* Footer Disclaimer minh bạch y khoa (Guardrail M3, M4) */}
      <div className="mt-4 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400">
        <DisclaimerBadge />
        <span className="italic max-w-md text-right sm:text-right text-left">
          {DISCLAIMER_RECOGNITION}
        </span>
      </div>
    </div>
  );
};

export default BasicDashboard;
