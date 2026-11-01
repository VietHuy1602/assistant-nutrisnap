import { useId } from 'react';
import type { HabitCalendarProps, HabitDay } from '../types/habit';
import { monthGrid, normalizeDays, shiftMonth, validDate, validMonth } from '../utils/habitCalendar';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutri-focus';
const weekdayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
function describe(day?: HabitDay): string {
  if (!day) return 'Chưa có dữ liệu';
  switch (day.state) {
    case 'completed': return 'Đã xác nhận hoàn thành';
    case 'unconfirmed': return 'Chưa có xác nhận hoàn thành';
    case 'loading': return 'Đang tải';
    case 'error': return 'Lỗi dữ liệu ngày';
    case 'unavailable': return { 'no-records': 'Chưa có nhật ký', 'insufficient-data': 'Chưa đủ dữ liệu', 'not-provided': 'Chưa có dữ liệu' }[day.reason] || 'Chưa có dữ liệu';
    default: return 'Chưa có dữ liệu';
  }
}
// Ngày hoàn thành: vòng màu tươi đổi theo tuần trong tháng (xanh lá → mòng két → chanh → hổ phách)
const COMPLETED_COLORS = [
  'border-emerald-400 bg-emerald-50 text-emerald-800',
  'border-teal-400 bg-teal-50 text-teal-800',
  'border-lime-500 bg-lime-50 text-lime-800',
  'border-amber-400 bg-amber-50 text-amber-800',
  'border-sky-400 bg-sky-50 text-sky-800',
];
const dayColor = (date: string) => COMPLETED_COLORS[Math.floor((Number(date.slice(8)) - 1) / 7) % COMPLETED_COLORS.length];

export function HabitCalendar({ month, today, days, loadState, source, selectedDate, onMonthChange, onDateSelect, onRetry, errorMessage }: HabitCalendarProps) {
  const title = useId();
  if (!validMonth(month) || !validDate(today)) return <section className="rounded-2xl border border-nutri-border bg-nutri-panel p-4"><p role="alert">Không thể hiển thị lịch: tháng hoặc ngày hiện tại không hợp lệ.</p></section>;
  const normalized = normalizeDays(month, days);
  const previous = shiftMonth(month, -1); const next = shiftMonth(month, 1);
  const selected = validDate(selectedDate || '') && selectedDate! <= today && monthGrid(month).flat().includes(selectedDate!) ? selectedDate : undefined;
  const status = (date: string) => date > today ? 'Ngày tương lai' : loadState === 'loading' ? 'Đang tải' : loadState === 'error' ? 'Không tải được dữ liệu' : describe(normalized.days.get(date));
  const selectedDay = selected ? normalized.days.get(selected) : undefined;
  const dateLabel = (date: string) => date.split('-').reverse().join('/');
  return <section aria-labelledby={title} className="min-w-0 space-y-4 rounded-3xl border border-slate-100 bg-white py-4 text-nutri-ink shadow-lg shadow-slate-900/5">
    <header className="space-y-3 px-3 sm:px-5"><h2 id={title} className="text-xl font-semibold">Lịch thói quen</h2>
      {source === 'demo' && <p className="text-sm font-semibold text-nutri-dark">Dữ liệu minh họa</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" aria-label="Xem tháng trước" disabled={!previous} onClick={() => previous && onMonthChange(previous)} className={`min-h-11 min-w-11 rounded-full border border-slate-200 bg-white px-3 shadow-sm hover:bg-slate-50 disabled:opacity-50 ${focus}`}>←</button>
        <p aria-live="polite" aria-atomic="true" className="font-semibold">Tháng {month.month}/{month.year}</p>
        <button type="button" aria-label="Xem tháng sau" disabled={!next} onClick={() => next && onMonthChange(next)} className={`min-h-11 min-w-11 rounded-full border border-slate-200 bg-white px-3 shadow-sm hover:bg-slate-50 disabled:opacity-50 ${focus}`}>→</button>
      </div>
      <button type="button" onClick={() => onMonthChange({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })} className={`min-h-11 rounded-xl px-3 text-sm text-nutri-dark underline ${focus}`}>Về tháng hiện tại</button>
      {normalized.invalid && <p role="status" className="text-sm text-nutri-muted">Có dữ liệu ngày không hợp lệ, ngoài tháng hoặc bị trùng. Ngày trùng không được đánh dấu hoàn thành.</p>}
      {loadState === 'loading' && <p role="status">Đang tải dữ liệu tháng…</p>}
      {loadState === 'error' && <div role="alert"><p>{errorMessage || 'Không tải được dữ liệu tháng. Chưa thể đánh giá các ngày.'}</p>{onRetry && <button type="button" className={`min-h-11 rounded-xl border border-nutri-border px-3 ${focus}`} onClick={onRetry}>Thử lại</button>}</div>}
    </header>
    <div className="px-1 sm:px-4"><table className="w-full table-fixed border-separate border-spacing-0" aria-labelledby={title} aria-busy={loadState === 'loading'}>
      <thead><tr>{weekdayNames.map((name, i) => <th key={name} scope="col" className="py-2 text-xs font-medium text-nutri-muted"><abbr title={name} className="no-underline">{i === 6 ? 'CN' : `T${i + 2}`}</abbr></th>)}</tr></thead>
      <tbody>{monthGrid(month).map((week, index) => <tr key={index}>{week.map((date, column) => {
        if (!date) return <td key={`blank-${column}`} aria-hidden="true" />;
        const label = status(date); const completed = label === 'Đã xác nhận hoàn thành';
        const symbol = date > today ? '·' : completed ? '✓' : label === 'Chưa có xác nhận hoàn thành' ? '○' : label === 'Đang tải' ? '…' : label.includes('Lỗi') || loadState === 'error' ? '!' : '—';
        return <td key={date} className="p-0"><button type="button" disabled={date > today} aria-current={date === today ? 'date' : undefined} aria-pressed={selected === date} aria-label={`${dateLabel(date)} — ${label}${date === today ? ' — Hôm nay' : ''}`} onClick={() => onDateSelect(date)} className={`mx-auto my-1 flex aspect-square min-h-11 w-11 max-w-full flex-col items-center justify-center rounded-full border-2 text-sm font-semibold leading-none disabled:cursor-default disabled:opacity-40 ${focus} ${selected === date ? 'ring-2 ring-offset-1 ring-nutri-primary' : ''} ${completed ? dayColor(date) : date === today ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-slate-200 text-nutri-muted'}`}><span>{Number(date.slice(8))}</span><span aria-hidden="true" className="text-[10px] font-normal">{symbol}</span></button></td>;
      })}</tr>)}</tbody>
    </table></div>
    <div className="space-y-2 px-3 text-sm sm:px-5"><h3 className="font-semibold">{selected ? `Ngày ${dateLabel(selected)}` : 'Thông tin ngày'}</h3><p>{selected ? status(selected) : 'Chọn một ngày trong lịch để xem trạng thái.'}</p>
      {selected && loadState === 'ready' && selectedDay && ('description' in selectedDay || 'message' in selectedDay) && <p className="break-words text-nutri-muted">{'description' in selectedDay ? selectedDay.description : 'message' in selectedDay ? selectedDay.message : ''}</p>}
      <p className="text-nutri-muted">Chuỗi ngày và huy hiệu sẽ hiển thị khi quy tắc theo dõi được xác nhận.</p>
    </div>
  </section>;
}
