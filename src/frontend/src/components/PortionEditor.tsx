import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Search, Trash2, Check, ArrowLeft } from 'lucide-react';
import type { Food, MealType, NutritionAPI, Portion } from './types';
import { errorText } from './api';
import { ApiError } from '../utils/apiError';
import { Field, Notice } from './UI';
import { FoodSwapModal } from './FoodSwapModal';

export function PortionEditor({ api, initial, meal, image, demo, onBack, onSaved, onBusyChange, draftNote, onDraftNoteChange }: {
  api: NutritionAPI; initial: Portion[]; meal: MealType; image: string; demo: boolean;
  draftNote?: string; onDraftNoteChange?: (note: string) => void;
  onBack: () => void; onSaved: (calories: number) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [replace, setReplace] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState('');
  const notes = draftNote ?? localNotes;
  const setNotes = onDraftNoteChange ?? setLocalNotes;
  const [swap, setSwap] = useState<Portion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const locked = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const searchId = useId();

  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { if (confirmBack) keepRef.current?.focus(); }, [confirmBack]);
  useEffect(() => {
    let active = true;
    setFoods([]); setSearched(false); setSearching(false);
    if (!query.trim()) return;
    setSearching(true);
    const timer = setTimeout(() => {
      api.search(query.trim()).then(result => {
        if (active) { setFoods(result); setSearched(true); }
      }).catch(err => { if (active) setError(errorText(err)); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [api, query]);

  const totals = items.reduce((sum, item) => sum.map((value, index) => value + (Number(item.grams) || 0) * item.per100[index] / 100), [0, 0, 0, 0]);
  const valid = items.length > 0 && items.every(item => item.food_id !== null && Number.isFinite(Number(item.grams)) && Number(item.grams) >= 1 && Number(item.grams) <= 3000 && item.per100.every(Number.isFinite));
  const select = (food: Food) => {
    const portion: Portion = {
      key: replace || crypto.randomUUID(), food_id: food.id, food_name: food.food_name,
      grams: replace ? items.find(item => item.key === replace)!.grams : '100',
      per100: [food.calories_per_100g, food.protein_per_100g, food.carbs_per_100g, food.fat_per_100g],
    };
    setItems(previous => replace ? previous.map(item => item.key === replace ? portion : item) : [...previous, portion]);
    setReplace(null); setQuery(''); setFoods([]); setError('');
    searchRef.current?.focus();
  };
  const save = async () => {
    if (!valid || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await api.saveMeal(meal, items, notes);
      if (!result.success || !Number.isFinite(result.total_calories)) throw new ApiError('Máy chủ chưa xác nhận lưu. Hãy kiểm tra nhật ký trước khi thử lại.');
      onSaved(result.total_calories);
    } catch (err) { setError(errorText(err)); }
    finally { locked.current = false; setBusy(false); }
  };

  return <div className="meal-layout">
    {swap && <FoodSwapModal foodName={swap.food_name} onClose={() => setSwap(null)} onConfirm={food => { setItems(previous => previous.map(item => item.key === swap.key ? { ...item, food_id: null, food_name: food.name, grams: String(food.grams), per100: [food.calories, food.protein, food.carbs, food.fat].map(n => n * 100 / food.grams) as Portion["per100"] } : item)); setSwap(null); }} />}
    <section className="card editor-card">
      <div className="section-top"><div><span className="status-pill">BẢN NHÁP · CHƯA LƯU</span><h2>Kiểm tra khẩu phần</h2></div>
        <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmBack(true)}><ArrowLeft size={16} aria-hidden="true" />Chọn lại</button></div>
      {confirmBack && <div role="alert" className="discard-notice"><div><p>Quay lại sẽ bỏ các món và ghi chú đang chỉnh sửa.</p><div className="capture-actions">
        <button ref={keepRef} type="button" className="secondary" onClick={() => setConfirmBack(false)}>Tiếp tục chỉnh sửa</button>
        <button type="button" className="secondary" onClick={onBack}>Bỏ bản nháp và quay lại</button>
      </div></div></div>}
      <p className="section-description">Kiểm tra món và số gam. Bữa ăn chỉ được lưu khi bạn xác nhận.</p>
      {image && <img className="meal-thumbnail" src={image} alt="Ảnh bữa ăn đang chỉnh sửa" />}
      <div className="portion-list">{items.map(item => {
        const gramsValid = Number.isFinite(Number(item.grams)) && Number(item.grams) >= 1 && Number(item.grams) <= 3000;
        return <div className="portion-row" key={item.key}>
          <div className="portion-title"><strong>{item.food_name}</strong><button type="button" className="text-button" disabled={busy} onClick={() => { setReplace(item.key); searchRef.current?.focus(); }}>Đổi tên / chọn món khác</button>
            <button type="button" className="text-button" disabled={busy || !gramsValid || item.food_id === null} onClick={() => setSwap(item)}>Mô phỏng đổi món {item.food_name}</button>
            {item.food_id === null && <small className="error">Chọn món tham chiếu để tiếp tục.</small>}</div>
          <Field label={`Khối lượng ${item.food_name} (g)`}><input type="number" min={1} max={3000} step="0.1" required disabled={busy} value={item.grams} aria-invalid={!gramsValid} aria-describedby={!gramsValid ? `grams-${item.key}` : undefined} onChange={event => setItems(previous => previous.map(p => p.key === item.key ? { ...p, grams: event.target.value } : p))} /></Field>
          <button type="button" className="icon-button" disabled={busy} aria-label={`Xóa ${item.food_name}`} onClick={() => { setItems(previous => previous.filter(p => p.key !== item.key)); if (replace === item.key) setReplace(null); }}><Trash2 size={18} aria-hidden="true" /></button>
          {!gramsValid && <p id={`grams-${item.key}`} className="error">Nhập khối lượng từ 1 đến 3.000 g.</p>}
        </div>;
      })}</div>
      {!items.length && <p className="empty-state">Chưa có món nào. Tìm món bên dưới để thêm vào bữa ăn.</p>}
      <div className="food-search"><label htmlFor={searchId}>{replace ? 'Chọn món thay thế' : 'Thêm món từ danh sách tham chiếu'}</label>
        <div className="search-input"><Search size={18} aria-hidden="true" /><input id={searchId} ref={searchRef} disabled={busy} value={query} placeholder="Tìm phở, cơm, rau…" onChange={event => { setError(''); setQuery(event.target.value); }} /></div>
        {replace && <button type="button" className="text-button" disabled={busy} onClick={() => setReplace(null)}>Hủy thay thế</button>}
        <div aria-live="polite">{query.trim() && searching && <p className="subtle">Đang tìm món…</p>}{query.trim() && searched && !foods.length && <p className="subtle">Chưa tìm thấy món. Thử một tên khác.</p>}</div>
        {foods.length > 0 && <ul className="search-results">{foods.map(food => <li key={food.id}><button type="button" disabled={busy} onClick={() => select(food)}><span>{food.food_name}<small>{food.calories_per_100g} kcal / 100 g · ước tính</small></span><Plus size={18} aria-hidden="true" /></button></li>)}</ul>}
      </div>
      <Field label="Ghi chú thêm (tùy chọn)" hint="Ghi chú được gửi cùng bữa ăn nhưng hiện chưa được lưu lại trong nhật ký."><textarea value={notes} disabled={busy} maxLength={1000} rows={2} onChange={event => setNotes(event.target.value)} placeholder="Có điều gì cần ghi nhớ về bữa ăn?" /></Field>
    </section>
    <aside className="card meal-summary" aria-busy={busy}><span className="eyebrow">TỔNG BỮA ĂN</span><h2>Ước tính dinh dưỡng</h2>
      <div className="calorie-total">{Math.round(totals[0]).toLocaleString('vi-VN')} <span>kcal</span></div>
      <div className="macro-bars">{['Đạm', 'Tinh bột', 'Chất béo'].map((name, index) => <div key={name}><span>{name}</span><strong>{totals[index + 1].toFixed(1)} g</strong></div>)}</div>
      <Notice /><p className="subtle">{demo ? 'Dữ liệu minh họa, không ghi vào tài khoản.' : 'Dinh dưỡng được kiểm tra và tính lại khi bạn xác nhận.'}</p>
      {!valid && <p className="subtle">Thêm ít nhất một món tham chiếu và nhập từ 1 đến 3.000 g cho mỗi món.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary" disabled={!valid || busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : demo ? 'Xác nhận lưu thử' : 'Xác nhận lưu bữa ăn'}{!busy && <Check size={18} aria-hidden="true" />}</button>
      <small>Chỉ lưu sau khi bạn xác nhận.</small>
    </aside>
  </div>;
}
