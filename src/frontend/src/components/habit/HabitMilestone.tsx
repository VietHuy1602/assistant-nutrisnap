/**
 * src/frontend/src/components/habit/HabitMilestone.tsx
 * Hiển thị tiến độ thử thách 7 ngày & huy hiệu khích lệ từ Backend.
 * TUÂN THỦ (ISC-5): Thông báo có aria-live polite; không chặn tương tác.
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { SevenDayChallenge } from '../../api/habitContract';
import { Mascot } from '../common/Mascot';

interface HabitMilestoneProps {
  challenge: SevenDayChallenge;
}

export const HabitMilestone: React.FC<HabitMilestoneProps> = ({ challenge }) => {
  return (
    <div
      aria-live="polite"
      className="bg-white border border-slate-100 rounded-3xl p-5 shadow-lg shadow-slate-900/5 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
            Thử thách 7 ngày
          </span>
          <Mascot pose="workout" size={64} className="-my-3 -mr-2" />
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-slate-900">
            {challenge.completedDays} / {challenge.targetDays} ngày
          </span>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2.5 py-1 rounded-full">
            {challenge.progressPct}%
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-emerald-500 via-teal-500 to-lime-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, challenge.progressPct)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
        {challenge.isCompleted ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
        ) : (
          <span className="text-base" aria-hidden="true">
            🎖️
          </span>
        )}
        <div className="min-w-0">
          <span className="text-xs text-slate-400 block">Huy hiệu đạt được</span>
          <p className="text-xs font-bold text-slate-800 truncate">{challenge.badgeName}</p>
        </div>
      </div>
    </div>
  );
};
