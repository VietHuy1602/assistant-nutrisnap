import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowUpRight, Bot, Camera, CirclePlus, RefreshCw, Utensils } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppShellContext } from '../layouts/AppShell';
import { apiClient } from '../api/client';
import type { DailyDashboardData } from '../types/api';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { DashboardCard, CalorieProgressCard, MacroProgressCard } from '../components/dashboard/DashboardCards';
import { MealCaptureFlow } from '../components/MealCaptureFlow';
import { liveAPI } from '../components/api';

const actionStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-nutri-primary px-4 py-3 text-sm font-semibold text-white hover:bg-nutri-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

function DashboardWelcome({ username, date, goalTarget }: { username?: string; date?: string; goalTarget?: number }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-nutri-primary">DINH DƯỠNG HÔM NAY</p>
        <h1 className="mt-2 break-words text-2xl font-bold tracking-tight sm:text-3xl">Chào {username || 'bạn'}</h1>
        <p className="mt-2 text-sm leading-6 text-nutri-muted">Theo dõi bữa ăn theo nhịp của bạn. Mỗi lần ghi nhận giúp bạn hiểu mình hơn.</p>
        {Number.isFinite(goalTarget) && <p className="mt-2 text-sm font-medium text-nutri-dark">Kế hoạch đã lưu · {goalTarget!.toLocaleString('vi-VN')} kcal/ngày</p>}
      </div>
      {date && <time dateTime={date} className="shrink-0 text-sm text-nutri-muted">Ngày {date.split('-').reverse().join('/')}</time>}
    </header>
  );
}

function QuickActionCard({ active, onOpen }: { active: boolean; onOpen: (mode: 'photo' | 'manual') => void }) {
  return (
    <DashboardCard className="h-full border-t-4 border-t-nutri-primary">
      <div className="flex items-center gap-2"><Utensils className="h-5 w-5 text-nutri-primary" aria-hidden="true" /><h2 className="text-base font-semibold">Ghi nhận bữa ăn</h2></div>
      <p className="mt-2 text-sm leading-6 text-nutri-muted">Chọn cách phù hợp để bắt đầu nhật ký ăn uống của bạn.</p>
      <div className="mt-5 grid gap-3">
        {[{ label: 'Chụp ảnh món ăn', mode: 'photo' as const, Icon: Camera, hint: 'Camera hoặc tải ảnh' }, { label: 'Thêm thủ công', mode: 'manual' as const, Icon: CirclePlus, hint: 'Tìm món và nhập số gam' }].map(({ label, mode, Icon, hint }) => (
          <button key={label} type="button" disabled={active} onClick={() => onOpen(mode)} className="flex min-h-14 flex-wrap items-center gap-3 rounded-xl border border-nutri-primary/30 bg-nutri-selected/50 p-4 text-left hover:bg-nutri-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            <Icon className="h-5 w-5 shrink-0 text-nutri-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-nutri-muted">{hint}</span></span><ArrowUpRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-nutri-muted">{active ? 'Bản nháp đang mở ở phía trên. Hoàn tất hoặc đóng trước khi bắt đầu bữa ăn khác.' : 'Kiểm tra món và khẩu phần trước khi xác nhận lưu. Nếu nhận diện ảnh chưa khả dụng, bạn vẫn có thể chọn món thủ công.'}</p>
    </DashboardCard>
  );
}

function AICoachCard({ onOpen }: { onOpen: () => void }) {
  return (
    <DashboardCard className="border-nutri-primary/20 bg-nutri-selected/50">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-nutri-panel p-3 text-nutri-primary"><Bot className="h-6 w-6" aria-hidden="true" /></span>
          <div><h2 className="text-lg font-semibold">Đồng hành cùng trợ lý AI</h2><p className="mt-1 max-w-xl text-sm leading-6 text-nutri-muted">Mở cuộc trò chuyện để đặt câu hỏi về dinh dưỡng. Bạn quyết định nội dung gửi và mọi thao tác lưu.</p></div>
        </div>
        <button type="button" onClick={onOpen} className={`${actionStyle} shrink-0`}>Mở trợ lý AI <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </DashboardCard>
  );
}

export function DashboardPage() {
  const { user, hasGoal } = useAuth();
  const { openChat } = useOutletContext<AppShellContext>();
  const [data, setData] = useState<DailyDashboardData | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [mealMode, setMealMode] = useState<'photo' | 'manual' | null>(null);
  const mealPanel = useRef<HTMLElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mealMode) {
      mealPanel.current?.scrollIntoView?.({ block: 'start' });
      mealPanel.current?.focus({ preventScroll: true });
    }
  }, [mealMode]);

  useEffect(() => {
    let active = true;
    apiClient.get<DailyDashboardData>('/dashboard/daily')
      .then(({ data: response }) => {
        // A missing total is unavailable data, never an invitation to invent a value.
        if (!response || !Number.isFinite(response.target_calories) || !Number.isFinite(response.consumed_calories) || !Number.isFinite(response.remaining_calories) || !response.macros || !Array.isArray(response.meals_summary)) {
          throw new Error('Dashboard data unavailable');
        }
        if (active) { setData(response); setStatus('ready'); }
      })
      .catch(() => { if (active) { setData(null); setStatus('error'); } });
    return () => { active = false; };
  }, [attempt]);

  return (
    <div className="space-y-6 text-nutri-ink sm:space-y-8">
      <DashboardWelcome username={user?.username} date={data?.date} goalTarget={hasGoal ? data?.target_calories : undefined} />
      {mealMode && <section ref={mealPanel} tabIndex={-1} aria-label="Ghi nhận bữa ăn đang mở" className="scroll-mt-36 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus sm:scroll-mt-20">
        <MealCaptureFlow key={mealMode} api={liveAPI} demo={false} initialMode={mealMode} onClose={() => { setMealMode(null); actions.current?.focus(); }} onSaved={() => { setData(null); setStatus('loading'); setAttempt(value => value + 1); }} />
      </section>}
      {status === 'loading' && (
        <section aria-busy="true" aria-label="Đang tải tổng quan dinh dưỡng">
          <p role="status" className="mb-4 text-sm text-nutri-muted">Đang tải dữ liệu dinh dưỡng hôm nay…</p>
          <div aria-hidden="true" className="grid gap-5 md:grid-cols-2">
            {[0, 1].map(key => <DashboardCard key={key}><div className="h-72 animate-pulse rounded-xl bg-nutri-surface motion-reduce:animate-none" /></DashboardCard>)}
          </div>
        </section>
      )}
      {status === 'error' && (
        <DashboardCard>
          <div role="alert"><h2 className="font-semibold">Chưa tải được dữ liệu dinh dưỡng</h2><p className="mt-2 text-sm leading-6 text-nutri-muted">Không có số liệu để hiển thị lúc này. Hãy kiểm tra kết nối rồi thử lại.</p></div>
          <button type="button" className={`${actionStyle} mt-4`} onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}><RefreshCw className="h-4 w-4" aria-hidden="true" />Thử lại</button>
        </DashboardCard>
      )}
      {status === 'ready' && data && (
        <>
          {!hasGoal && <p className="text-sm leading-6 text-nutri-muted">Mục tiêu dinh dưỡng bên dưới là mức mặc định từ hệ thống, chưa phải mục tiêu cá nhân.</p>}
          {data.meals_summary.length === 0 && <p role="status" className="rounded-xl border border-nutri-primary/20 bg-nutri-selected p-4 text-sm leading-6 text-nutri-dark">Chưa ghi nhận bữa ăn hôm nay. Số liệu bên dưới phản ánh dữ liệu hiện có.</p>}
          <div className="grid items-start gap-5 md:grid-cols-2">
            <div className="min-w-0"><CalorieProgressCard data={data} /></div>
            <div ref={actions} tabIndex={-1} className="min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"><QuickActionCard active={mealMode !== null} onOpen={setMealMode} /></div>
            <section aria-labelledby="macro-heading" className="min-w-0 md:col-span-2">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="macro-heading" className="text-lg font-semibold">Dinh dưỡng đa lượng</h2><p className="text-sm text-nutri-muted">Đã nạp / mục tiêu · Ước tính</p></div>
              <div className="grid gap-4 md:grid-cols-3">
                <MacroProgressCard label="Đạm" kind="protein" macro={data.macros.protein} />
                <MacroProgressCard label="Tinh bột" kind="carbs" macro={data.macros.carbs} />
                <MacroProgressCard label="Chất béo" kind="fat" macro={data.macros.fat} />
              </div>
            </section>
          </div>
        </>
      )}
      <AICoachCard onOpen={openChat} />
      <DisclaimerBadge text={data?.disclaimer || undefined} />
    </div>
  );
}
