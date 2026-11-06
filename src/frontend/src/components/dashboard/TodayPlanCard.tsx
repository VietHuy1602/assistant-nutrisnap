/**
 * src/frontend/src/components/dashboard/TodayPlanCard.tsx
 * Thẻ cuối trang Tổng quan, gộp "chưa ghi nhận bữa ăn" và "thực đơn hôm nay":
 * mỗi món trong thực đơn là một dòng checklist, chụp từng món; món đã chụp (đúng bữa) tự được đánh dấu.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, ChevronRight, Sparkles } from 'lucide-react';
import { mealPlanApi, type MealPlan, type PlanItem, type PlanMeal } from '../../api/mealPlanApi';
import type { DailyDashboardMeal } from '../../types/api';
import { Mascot } from '../common/Mascot';
import { formatVNDate, toLocalISODate } from '../../utils/date';

const ICON: Record<string, string> = { breakfast: '🌅', lunch: '☀️', snack: '🍎', dinner: '🌙' };
const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const captureBtn = 'inline-flex items-center justify-center gap-1.5 rounded-full bg-[#9ADA26] font-bold text-[#171717] shadow-sm transition-colors hover:bg-[#E0F1B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

export interface MealCheck {
  meal: PlanMeal;
  dishes: Array<{ item: PlanItem; done: boolean }>;
  extras: string[];
}

/** Đối chiếu từng món của bữa trong thực đơn với các món đã chụp cùng bữa (theo food_id hoặc tên). */
export function checkMeal(planned: PlanMeal, logged: DailyDashboardMeal[]): MealCheck {
  const eaten = logged.filter((m) => m.meal_type === planned.meal_type).flatMap((m) => m.items);
  const used = new Set<number>();
  const dishes = planned.items.map((item) => {
    const idx = eaten.findIndex((it, i) => !used.has(i) && ((it.food_id != null && it.food_id === item.food_id) || norm(it.food_name) === norm(item.food_name)));
    if (idx >= 0) used.add(idx);
    return { item, done: idx >= 0 };
  });
  const extras = eaten.filter((_, i) => !used.has(i)).map((it) => it.food_name);
  return { meal: planned, dishes, extras };
}

interface Props {
  date: string;
  meals: DailyDashboardMeal[];
}

export const TodayPlanCard: React.FC<Props> = ({ date, meals }) => {
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);
  const isToday = date === toLocalISODate();

  useEffect(() => {
    let alive = true;
    mealPlanApi.current().then((p) => alive && setPlan(p)).catch(() => alive && setPlan(null));
    return () => { alive = false; };
  }, []);

  const day = plan?.plan.find((d) => d.date === date);
  const checks = day ? day.meals.map((m) => checkMeal(m, meals)) : [];
  const total = checks.reduce((s, c) => s + c.dishes.length, 0);
  const done = checks.reduce((s, c) => s + c.dishes.filter((d) => d.done).length, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const nothingLogged = meals.length === 0;

  const title = day
    ? done === total ? 'Tuyệt vời! Bạn đã ăn đúng thực đơn hôm nay' : nothingLogged ? (isToday ? 'Chưa ghi nhận bữa ăn nào hôm nay' : `Chưa ghi nhận bữa ăn ngày ${formatVNDate(date)}`) : `Đã chụp ${done}/${total} món theo thực đơn`
    : nothingLogged ? (isToday ? 'Chưa ghi nhận bữa ăn nào hôm nay' : `Chưa ghi nhận bữa ăn ngày ${formatVNDate(date)}`) : 'Bạn chưa có thực đơn cho ngày này';
  const subtitle = day
    ? 'Chụp từng món khi ăn, NutriSnap sẽ đánh dấu vào checklist.'
    : nothingLogged ? 'Bắt đầu bằng một ảnh bữa ăn. Bạn sẽ kiểm tra kết quả trước khi lưu.' : 'Tạo thực đơn để có checklist món ăn mỗi ngày.';

  return (
    <section aria-labelledby="meal-checklist-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex flex-col items-center gap-2 px-4 pt-5 text-center ${day ? 'pb-4' : 'pb-5'}`}>
        <Mascot pose="eating" size={104} />
        <h2 id="meal-checklist-title" className="max-w-sm text-base font-bold text-slate-800">{title}</h2>
        <p className="max-w-sm text-sm leading-6 text-nutri-muted">{subtitle}</p>

        {day ? (
          <div className="mt-1 w-full max-w-sm">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>{done}/{total} món</span>
              <span>Kế hoạch {fmt(day.totals.calories)} kcal</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ theo thực đơn">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Link to="/capture" className={`${captureBtn} min-h-12 px-5 text-sm`}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              <span>{nothingLogged && isToday ? 'Chụp bữa ăn đầu tiên' : 'Ghi bữa ăn mới'}</span>
            </Link>
            {plan !== undefined && (
              <Link to="/meal-plan" className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-emerald-200 px-5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Tạo thực đơn
              </Link>
            )}
          </div>
        )}
      </div>

      {day && (
        <>
          <ol className="space-y-3 px-3 pb-3">
            {checks.map(({ meal, dishes, extras }) => {
              const mealDone = dishes.every((d) => d.done);
              return (
                <li key={meal.meal_type} className={`rounded-2xl border p-3 transition-colors ${mealDone ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/60'}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <span aria-hidden="true">{ICON[meal.meal_type]}</span>{meal.label}
                    </h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${mealDone ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                      {mealDone ? 'Hoàn thành' : `${dishes.filter((d) => d.done).length}/${dishes.length}`}
                    </span>
                  </div>
                  <ul>
                    {dishes.map(({ item, done: ok }) => (
                      <li key={item.food_id} className="flex min-h-12 items-center gap-3 py-1">
                        <span
                          role="checkbox"
                          aria-checked={ok}
                          aria-label={item.food_name}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${ok ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}
                        >
                          {ok && <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-semibold ${ok ? 'text-slate-400 line-through decoration-emerald-400' : 'text-slate-800'}`}>{item.food_name}</span>
                          <span className="block text-xs text-slate-500">{fmt(item.grams)} g · {fmt(item.calories)} kcal</span>
                        </span>
                        {ok ? (
                          <span className="text-xs font-semibold text-emerald-700">Đã chụp</span>
                        ) : (
                          <Link
                            to={`/capture?meal=${meal.meal_type}&dish=${encodeURIComponent(item.food_name)}`}
                            aria-label={`Chụp ${item.food_name}`}
                            className={`${captureBtn} min-h-9 shrink-0 px-3 text-xs`}
                          >
                            <Camera aria-hidden="true" className="h-3.5 w-3.5" /> Chụp
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                  {extras.length > 0 && (
                    <p className="mt-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-800">Món ngoài thực đơn: {extras.join(', ')}</p>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <Link to="/capture" className={`${captureBtn} min-h-10 px-4 text-xs`}>
              <Camera aria-hidden="true" className="h-4 w-4" /> Chụp món khác
            </Link>
            <Link to="/meal-plan" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-700">
              Xem thực đơn <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
};
