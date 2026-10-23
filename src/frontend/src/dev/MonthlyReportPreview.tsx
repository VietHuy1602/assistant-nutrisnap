import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MonthlyReportView } from '../pages/MonthlyReportView';
import type { MonthlyReportData, MonthlyReportViewProps } from '../types/monthlyReport';
import { reportMonthLength } from '../utils/monthlyReport';
import '../index.css';

// Local visual fixtures only: no API, storage, authentication or nutrition calculation.
// A fixed business date makes future-day/month checks reproducible.
const PREVIEW_TODAY = '2026-10-23';
type PreviewState = MonthlyReportViewProps['loadState'];
const states: readonly PreviewState[] = ['loading', 'error', 'empty', 'partial', 'ready'];
const samples = [
  { calories: 1820, proteinG: 95, carbsG: 210, fatG: 62 },
  { calories: 2050, proteinG: 110, carbsG: 240, fatG: 70 },
  { calories: 1740, proteinG: 88, carbsG: 195, fatG: 58 },
] as const;

function fixture(month: string, state: PreviewState): MonthlyReportData {
  const days: MonthlyReportData['days'] = state === 'empty' ? [] : Array.from(
    { length: reportMonthLength(month) }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      if (date > PREVIEW_TODAY) return { date, state: 'unavailable' as const };
      if (state === 'partial' && index % 5 === 1) return { date, state: 'unavailable' as const };
      if (state === 'partial' && index % 5 === 2) return { date, state: 'error' as const };
      if (state === 'partial' && index % 5 === 3) return { date, state: 'available' as const, proteinG: 45 };
      return { date, state: 'available' as const, ...samples[index % samples.length] };
    },
  );
  // No monthly totals/averages are fabricated from these illustrative daily values.
  return { month, source: 'demo', days };
}

function MonthlyReportPreview() {
  const [month, setMonth] = useState('2026-09');
  const [state, setState] = useState<PreviewState>('partial');

  return (
    <>
      <aside aria-label="Điều khiển preview báo cáo tháng" className="mx-auto max-w-6xl px-4 pt-6 print:hidden">
        <div className="rounded-2xl border border-nutri-border bg-nutri-panel p-4 text-nutri-ink">
          <p className="font-semibold text-nutri-primary">Dữ liệu minh họa · Preview UI độc lập</p>
          <p className="mt-2 text-sm text-nutri-muted">Không kết nối API hoặc lưu dữ liệu. Ngày hiện tại giả lập: 23/10/2026 (Asia/Ho_Chi_Minh).</p>
          <label className="mt-4 flex max-w-sm flex-col gap-2 text-sm font-semibold">
            Trạng thái preview
            <select className="nutri-input" value={state} onChange={event => setState(event.target.value as PreviewState)}>
              {states.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <p className="mt-3 text-sm text-nutri-muted">Thử tháng 02/2024 để xem năm nhuận; tháng 10/2026 để xem ngày tương lai; tháng 11/2026 để xem tháng tương lai. Nhập năm rồi nhấn Enter hoặc rời ô để áp dụng.</p>
          <p className="mt-2 text-sm text-nutri-muted">Chọn ready hoặc partial rồi nhấn “In / Lưu PDF”. Trong bản in, các điều khiển preview được ẩn.</p>
        </div>
      </aside>
      <MonthlyReportView month={month} today={PREVIEW_TODAY} loadState={state}
        data={fixture(month, state)} onMonthChange={setMonth}
        errorMessage="Lỗi tải báo cáo mô phỏng — không có yêu cầu mạng nào được gửi."
        onRetry={() => setState('ready')} />
    </>
  );
}

const root = document.getElementById('monthly-report-preview-root');
if (root) createRoot(root).render(<StrictMode><MonthlyReportPreview /></StrictMode>);
