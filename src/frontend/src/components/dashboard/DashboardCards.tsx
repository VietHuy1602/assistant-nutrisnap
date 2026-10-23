import type { ReactNode } from 'react';
import { Flame } from 'lucide-react';
import type { DailyDashboardData, MacroDetail } from '../../types/api';

export function DashboardCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-2xl border border-nutri-border/60 bg-nutri-panel p-5 shadow-sm sm:p-6 ${className}`}>{children}</div>;
}

// Keep source values in the labels; only the graphical range is clamped.
const visualPercent = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
const display = (value: number) => Number.isFinite(value) ? value.toLocaleString('vi-VN') : '—';

export function CalorieProgressCard({ data }: { data: DailyDashboardData }) {
  const hasTarget = Number.isFinite(data.target_calories) && data.target_calories > 0;
  const hasProgress = hasTarget && Number.isFinite(data.calories_progress_percent);
  const percent = hasProgress ? visualPercent(data.calories_progress_percent) : 0;
  const circumference = 2 * Math.PI * 40;
  return (
    <DashboardCard className="h-full">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Năng lượng hôm nay</h2>
        <span className="rounded-full bg-nutri-selected px-2.5 py-1 text-xs font-medium text-nutri-dark">Ước tính</span>
      </div>
      <div className="my-6 flex justify-center">
        <div className="relative flex h-52 w-52 items-center justify-center" role="progressbar" aria-label="Tiến độ năng lượng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={hasProgress ? `${display(data.calories_progress_percent)}% mục tiêu năng lượng; ${display(data.remaining_calories)} kcal còn lại` : 'Chưa có tiến độ năng lượng hợp lệ'}>
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="7" className="text-nutri-surface" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} className="text-nutri-primary transition-all duration-500 motion-reduce:transition-none" />
          </svg>
          <div className="relative text-center">
            <Flame className="mx-auto mb-1 h-5 w-5 text-nutri-primary" aria-hidden="true" />
            <p className="text-3xl font-bold tracking-tight tabular-nums">{display(data.remaining_calories)}</p>
            <p className="mt-1 text-sm text-nutri-muted">kcal còn lại</p>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-t border-nutri-border/50 pt-4 text-sm">
        <div><dt className="text-nutri-muted">Đã nạp</dt><dd className="mt-1 font-semibold tabular-nums">{display(data.consumed_calories)} kcal</dd></div>
        <div><dt className="text-nutri-muted">Mục tiêu</dt><dd className="mt-1 font-semibold tabular-nums">{display(data.target_calories)} kcal</dd></div>
      </dl>
      <p className="mt-4 text-sm text-nutri-muted">{hasProgress ? `${display(data.calories_progress_percent)}% mục tiêu năng lượng` : 'Chưa có mục tiêu hoặc tiến độ năng lượng hợp lệ.'}</p>
      {data.remaining_calories < 0 && <p className="mt-2 text-sm leading-6 text-nutri-muted">Số âm cho biết lượng đã nạp cao hơn mục tiêu hôm nay. Hãy tiếp tục theo dõi theo nhịp của bạn.</p>}
    </DashboardCard>
  );
}

const macroColors = { protein: 'bg-blue-500', carbs: 'bg-amber-500', fat: 'bg-purple-500' };

export function MacroProgressCard({ label, kind, macro }: { label: string; kind: keyof typeof macroColors; macro: MacroDetail }) {
  const hasTarget = Number.isFinite(macro?.target) && macro.target > 0;
  const hasProgress = hasTarget && Number.isFinite(macro?.progress_percent);
  const percent = hasProgress ? visualPercent(macro.progress_percent) : 0;
  return (
    <DashboardCard>
      <h3 className="flex items-center gap-2 font-semibold"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${macroColors[kind]}`} />{label}</h3>
      <p className="mt-4 text-2xl font-semibold tabular-nums">{display(macro?.consumed)} <span className="text-sm font-normal text-nutri-muted">{macro?.unit || '—'}</span></p>
      <p className="mt-1 text-sm text-nutri-muted">Mục tiêu: {display(macro?.target)} {macro?.unit || '—'}</p>
      <div role="progressbar" aria-label={`Tiến độ ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={hasProgress ? `${display(macro.progress_percent)}% mục tiêu` : 'Chưa có tiến độ hợp lệ'} className="mt-4 h-2 overflow-hidden rounded-full bg-nutri-surface">
        <div style={{ width: `${percent}%` }} className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${macroColors[kind]}`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-nutri-muted">{hasProgress ? `${display(macro.progress_percent)}% mục tiêu` : 'Chưa có mục tiêu hoặc tiến độ hợp lệ.'}</p>
    </DashboardCard>
  );
}
