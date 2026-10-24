/**
 * src/frontend/src/components/FoodSwapModal.tsx
 * Food Swap Simulator Modal with real backend connection (swapApi) and 2 contexts:
 * - 'draft': Opened in meal capture flow; allows applying swap candidate into draft.
 * - 'logged': Opened in dashboard timeline; read-only simulation without modifying DB.
 * ZERO-MATH (ADR-W5-01): Displays deltas directly from backend; never subtracts on client.
 * ADR-W5-04, ASC-11 through ASC-15 of NS-FE-W5-001.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { swapApi, type SwapGoal } from '../api/swapApi';
import type { NormalizedSwapResponse } from '../api/swapContract';
import { demoSwapProvider, type SwapFood, type SwapPreview, type SwapProvider } from './foodSwapDemo';

const control =
  'min-h-11 rounded-xl border border-nutri-border px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus disabled:opacity-50 transition-colors';

const validFood = (food: SwapFood) =>
  food &&
  typeof food.key === 'string' &&
  typeof food.name === 'string' &&
  food.name.trim() &&
  [food.grams, food.calories, food.protein, food.carbs, food.fat, food.price].every(
    (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0,
  ) &&
  food.grams > 0;

const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('vi-VN')}`;

const formatSignedDelta = (n?: number | null, unit = '') => {
  if (n == null) return `— ${unit}`.trim();
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('vi-VN')} ${unit}`.trim();
};

export interface FoodSwapModalProps {
  foodId?: number | null;
  foodName: string;
  portionGram?: number;
  context?: 'draft' | 'logged';
  onClose: () => void;
  onConfirm?: (food: any) => void;
  provider?: SwapProvider;
}

export function FoodSwapModal({
  foodId,
  foodName,
  portionGram = 250.0,
  context = 'draft',
  onClose,
  onConfirm,
  provider,
}: FoodSwapModalProps) {
  const [goal, setGoal] = useState<SwapGoal>('reduce_calories');
  const [data, setData] = useState<NormalizedSwapResponse | SwapPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);

  // Focus trap and accessibility
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const siblings = Array.from(document.body.children).filter(
      (e) => e !== dialog.current?.parentElement && !e.hasAttribute('inert'),
    );
    siblings.forEach((e) => e.setAttribute('inert', ''));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();

    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark('ns:swap:open');
    }

    return () => {
      siblings.forEach((e) => e.removeAttribute('inert'));
      document.body.style.overflow = overflow;
      if (opener?.isConnected) {
        if (opener.matches(':disabled')) {
          opener.closest('.portion-row')?.querySelector<HTMLInputElement>('input')?.focus();
        } else {
          opener.focus();
        }
      }
    };
  }, []);

  // Fetch swap candidates from real API or injected/demo provider
  useEffect(() => {
    let active = true;
    setState('loading');
    setData(null);
    setSelected(null);

    const isDemo = Boolean(provider || foodId == null);

    if (isDemo) {
      const activeProvider = provider || demoSwapProvider;
      Promise.resolve()
        .then(() => activeProvider(goal))
        .then((result) => {
          if (
            !result ||
            !validFood(result.current) ||
            !Array.isArray(result.alternatives) ||
            !result.alternatives.every(validFood) ||
            new Set(result.alternatives.map((f) => f.key)).size !== result.alternatives.length
          ) {
            throw new Error('Invalid preview');
          }
          if (active) {
            setData(result);
            setState('ready');
          }
        })
        .catch(() => {
          if (active) setState('error');
        });
    } else {
      swapApi
        .getSwapAlternatives({
          currentFoodId: foodId ?? undefined,
          currentFoodName: foodName,
          portionGram,
          swapGoal: goal,
        })
        .then((result) => {
          if (!active) return;
          if (!result || !Array.isArray(result.alternatives)) {
            throw new Error('Invalid preview');
          }
          setData(result);
          setState('ready');
        })
        .catch(() => {
          if (active) setState('error');
        });
    }

    return () => {
      active = false;
    };
  }, [goal, provider, foodId, foodName, portionGram, retry]);

  function keyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    if (e.key !== 'Tab') return;
    const controls = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input') || [],
    );
    if (e.shiftKey && document.activeElement === controls[0]) {
      e.preventDefault();
      controls[controls.length - 1]?.focus();
    } else if (!e.shiftKey && document.activeElement === controls[controls.length - 1]) {
      e.preventDefault();
      controls[0]?.focus();
    }
  }

  const isDemo = Boolean(data && 'current' in data);
  const demoData = isDemo ? (data as SwapPreview) : null;
  const liveData = !isDemo && data ? (data as NormalizedSwapResponse) : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-xs">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-title"
        onKeyDown={keyDown}
        className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-nutri-border bg-nutri-panel p-5 text-nutri-ink shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="swap-title" className="text-xl font-semibold">
            Mô phỏng đổi món
          </h2>
          <button
            ref={close}
            type="button"
            className={control}
            onClick={onClose}
            aria-label="Đóng đổi món"
          >
            Đóng
          </button>
        </div>

        {/* Informational copy */}
        {context === 'logged' ? (
          <p className="text-sm leading-6 text-nutri-muted bg-amber-50/70 border border-amber-200/60 rounded-xl p-3 text-amber-900">
            <strong>Lưu ý:</strong> Đây là mô phỏng đổi món nhằm mục đích tham khảo; nhật ký bữa ăn của bạn không thay đổi.
          </p>
        ) : isDemo ? (
          <p className="text-sm leading-6 text-nutri-muted">
            Dữ liệu demo, không phải thông tin dinh dưỡng hoặc giá thực tế của {foodName}. Giá minh họa bằng VNĐ cho khẩu phần demo. Không gọi API, không lưu bữa ăn.
          </p>
        ) : (
          <p className="text-sm leading-6 text-nutri-muted">
            Mô phỏng các món ăn thay thế cho <strong>{foodName}</strong> theo dữ liệu dinh dưỡng tham chiếu. Áp dụng sẽ cập nhật vào bản nháp bữa ăn.
          </p>
        )}

        <label className="block space-y-2">
          <span className="font-medium text-sm">Mục tiêu đổi món</span>
          <select
            className={`${control} block w-full bg-nutri-panel`}
            value={goal}
            onChange={(e) => setGoal(e.target.value as SwapGoal)}
          >
            <option value="reduce_calories">Giảm năng lượng</option>
            <option value="high_protein">Tăng đạm</option>
            <option value="balanced_saver">Cân bằng chi phí</option>
          </select>
        </label>
        <p className="text-sm text-nutri-muted">
          Gợi ý mang tính linh hoạt, không giới hạn nghiêm ngặt cùng nhóm món.
        </p>

        {state === 'loading' && <p role="status">Đang tải mô phỏng…</p>}

        {state === 'error' && (
          <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-4 border border-amber-200 text-amber-900 text-sm">
            <p>Chưa đọc được dữ liệu mô phỏng hợp lệ.</p>
            <button
              type="button"
              className={`${control} bg-white text-slate-800 font-semibold`}
              onClick={() => setRetry((n) => n + 1)}
            >
              Thử lại
            </button>
          </div>
        )}

        {state === 'ready' && isDemo && demoData && (
          <>
            <p className="rounded-xl bg-nutri-surface p-3 text-sm">
              Hiện tại (demo): {demoData.current.name} · {demoData.current.grams} g · {demoData.current.calories} kcal · {demoData.current.protein} g đạm · {demoData.current.price.toLocaleString('vi-VN')} VNĐ
            </p>
            {!demoData.alternatives.length && <p role="status">Chưa có lựa chọn thay thế.</p>}
            <fieldset className="space-y-3">
              <legend className="font-semibold text-sm mb-1">Lựa chọn minh họa</legend>
              {demoData.alternatives.map((food) => (
                <label
                  key={food.key}
                  className="flex min-h-11 cursor-pointer gap-3 rounded-xl border border-nutri-border bg-nutri-selected/50 p-3 focus-within:ring-2 focus-within:ring-nutri-focus"
                >
                  <input
                    type="radio"
                    name="swap-choice"
                    checked={selected === food.key}
                    onChange={() => setSelected(food.key)}
                  />
                  <span className="min-w-0 break-words">
                    <strong>{food.name}</strong>
                    <span className="block text-sm">
                      {food.grams} g · {food.calories} kcal · {food.protein} g đạm · {food.price.toLocaleString('vi-VN')} VNĐ
                    </span>
                    <span className="block text-sm text-slate-600">
                      Chênh lệch demo: {signed(food.calories - demoData.current.calories)} kcal · {signed(food.protein - demoData.current.protein)} g đạm · {signed(food.price - demoData.current.price)} VNĐ
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-nutri-muted">
              Áp dụng chỉ sửa bản nháp. Món demo cần được thay bằng món tham chiếu thật trước khi lưu.
            </p>
          </>
        )}

        {state === 'ready' && !isDemo && liveData && (
          <>
            {liveData.sourceFood && (
              <p className="rounded-xl bg-nutri-surface p-3 text-sm">
                Hiện tại: {liveData.sourceFood.food_name} · {liveData.sourceFood.portion_gram} g · {liveData.sourceFood.calories} kcal · {liveData.sourceFood.protein_g} g đạm
                {typeof liveData.sourceFood.estimated_price_vnd === 'number' &&
                  ` · ${liveData.sourceFood.estimated_price_vnd.toLocaleString('vi-VN')} VNĐ`}
              </p>
            )}
            {!liveData.alternatives.length ? (
              <p role="status" className="text-sm text-slate-500 italic py-2">
                Chưa có lựa chọn thay thế.
              </p>
            ) : (
              <fieldset className="space-y-3">
                <legend className="font-semibold text-sm mb-1">Lựa chọn thay thế</legend>
                {liveData.alternatives.map((candidate) => {
                  const key = String(candidate.food_id);
                  return (
                    <label
                      key={key}
                      className="flex min-h-11 cursor-pointer gap-3 rounded-xl border border-nutri-border bg-nutri-selected/50 p-3 focus-within:ring-2 focus-within:ring-nutri-focus"
                    >
                      <input
                        type="radio"
                        name="swap-choice"
                        checked={selected === key}
                        onChange={() => setSelected(key)}
                      />
                      <span className="min-w-0 break-words">
                        <strong>{candidate.food_name}</strong>
                        <span className="block text-sm">
                          {candidate.portion_gram} g · {candidate.calories} kcal · {candidate.protein_g} g đạm
                          {typeof candidate.estimated_price_vnd === 'number' &&
                            ` · ${candidate.estimated_price_vnd.toLocaleString('vi-VN')} VNĐ`}
                        </span>
                        <span className="block text-sm text-slate-600">
                          Chênh lệch: {formatSignedDelta(candidate.delta_calories, 'kcal')} · {formatSignedDelta(candidate.delta_protein_g, 'g đạm')}
                          {candidate.delta_price_vnd !== undefined &&
                            ` · ${formatSignedDelta(candidate.delta_price_vnd, 'VNĐ')}`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {context === 'draft' && (
              <p className="text-sm text-nutri-muted">
                Áp dụng chỉ sửa bản nháp. Bữa ăn chỉ được cập nhật khi bạn xác nhận lưu.
              </p>
            )}
          </>
        )}

        {/* Footer Buttons: Prominent Giữ nguyên món + Hủy + Áp dụng */}
        <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            className={`${control} font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300`}
            onClick={onClose}
          >
            Giữ nguyên món
          </button>

          <button type="button" className={control} onClick={onClose}>
            Hủy
          </button>

          {context === 'draft' && onConfirm && (
            <button
              type="button"
              className={`${control} bg-nutri-primary text-white font-bold hover:bg-emerald-800`}
              disabled={state !== 'ready' || !selected}
              onClick={() => {
                if (!data || confirmed.current) return;
                confirmed.current = true;
                if (isDemo && demoData) {
                  const food = demoData.alternatives.find((f) => f.key === selected);
                  if (food) onConfirm(food);
                } else if (liveData) {
                  const candidate = liveData.alternatives.find(
                    (c) => String(c.food_id) === selected,
                  );
                  if (candidate) {
                    const mapped = {
                      ...candidate,
                      id: candidate.food_id,
                      key: String(candidate.food_id),
                      name: candidate.food_name,
                      grams: candidate.portion_gram,
                      protein: candidate.protein_g,
                      carbs: candidate.carbs_g ?? 0,
                      fat: candidate.fat_g ?? 0,
                      price: candidate.estimated_price_vnd ?? 0,
                    };
                    onConfirm(mapped);
                  }
                }
              }}
            >
              Áp dụng vào bản nháp
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
