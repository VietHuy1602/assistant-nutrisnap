/**
 * src/frontend/src/pages/MealPlanPage.tsx
 * Thực đơn gợi ý (Generate Meal Plan): đề xuất bữa ăn Việt theo mục tiêu, thói quen và món người dùng không thích.
 * Người dùng xem từng bữa, bấm "Không thích" để đổi món, rồi xác nhận "Đồng ý" để lưu thực đơn.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, ChefHat, ChevronDown, Clock, RefreshCw, Sparkles, ThumbsDown, X } from 'lucide-react';
import { Mascot } from '../components/common/Mascot';
import { mealPlanApi, REPLACE_REASONS, type MealPlan, type MealType, type PlanItem, type Recipe, type ReplaceReason } from '../api/mealPlanApi';

const DAY_OPTIONS = [
  { days: 1, label: 'Hôm nay' },
  { days: 3, label: '3 ngày' },
  { days: 7, label: '7 ngày' },
];
const MEAL_ICON: Record<MealType, string> = { breakfast: '🌅', lunch: '☀️', snack: '🍎', dinner: '🌙' };
const ROLE_LABEL: Record<PlanItem['role'], string> = {
  main: 'Món chính', rice: 'Cơm', protein: 'Món mặn', veg: 'Rau', soup: 'Canh', snack: 'Ăn nhẹ', side: 'Món kèm',
};
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');
function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAY[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function errorText(err: unknown) {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : 'Không tạo được thực đơn. Vui lòng thử lại.';
}

export default function MealPlanPage() {
  const [days, setDays] = useState(1);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swapped, setSwapped] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ mealType: MealType; item: PlanItem } | null>(null);
  const [reason, setReason] = useState<ReplaceReason>('taste');
  const [note, setNote] = useState('');
  const [openRecipe, setOpenRecipe] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<Record<number, Recipe | 'loading' | 'error'>>({});

  const toggleRecipe = async (foodId: number) => {
    if (openRecipe === foodId) {
      setOpenRecipe(null);
      return;
    }
    setOpenRecipe(foodId);
    const cur = recipes[foodId];
    if (cur && cur !== 'error') return;
    setRecipes((r) => ({ ...r, [foodId]: 'loading' }));
    try {
      const data = await mealPlanApi.recipe(foodId);
      setRecipes((r) => ({ ...r, [foodId]: data }));
    } catch {
      setRecipes((r) => ({ ...r, [foodId]: 'error' }));
    }
  };

  useEffect(() => {
    let alive = true;
    mealPlanApi
      .current()
      .then((saved) => {
        if (alive && saved) {
          setPlan(saved);
          setAccepted(true);
          setDays(saved.plan.length);
        }
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const generate = async (n = days) => {
    setLoading(true);
    setError(null);
    setSwapped(null);
    try {
      const p = await mealPlanApi.generate(n);
      setPlan(p);
      setAccepted(false);
      setDayIndex(0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const todayIso = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  // Ngày đã qua hoặc hôm nay (khi thực đơn đã lưu) được giữ nguyên, chỉ tạo lại các ngày tới
  const upcoming = plan && accepted ? plan.plan.map((d, i) => (d.date > todayIso ? i : -1)).filter((i) => i >= 0) : [];
  const keepPast = !!plan && accepted && plan.plan.length > 1 && upcoming.length > 0 && upcoming.length < plan.plan.length;

  const regenerate = async (indexes: number[], label: string) => {
    if (!plan) return;
    setBusyKey('regen');
    setError(null);
    try {
      const next = await mealPlanApi.regenerateDays(plan, indexes);
      setPlan(next);
      setAccepted(false);
      setOpenRecipe(null);
      setSwapped(`Đã tạo lại ${label}, các ngày khác giữ nguyên. Bấm “Đồng ý tất cả” để lưu.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyKey(null);
    }
  };

  const askReason = (mealType: MealType, item: PlanItem) => {
    setAsking({ mealType, item });
    setReason('taste');
    setNote('');
  };

  const dislike = async () => {
    if (!plan || !asking) return;
    const { mealType, item } = asking;
    const key = `${dayIndex}-${mealType}-${item.food_id}`;
    setAsking(null);
    setBusyKey(key);
    setError(null);
    try {
      const next = await mealPlanApi.replace(plan, dayIndex, mealType, item.food_id, reason, reason === 'other' ? note.trim() || undefined : undefined);
      setSwapped(next.replace_message ?? null);
      setPlan(next);
      setAccepted(false);
      setOpenRecipe(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyKey(null);
    }
  };

  const accept = async () => {
    if (!plan) return;
    setBusyKey('accept');
    try {
      await mealPlanApi.accept(plan);
      setAccepted(true);
      setSwapped(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyKey(null);
    }
  };

  const day = plan?.plan[dayIndex];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-28">
      <header className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-50 via-lime-50 to-amber-50 p-4 ring-1 ring-emerald-100">
        <Mascot pose={accepted ? 'celebrate' : 'eating'} size={76} />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Thực đơn gợi ý</p>
          <h1 className="text-xl font-bold text-slate-900">Hôm nay ăn gì?</h1>
          <p className="text-sm text-slate-600">Bữa ăn kiểu Việt, hợp mục tiêu và khẩu vị của bạn. Mỗi bữa, mỗi ngày một món khác nhau.</p>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Số ngày" className="flex rounded-full bg-slate-100 p-1">
          {DAY_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              role="radio"
              aria-checked={days === o.days}
              onClick={() => setDays(o.days)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${days === o.days ? 'bg-white text-emerald-700 shadow' : 'text-slate-600'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => (keepPast ? void regenerate(upcoming, 'các ngày tới') : void generate())}
          disabled={loading || busyKey === 'regen'}
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-lime-500 px-5 text-sm font-bold text-white shadow-md shadow-emerald-500/30 disabled:opacity-60"
        >
          {plan ? <RefreshCw aria-hidden="true" className="h-4 w-4" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
          {keepPast ? 'Tạo lại các ngày tới' : plan ? 'Tạo thực đơn mới' : 'Tạo thực đơn'}
        </button>
      </section>

      {error && <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

      {loading && <p className="py-10 text-center text-sm text-slate-500">Đang lên thực đơn…</p>}

      {!loading && !plan && (
        <div className="rounded-3xl border border-dashed border-emerald-200 bg-white p-6 text-center">
          <p className="font-semibold text-slate-800">Chưa có thực đơn</p>
          <p className="mt-1 text-sm text-slate-500">Chọn số ngày rồi bấm “Tạo thực đơn”. NutriSnap dựa vào mục tiêu calo, món bạn hay ăn và món bạn không thích.</p>
        </div>
      )}

      {!loading && plan && day && (
        <>
          {plan.plan.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Chọn ngày">
              {plan.plan.map((d, i) => (
                <button
                  key={d.date}
                  type="button"
                  role="tab"
                  aria-selected={i === dayIndex}
                  onClick={() => setDayIndex(i)}
                  className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${i === dayIndex ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                >
                  {dayLabel(d.date)}
                </button>
              ))}
            </div>
          )}

          {plan.plan.length > 1 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void regenerate([dayIndex], dayLabel(day.date))}
                disabled={busyKey === 'regen'}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 disabled:opacity-60"
              >
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${busyKey === 'regen' ? 'animate-spin' : ''}`} />
                Đổi cả ngày này
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-3xl bg-slate-900 p-4 text-white">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Năng lượng</p>
              <p className="text-lg font-bold">{fmt(day.totals.calories)}<span className="text-xs font-medium text-slate-400"> / {fmt(plan.target_calories)} kcal</span></p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Đạm</p>
              <p className="text-lg font-bold">{fmt(day.totals.protein_g)}<span className="text-xs font-medium text-slate-400"> / {fmt(plan.target_protein_g)} g</span></p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Chi phí ước tính</p>
              <p className="text-lg font-bold">{fmt(day.totals.price_vnd / 1000)}k<span className="text-xs font-medium text-slate-400"> đ</span></p>
            </div>
          </div>

          <ul className="space-y-3">
            {day.meals.map((meal) => (
              <li key={meal.meal_type} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <span aria-hidden="true">{MEAL_ICON[meal.meal_type]}</span>
                    {meal.label}
                  </h2>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{fmt(meal.totals.calories)} kcal</span>
                    {day.date === todayIso && (
                      <Link to={`/capture?meal=${meal.meal_type}`} aria-label={`Chụp ${meal.label.toLocaleLowerCase('vi-VN')}`}
                        className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#9ADA26] px-3 text-xs font-bold text-[#171717]">
                        <Camera aria-hidden="true" className="h-3.5 w-3.5" /> Chụp
                      </Link>
                    )}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {meal.items.map((item) => {
                    const key = `${dayIndex}-${meal.meal_type}-${item.food_id}`;
                    return (
                      <li key={key} className="py-2">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-800">{item.food_name}</p>
                            <p className="text-xs text-slate-500">
                              {ROLE_LABEL[item.role]} · {fmt(item.grams)} g · {fmt(item.calories)} kcal · đạm {fmt(item.protein_g)} g
                            </p>
                            <button
                              type="button"
                              onClick={() => void toggleRecipe(item.food_id)}
                              aria-expanded={openRecipe === item.food_id}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                            >
                              <ChefHat aria-hidden="true" className="h-4 w-4" />
                              Nguyên liệu & cách nấu
                              <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${openRecipe === item.food_id ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        {item.role !== 'rice' && (
                          <button
                            type="button"
                            onClick={() => askReason(meal.meal_type, item)}
                            disabled={busyKey !== null}
                            aria-label={`Không thích ${item.food_name}, đổi món khác`}
                            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <ThumbsDown aria-hidden="true" className={`h-4 w-4 ${busyKey === key ? 'animate-pulse' : ''}`} />
                            {busyKey === key ? 'Đang đổi…' : 'Đổi món'}
                          </button>
                        )}
                        </div>
                        {openRecipe === item.food_id && <RecipePanel state={recipes[item.food_id]} onRetry={() => void toggleRecipe(item.food_id)} />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {swapped && <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800">{swapped}</p>}

          {accepted ? (
            <div className="flex items-center gap-3 rounded-3xl bg-emerald-600 p-4 text-white">
              <Check aria-hidden="true" className="h-6 w-6 shrink-0" />
              <p className="text-sm font-semibold">Đã lưu thực đơn {plan.plan.length > 1 ? `${plan.plan.length} ngày` : 'hôm nay'}. Chúc bạn ăn ngon!</p>
            </div>
          ) : (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-slate-900">Bạn thấy thực đơn này ổn chưa?</p>
              <p className="mt-1 text-sm text-slate-600">Nếu chưa ưng món nào, bấm “Đổi món” ở món đó – NutriSnap sẽ đề xuất món khác và ghi nhớ để lần sau không gợi ý lại.</p>
              <button
                type="button"
                onClick={() => void accept()}
                disabled={busyKey !== null}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Check aria-hidden="true" className="h-4 w-4" />
                {busyKey === 'accept' ? 'Đang lưu…' : 'Đồng ý tất cả'}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-slate-400">{plan.disclaimer}</p>
        </>
      )}
      {asking && (
        <div role="dialog" aria-modal="true" aria-label="Vì sao bạn muốn đổi món" className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Đổi món</p>
                <h2 className="text-lg font-bold text-slate-900">Vì sao bạn không chọn “{asking.item.food_name}”?</h2>
                <p className="text-sm text-slate-500">NutriSnap sẽ đề xuất món mới dựa trên phản hồi của bạn.</p>
              </div>
              <button type="button" aria-label="Đóng" onClick={() => setAsking(null)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div role="radiogroup" aria-label="Lý do" className="mt-4 grid grid-cols-1 gap-2">
              {REPLACE_REASONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={reason === opt.key}
                  onClick={() => setReason(opt.key)}
                  className={`flex min-h-11 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-semibold ${reason === opt.key ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700'}`}
                >
                  <span aria-hidden="true" className="text-lg">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {reason === 'other' && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Bạn có thể ghi rõ hơn (ví dụ: không ăn được cay)"
                className="nutri-input mt-3 w-full"
                rows={2}
              />
            )}
            <button type="button" onClick={() => void dislike()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Đề xuất món khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecipePanel({ state, onRetry }: { state?: Recipe | 'loading' | 'error'; onRetry: () => void }) {
  if (!state || state === 'loading') {
    return <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Đang soạn công thức…</p>;
  }
  if (state === 'error') {
    return (
      <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Chưa tải được công thức.{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline">Thử lại</button>
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-3 rounded-2xl bg-emerald-50/60 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-3 text-xs font-semibold text-emerald-800">
        <span className="inline-flex items-center gap-1"><Clock aria-hidden="true" className="h-3.5 w-3.5" />{state.time_minutes} phút</span>
        <span>Độ khó: {state.difficulty}</span>
        <span>{state.servings} người ăn</span>
      </p>
      <div>
        <p className="mb-1 font-bold text-slate-800">Nguyên liệu</p>
        <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {state.ingredients.map((ing, i) => (
            <li key={i} className="flex justify-between gap-2 text-slate-700"><span>{ing.name}</span><span className="text-slate-500">{ing.amount}</span></li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 font-bold text-slate-800">Cách nấu</p>
        <ol className="list-decimal space-y-1 pl-5 text-slate-700">
          {state.steps.map((st, i) => <li key={i}>{st}</li>)}
        </ol>
      </div>
      {state.tip && <p className="text-xs text-emerald-800">💡 {state.tip}</p>}
    </div>
  );
}
