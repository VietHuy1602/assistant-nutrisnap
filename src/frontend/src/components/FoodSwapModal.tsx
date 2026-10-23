import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { demoSwapProvider, type SwapFood, type SwapGoal, type SwapPreview, type SwapProvider } from './foodSwapDemo';

const control = 'min-h-11 rounded-xl border border-nutri-border px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus disabled:opacity-50';
const validFood = (food: SwapFood) => food && typeof food.key === 'string' && typeof food.name === 'string' && food.name.trim() && [food.grams, food.calories, food.protein, food.carbs, food.fat, food.price].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) && food.grams > 0;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('vi-VN')}`;
export function FoodSwapModal({ foodName, onClose, onConfirm, provider = demoSwapProvider }: { foodName: string; onClose: () => void; onConfirm: (food: SwapFood) => void; provider?: SwapProvider }) {
  const [goal, setGoal] = useState<SwapGoal>('reduce_calories');
  const [data, setData] = useState<SwapPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const siblings = Array.from(document.body.children).filter(e => e !== dialog.current?.parentElement && !e.hasAttribute('inert'));
    siblings.forEach(e => e.setAttribute('inert', ''));
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; close.current?.focus();
    return () => { siblings.forEach(e => e.removeAttribute('inert')); document.body.style.overflow = overflow; if (opener?.isConnected) { if (opener.matches(':disabled')) opener.closest('.portion-row')?.querySelector<HTMLInputElement>('input')?.focus(); else opener.focus(); } };
  }, []);
  useEffect(() => {
    let active = true; setState('loading'); setData(null); setSelected(null);
    Promise.resolve().then(() => provider(goal)).then(result => {
      if (!result || !validFood(result.current) || !Array.isArray(result.alternatives) || !result.alternatives.every(validFood) || new Set(result.alternatives.map(f => f.key)).size !== result.alternatives.length) throw new Error('Invalid preview');
      if (active) { setData(result); setState('ready'); }
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [goal, provider, retry]);
  function keyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input') || []);
    if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls[controls.length - 1]?.focus(); }
    else if (!e.shiftKey && document.activeElement === controls[controls.length - 1]) { e.preventDefault(); controls[0]?.focus(); }
  }
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="swap-title" onKeyDown={keyDown} className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-nutri-border bg-nutri-panel p-5 text-nutri-ink">
      <div className="flex items-center justify-between gap-3"><h2 id="swap-title" className="text-xl font-semibold">Mô phỏng đổi món</h2><button ref={close} className={control} onClick={onClose} aria-label="Đóng đổi món">Đóng</button></div>
      <p className="text-sm leading-6 text-nutri-muted">Dữ liệu demo, không phải thông tin dinh dưỡng hoặc giá thực tế của {foodName}. Giá minh họa bằng VNĐ cho khẩu phần demo. Không gọi API, không lưu bữa ăn.</p>
      <label className="block space-y-2">Mục tiêu đổi món<select className={`${control} block w-full bg-nutri-panel`} value={goal} onChange={e => setGoal(e.target.value as SwapGoal)}><option value="reduce_calories">Giảm năng lượng</option><option value="high_protein">Tăng đạm</option><option value="balanced_saver">Cân bằng chi phí</option></select></label>
      <p className="text-sm text-nutri-muted">Gợi ý mang tính linh hoạt, không giới hạn nghiêm ngặt cùng nhóm món.</p>
      {state === 'loading' && <p role="status">Đang tải mô phỏng…</p>}
      {state === 'error' && <div role="alert"><p>Chưa đọc được dữ liệu mô phỏng hợp lệ.</p><button className={control} onClick={() => setRetry(n => n + 1)}>Thử lại</button></div>}
      {state === 'ready' && data && <>
        <p className="rounded-xl bg-nutri-surface p-3">Hiện tại (demo): {data.current.name} · {data.current.grams} g · {data.current.calories} kcal · {data.current.protein} g đạm · {data.current.price.toLocaleString('vi-VN')} VNĐ</p>
        {!data.alternatives.length && <p role="status">Chưa có lựa chọn thay thế.</p>}
        <fieldset className="space-y-3"><legend className="font-semibold">Lựa chọn minh họa</legend>{data.alternatives.map(food => <label key={food.key} className="flex min-h-11 cursor-pointer gap-3 rounded-xl border border-nutri-border bg-nutri-selected/50 p-3 focus-within:ring-2 focus-within:ring-nutri-focus"><input type="radio" name="swap-choice" checked={selected === food.key} onChange={() => setSelected(food.key)} /><span className="min-w-0 break-words"><strong>{food.name}</strong><span className="block text-sm">{food.grams} g · {food.calories} kcal · {food.protein} g đạm · {food.price.toLocaleString('vi-VN')} VNĐ</span><span className="block text-sm">Chênh lệch demo: {signed(food.calories - data.current.calories)} kcal · {signed(food.protein - data.current.protein)} g đạm · {signed(food.price - data.current.price)} VNĐ</span></span></label>)}</fieldset>
      </>}
      <p className="text-sm text-nutri-muted">Áp dụng chỉ sửa bản nháp. Món demo cần được thay bằng món tham chiếu thật trước khi lưu.</p>
      <div className="flex flex-wrap justify-end gap-3"><button className={control} onClick={onClose}>Hủy</button><button className={`${control} bg-nutri-primary text-white`} disabled={state !== 'ready' || !selected} onClick={() => { const food = data?.alternatives.find(f => f.key === selected); if (food && !confirmed.current) { confirmed.current = true; onConfirm(food); } }}>Áp dụng vào bản nháp</button></div>
    </div>
  </div>, document.body);
}
