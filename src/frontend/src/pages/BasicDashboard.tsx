/**
 * src/frontend/src/pages/BasicDashboard.tsx
 * Daily Nutrition Progress Dashboard.
 * Tuân thủ ADR-W3-02 (Zero FE math - mọi số liệu từ Backend),
 * ADR-W3-07 & PSC-13 (Tuyệt đối không dùng số liệu giả định; lỗi hiển thị thật + Thử lại),
 * và PSC-10..PSC-14.
 */

import styles from '../components/dashboard/DashboardSurface.module.css';
import React, { useEffect, useRef, useState } from 'react';
import { Camera, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { DISCLAIMER_RECOGNITION, getMealTypeLabel } from '../constants/copy';
import type { DailyDashboardMeal } from '../types/api';
import { isApiError } from '../utils/apiError';
import { formatVNDate, toLocalISODate } from '../utils/date';
import { MealDeleteDialog } from '../components/dashboard/MealDeleteDialog';

export const BasicDashboard: React.FC = () => {
  const { user, hasGoal } = useAuth();
  const [mealToDelete, setMealToDelete] = useState<DailyDashboardMeal | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState('');
  const deletionInFlight = useRef(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (deleteNotice) noticeRef.current?.focus({ preventScroll: true });
  }, [deleteNotice]);

  const {
    data,
    status,
    error,
    selectedDate,
    setSelectedDate,
    refetch,
  } = useDailyDashboard();

  const dateLabel = selectedDate === toLocalISODate() ? 'Hôm nay' : `Ngày ${formatVNDate(selectedDate)}`;
  const dateControls = <div className="mx-auto w-full max-w-4xl pb-2"><DateNavigator currentDate={selectedDate} onDateChange={setSelectedDate} /></div>;

  const requestDeleteMeal = (mealId: number) => {
    if (deletionInFlight.current) return;
    const meal = (data?.meals_summary || data?.meals || []).find(item => item.id === mealId);
    if (!meal) return;
    setDeleteError(null);
    setDeleteNotice('');
    setMealToDelete(meal);
  };

  const handleDeleteMeal = async () => {
    if (!mealToDelete || deletionInFlight.current) return;
    deletionInFlight.current = true;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await mealApi.deleteMeal(mealToDelete.id);
      if (result.success === false) throw new Error('Meal deletion was rejected');
    } catch (err) {
      const message = isApiError(err) && err.status === 403
        ? 'Bạn không có quyền xóa bữa ăn này.'
        : isApiError(err) && err.status === 404
          ? 'Không tìm thấy bữa ăn. Hãy đóng hộp thoại và tải lại nhật ký.'
          : 'Chưa thể xác nhận đã xóa bữa ăn. Kiểm tra kết nối và thử lại, hoặc đóng hộp thoại để kiểm tra nhật ký.';
      setDeleteError(message);
      setDeletePending(false);
      deletionInFlight.current = false;
      return;
    }
    setDeleteNotice(`Đã xóa ${getMealTypeLabel(mealToDelete.meal_type).toLocaleLowerCase('vi-VN')} khỏi nhật ký.`);
    setMealToDelete(null);
    // Nutrition stays server-owned; refresh without reinterpreting a refresh failure as a failed delete.
    emitMealLogged({ deletedMealId: mealToDelete.id, date: selectedDate });
    try {
      await refetch();
    } finally {
      setDeletePending(false);
      deletionInFlight.current = false;
    }
  };

  const deletionFeedback = (
    <div role={deleteNotice ? 'status' : undefined} aria-live="polite" aria-atomic="true">
      {deleteNotice && <div className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-nutri-border bg-nutri-selected p-3 text-nutri-dark shadow-lg lg:bottom-6">
        <p ref={noticeRef} tabIndex={-1} className="min-w-0 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-nutri-focus">{deleteNotice}</p>
        <button type="button" aria-label="Đóng thông báo" onClick={() => { setDeleteNotice(''); headingRef.current?.focus({ preventScroll: true }); }}
          className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-lg hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>}
    </div>
  );

  // 1. Trạng thái Đang tải (Loading Skeleton - PSC-11)
  if (status === 'loading') {
    return (
      <>{deletionFeedback}{dateControls}<div className="w-full max-w-5xl mx-auto px-4 py-8">
        <DashboardSkeleton />
      </div></>
    );
  }

  // 2. Trạng thái Lỗi kết nối (Error State - PSC-13: 0 số liệu giả)
  if (status === 'error' || !data) {
    return (
      <>{deletionFeedback}{dateControls}<div role="alert" className="w-full max-w-lg mx-auto px-4 py-8 sm:py-16 text-center flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
          <AlertTriangle className="w-7 h-7" aria-hidden="true" />
        </div>
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-slate-900 focus:outline-none">{selectedDate === toLocalISODate() ? 'Không tải được dữ liệu hôm nay' : `Không tải được dữ liệu ngày ${formatVNDate(selectedDate)}`}</h2>
          <p className="text-sm leading-6 text-nutri-muted mt-1">
            {error || 'Máy chủ dinh dưỡng chưa phản hồi. Vui lòng kiểm tra kết nối mạng và thử lại.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex min-h-12 min-w-12 items-center gap-2 px-5 py-2.5 bg-[#9ADA26] hover:bg-[#E0F1B8] text-[#171717] text-xs font-bold rounded-xl shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          <span>Thử lại</span>
        </button>
      </div></>
    );
  }

  const meals = data.meals_summary || data.meals || [];
  const hasMeals = meals.length > 0;

  return (
    <>{deletionFeedback}{dateControls}<div className={`${styles.dashboard} w-full max-w-4xl mx-auto px-0 pt-2 pb-4 flex flex-col gap-4 sm:gap-5`}>
      {/* Header chào mừng & Bộ điều hướng ngày */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="break-words text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 focus:outline-none">
            Chào {user?.username || 'bạn'}
          </h1>
          <p className="text-sm leading-6 text-nutri-muted mt-1">
            Theo dõi các bữa ăn và dinh dưỡng của bạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">

          <Link
            to="/capture"
            className="inline-flex min-h-12 min-w-12 items-center gap-2 px-4 py-2.5 bg-[#9ADA26] hover:bg-[#E0F1B8] text-[#171717] text-xs font-bold rounded-2xl shadow-sm shadow-emerald-600/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>Chụp bữa ăn</span>
          </Link>

        </div>
      </div>

      {/* Thông báo nếu chưa tạo mục tiêu cá nhân */}
      {!hasGoal && <NoGoalNotice target={data.target_calories} />}

      {/* Khối chính 2 cột: Vòng Calo & 3 Thanh Macro */}
      <div className="dashboard-summary grid grid-cols-1 gap-4 items-stretch">
        <CalorieRing
          personalized={hasGoal}
          dateLabel={dateLabel}
          consumed={data.consumed_calories}
          target={data.target_calories}
          remaining={data.remaining_calories}
          progressPercent={data.calories_progress_percent}
        />

        <MacroBar macros={data.macros} personalized={hasGoal} />
      </div>

      {/* Danh sách các bữa ăn trong ngày */}
      <div>
        {hasMeals ? (
          <MealTimeline meals={meals} onDeleteMeal={requestDeleteMeal} />
        ) : (
          <DashboardEmpty selectedDate={selectedDate} />
        )}
      </div>

      {/* Footer Disclaimer minh bạch y khoa (Guardrail M3, M4) */}
      <div className="pt-3 border-t border-slate-200/80 flex flex-col gap-2 text-sm leading-6 text-nutri-muted">
        <DisclaimerBadge className="!bg-transparent !border-0 !px-0 !text-sm !leading-6 !text-nutri-muted" />
        <span className="max-w-prose">
          {DISCLAIMER_RECOGNITION}
        </span>
      </div>
    </div>
    {mealToDelete && <MealDeleteDialog meal={mealToDelete} selectedDate={selectedDate} pending={deletePending} error={deleteError}
      onCancel={() => { if (!deletionInFlight.current) setMealToDelete(null); }} onConfirm={() => void handleDeleteMeal()} />}
    </>
  );
};

export default BasicDashboard;
