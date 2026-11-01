/**
 * src/frontend/src/notifications/useMealReminders.ts
 * Đồng bộ thông báo nhắc bữa ăn với dữ liệu hôm nay: khi mở app, khi quay lại app và khi vừa lưu bữa ăn.
 * Bấm thông báo sẽ mở màn hình chụp món.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api/dashboardApi';
import { onMealLogged } from '../utils/mealEvents';
import { isRemindersSupported, onReminderTapped, syncMealReminders } from './mealReminders';

export function useMealReminders(enabled: boolean): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !isRemindersSupported()) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await dashboardApi.getDailyDashboard();
        if (cancelled) return;
        const logged = (data.meals_summary || []).map((meal) => meal.meal_type);
        await syncMealReminders(logged);
      } catch {
        // Mất mạng: giữ lịch nhắc hiện có
      }
    };

    void refresh();
    const offMeal = onMealLogged(() => void refresh());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const offTap = onReminderTapped(() => navigate('/capture'));

    return () => {
      cancelled = true;
      offMeal();
      offTap();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, navigate]);
}
