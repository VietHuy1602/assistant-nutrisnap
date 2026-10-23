import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { MonthlyReportViewProps } from '../types/monthlyReport';
import { nutritionValue, prepareReportRows, reportMonthLength, validReportDate } from '../utils/monthlyReport';

const control = 'min-h-11 rounded-xl border border-nutri-border bg-nutri-panel px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 disabled:opacity-50';
const panel = 'min-w-0 rounded-2xl border border-nutri-border bg-nutri-panel p-4 sm:p-6';
const formatNumber = (value: number | null) => value === null ? 'Chưa có dữ liệu' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const stateLabels = {
  available: 'Có dữ liệu', unavailable: 'Chưa có dữ liệu', error: 'Lỗi dữ liệu',
  future: 'Ngày tương lai', invalid: 'Dữ liệu không hợp lệ',
};

export function MonthlyReportView({ month, today, loadState, data, errorMessage, onMonthChange, onRetry }: MonthlyReportViewProps) {
  const [printError, setPrintError] = useState<string | null>(null);
  const [yearDraft, setYearDraft] = useState<{ month: string; value: string } | null>(null);
  const monthLength = reportMonthLength(month);
  const valid = monthLength > 0 && validReportDate(today);
  const future = valid && month > today.slice(0, 7);
  const matching = data?.month === month;
  const eligible = valid && !future && matching && (loadState === 'ready' || loadState === 'partial');
  const rows = eligible ? prepareReportRows(month, today, data) : [];
  const hasValues = rows.some(row => row.calories !== null || row.proteinG !== null || row.carbsG !== null || row.fatG !== null);
  const showReport = eligible && hasValues;
  const incomplete = rows.some(row => row.state !== 'future' && (row.state !== 'available' || row.calories === null));
  const hasMacros = rows.some(row => row.proteinG !== null || row.carbsG !== null || row.fatG !== null);
  const title = monthLength ? `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}` : 'Tháng không hợp lệ';
  const summary = showReport ? data?.summary : undefined;

  const print = () => {
    setPrintError(null);
    try { window.print(); }
    catch { setPrintError('Không mở được hộp thoại in. Vui lòng thử lại hoặc dùng chức năng in của trình duyệt.'); }
  };

  return (
    <section className="nutri-monthly-report mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 py-8 text-nutri-ink" aria-label="Báo cáo tháng">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          /* Block flow lets the table paginate instead of fragmenting a flex item. */
          .nutri-monthly-report {
            display: block; width: auto; max-width: none; margin: 0; padding: 0;
            color: #000; font-size: 10pt; line-height: 1.4;
          }
          .nutri-monthly-report > * { margin-bottom: 10pt; }
          .nutri-monthly-report .report-controls,
          .nutri-monthly-report .report-chart,
          #monthly-report-preview-root > aside { display: none !important; }
          .nutri-monthly-report > header {
            display: block; break-inside: avoid; page-break-inside: avoid;
            break-after: avoid; page-break-after: avoid;
          }
          .nutri-monthly-report .report-table {
            overflow: visible !important; max-height: none;
            border: 0; border-radius: 0;
          }
          .nutri-monthly-report > div:has(.report-table) {
            display: block; padding: 0; border: 0; border-radius: 0;
            overflow: visible; break-inside: auto; page-break-inside: auto;
          }
          .nutri-monthly-report table {
            min-width: 0 !important; max-width: 100%; width: 100%;
            table-layout: fixed; border-collapse: collapse; font-size: 9.5pt;
          }
          .nutri-monthly-report caption {
            padding: 0 0 6pt; text-align: left;
            break-after: avoid; page-break-after: avoid;
          }
          .nutri-monthly-report th, .nutri-monthly-report td {
            padding: 5pt; vertical-align: top; white-space: normal;
            overflow-wrap: anywhere; border-bottom: 0.5pt solid #cbd5e1;
          }
          .nutri-monthly-report thead th:first-child { width: 13%; }
          .nutri-monthly-report thead th:nth-child(2) { width: 22%; }
          .nutri-monthly-report thead {
            display: table-header-group; break-inside: avoid; page-break-inside: avoid;
          }
          .nutri-monthly-report tbody { display: table-row-group; }
          .nutri-monthly-report tr { break-inside: avoid; page-break-inside: avoid; }
          .nutri-monthly-report > footer {
            break-inside: avoid; page-break-inside: avoid; orphans: 3; widows: 3;
          }
        }
      `}</style>
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-nutri-primary">NutriSnap · Dinh dưỡng mỗi ngày</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Báo cáo tháng</h1>
          <h2 className="mt-2 text-lg font-semibold" aria-live="polite">{title}</h2>
          {valid && <p className="mt-1 text-sm text-nutri-muted">Phạm vi tháng: 01/{month.slice(5)}/{month.slice(0, 4)} – {monthLength}/{month.slice(5)}/{month.slice(0, 4)} · Asia/Ho_Chi_Minh</p>}
          {matching && data?.source === 'demo' && <p className="mt-3 inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">Dữ liệu minh họa</p>}
        </div>
        <button type="button" className={`${control} report-controls shrink-0 bg-nutri-primary text-white`} disabled={!showReport} onClick={print}>In / Lưu PDF</button>
      </header>

      <div className={`${panel} report-controls grid gap-4 sm:grid-cols-2`}>
        <label className="flex flex-col gap-2 text-sm font-semibold">Tháng
          <select className={control} value={monthLength ? month.slice(5) : ''} disabled={!monthLength} onChange={e => onMonthChange(`${month.slice(0, 4)}-${e.target.value}`)}>
            {!monthLength && <option value="">Chọn tháng hợp lệ</option>}
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>Tháng {i + 1}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">Năm
          <input type="number" min="1" max="9999" step="1" className={control}
            value={monthLength ? (yearDraft?.month === month ? yearDraft.value : Number(month.slice(0, 4))) : ''}
            disabled={!monthLength}
            onChange={e => setYearDraft({ month, value: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onBlur={e => {
              const value = e.target.value;
              const year = Number(value);
              if (/^[0-9]{1,4}$/.test(value) && year >= 1 && year <= 9999) {
                const nextMonth = `${String(year).padStart(4, '0')}-${month.slice(5)}`;
                if (nextMonth !== month) onMonthChange(nextMonth);
              }
              setYearDraft(null);
            }} />
        </label>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {!valid ? <p role="alert">Tháng hoặc ngày hiện tại không hợp lệ. Vui lòng kiểm tra dữ liệu đầu vào.</p>
          : future ? <p>Tháng tương lai chưa có báo cáo.</p>
          : loadState === 'loading' ? <p role="status">Đang tải báo cáo tháng…</p>
          : loadState === 'error' ? <div role="alert"><p>{errorMessage || 'Không tải được báo cáo tháng. Vui lòng thử lại.'}</p>{onRetry && <button type="button" className={`${control} report-controls mt-3`} onClick={onRetry}>Thử lại</button>}</div>
          : loadState === 'empty' ? <p>Chưa có dữ liệu báo cáo cho tháng này. Điều này không có nghĩa là bạn chưa ăn hoặc chưa hoàn thành thói quen.</p>
          : !matching ? <p>Chưa nhận được dữ liệu cho tháng đang chọn.</p>
          : !hasValues ? <p>Chưa có dữ liệu dinh dưỡng hợp lệ cho tháng này.</p>
          : (loadState === 'partial' || incomplete) ? <p>Chỉ có một phần dữ liệu. Ngày thiếu dữ liệu không được tính là 0 hoặc ngày không hoàn thành.</p>
          : <p>Báo cáo hiển thị dữ liệu được cung cấp cho tháng đã chọn.</p>}
      </div>
      {printError && <p role="alert" className="report-controls text-nutri-error">{printError}</p>}

      {showReport && <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={panel}><h3 className="text-sm text-nutri-muted">Tổng kcal tháng · do nguồn dữ liệu cung cấp</h3><p className="mt-2 text-2xl font-bold">{formatNumber(nutritionValue(summary?.totalCalories))}</p></div>
          <div className={panel}><h3 className="text-sm text-nutri-muted">Kcal trung bình/ngày · do nguồn dữ liệu cung cấp</h3><p className="mt-2 text-2xl font-bold">{formatNumber(nutritionValue(summary?.averageDailyCalories))}</p></div>
        </div>
        <div className={`${panel} report-chart`}>
          <h3 className="font-semibold">Năng lượng theo ngày (kcal)</h3>
          <p className="mt-1 text-sm text-nutri-muted">Khoảng trống là ngày thiếu dữ liệu hoặc ngày tương lai. Xem số liệu trong bảng bên dưới.</p>
          <div className="mt-4 h-64 min-w-0 text-nutri-primary" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={date => String(Number(String(date).slice(8)))} minTickGap={18} />
                <YAxis width={48} />
                <Tooltip labelFormatter={label => dateLabel(String(label))} formatter={value => [formatNumber(nutritionValue(value)), 'kcal']} />
                <Line type="linear" dataKey="calories" stroke="currentColor" strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={panel}>
          <div className="report-table overflow-x-auto rounded-xl border border-nutri-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus" tabIndex={0} role="region" aria-label="Bảng dinh dưỡng theo ngày, có thể cuộn ngang">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="p-3 text-left font-semibold">Dinh dưỡng từng ngày · {title}</caption>
              <thead className="bg-nutri-surface"><tr>{['Ngày', 'Trạng thái', 'kcal', ...(hasMacros ? ['Protein (g)', 'Carbohydrate (g)', 'Fat (g)'] : [])].map(label => <th scope="col" className="px-3 py-3" key={label}>{label}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.date} className="border-t border-nutri-border"><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium">{dateLabel(row.date)}</th><td className="px-3 py-3">{stateLabels[row.state]}</td><td className="px-3 py-3">{formatNumber(row.calories)}</td>{hasMacros && [row.proteinG, row.carbsG, row.fatG].map((value, i) => <td key={i} className="px-3 py-3">{formatNumber(value)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </>}
      <footer className="border-t border-nutri-border pt-4 text-sm text-nutri-muted">
        <p>Ngày thiếu dữ liệu được ghi “Chưa có dữ liệu”, không thay bằng 0. Không suy luận mục tiêu lịch sử từ mục tiêu hiện tại.</p>
        <p className="mt-2">Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.</p>
        <p className="report-controls mt-2">“In / Lưu PDF” mở hộp thoại in của trình duyệt; chọn lưu PDF tại đó.</p>
      </footer>
    </section>
  );
}

export default MonthlyReportView;
