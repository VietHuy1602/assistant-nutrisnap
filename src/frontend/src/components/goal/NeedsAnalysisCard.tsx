/**
 * src/frontend/src/components/goal/NeedsAnalysisCard.tsx
 * Sau khi lưu mục tiêu: AI kết hợp khảo sát ban đầu + mục tiêu cá nhân để phân tích nhu cầu và đưa đề xuất.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Lightbulb, RefreshCw, Sparkles, Target, UtensilsCrossed } from 'lucide-react';
import { Mascot } from '../common/Mascot';
import { preferenceApi, type NeedsAnalysis } from '../../api/preferenceApi';
import { isApiError } from '../../utils/apiError';

const Section: React.FC<{ icon: React.ReactNode; title: string; items: string[]; tone: string }> = ({ icon, title, items, tone }) =>
  items.length ? (
    <div className={`rounded-2xl p-4 ${tone}`}>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">{icon}{title}</h4>
      <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
        {items.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />{t}</li>)}
      </ul>
    </div>
  ) : null;

export const NeedsAnalysisCard: React.FC<{ autoRun?: boolean }> = ({ autoRun = false }) => {
  const [data, setData] = useState<NeedsAnalysis | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'no_survey'>(autoRun ? 'loading' : 'idle');

  const run = useCallback(async () => {
    setState('loading');
    try {
      setData(await preferenceApi.analyze());
      setState('idle');
    } catch (err) {
      setState(isApiError(err) && err.status === 409 ? 'no_survey' : 'error');
    }
  }, []);

  useEffect(() => {
    if (autoRun) void run();
    else preferenceApi.analysis().then(setData).catch(() => undefined);
  }, [autoRun, run]);

  if (state === 'no_survey') return null;

  return (
    <section aria-labelledby="needs-title" aria-busy={state === 'loading'} className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-lime-500 p-4 text-white">
        <Mascot pose={state === 'loading' ? 'thinking' : 'celebrate'} size={64} className="shrink-0 -my-2" />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-white/90"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> AI phân tích nhu cầu</p>
          <h3 id="needs-title" className="text-base font-bold leading-snug">
            {state === 'loading' ? 'Đang kết hợp khảo sát và mục tiêu của bạn…' : data?.headline || 'Phân tích nhu cầu của bạn'}
          </h3>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {state === 'loading' && (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />)}
          </div>
        )}
        {state === 'error' && (
          <p role="alert" className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
            Chưa phân tích được lúc này.{' '}
            <button type="button" onClick={() => void run()} className="font-semibold underline">Thử lại</button>
          </p>
        )}
        {state === 'idle' && data && (
          <>
            <Section icon={<Target aria-hidden="true" className="h-4 w-4 text-emerald-600" />} title="Nhu cầu của bạn" items={data.needs} tone="bg-emerald-50/70" />
            <Section icon={<Lightbulb aria-hidden="true" className="h-4 w-4 text-amber-500" />} title="Đề xuất cho bạn" items={data.recommendations} tone="bg-amber-50/60" />
            <Section icon={<UtensilsCrossed aria-hidden="true" className="h-4 w-4 text-sky-600" />} title="Gợi ý một ngày ăn" items={data.sample_day} tone="bg-sky-50/70" />
            <Section icon={<AlertTriangle aria-hidden="true" className="h-4 w-4 text-rose-500" />} title="Lưu ý" items={data.cautions} tone="bg-rose-50/60" />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button type="button" onClick={() => void run()} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-emerald-700">
                <RefreshCw aria-hidden="true" className="h-4 w-4" /> Phân tích lại
              </button>
              <Link to="/meal-plan" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-lime-500 px-5 text-sm font-bold text-white shadow-md shadow-emerald-500/30">
                Tạo thực đơn theo phân tích <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
        {state === 'idle' && !data && (
          <button type="button" onClick={() => void run()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-bold text-white">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> Phân tích nhu cầu
          </button>
        )}
      </div>
    </section>
  );
};
