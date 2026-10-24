/**
 * src/frontend/src/components/analytics/PatternInsightCard.tsx
 * Card rendering an individual pattern insight returned from backend.
 * Zero-Math: Renders plain strings and backend recommendations; no client computations.
 * Non-alarm colors: uses emerald/amber/sky/slate (no red/rose).
 * ADR-W5-01 & ASC-8 of NS-FE-W5-001.
 */

import React from 'react';
import { Lightbulb, Info, AlertCircle } from 'lucide-react';
import type { PatternInsightItem } from '../../api/progressContract';

interface PatternInsightCardProps {
  insight: PatternInsightItem;
}

export const PatternInsightCard: React.FC<PatternInsightCardProps> = ({ insight }) => {
  const { title, severity, recommendation, pattern_code } = insight;

  // Non-alarm badge styles based on severity (amber / sky / emerald / slate)
  const getBadgeStyle = () => {
    switch (severity.toLowerCase()) {
      case 'high':
      case 'warning':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'medium':
      case 'info':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'positive':
      case 'low':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getIcon = () => {
    switch (severity.toLowerCase()) {
      case 'high':
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />;
      case 'medium':
      case 'info':
        return <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />;
      default:
        return <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />;
    }
  };

  return (
    <article
      data-pattern-code={pattern_code}
      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col gap-2.5 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {getIcon()}
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-snug">{title}</h4>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${getBadgeStyle()}`}
        >
          {severity.toUpperCase()}
        </span>
      </div>

      {recommendation && (
        <div className="mt-1 rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-700 leading-relaxed">
          <p className="font-semibold text-slate-900 mb-0.5">Gợi ý hành động:</p>
          <p>{recommendation}</p>
        </div>
      )}
    </article>
  );
};
