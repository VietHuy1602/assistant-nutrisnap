/**
 * src/frontend/src/components/analytics/ChartCard.tsx
 * Card wrapper for analytics charts with accessibility table toggle and disclaimers.
 * ADR-W5-08 & ASC-6 of NS-FE-W5-001.
 */

import React, { useState } from 'react';
import { Table, LineChart as ChartIcon } from 'lucide-react';

interface ChartCardProps {
  title: string;
  chip?: React.ReactNode;
  disclaimer?: string;
  tableComponent: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  chip,
  disclaimer,
  tableComponent,
  children,
  className = '',
}) => {
  const [showTable, setShowTable] = useState(false);

  return (
    <section
      className={`rounded-2xl bg-white border border-slate-200/80 shadow-xs p-5 flex flex-col gap-4 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {chip}
        </div>

        <button
          type="button"
          onClick={() => setShowTable((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label={showTable ? `Xem dạng biểu đồ cho ${title}` : `Xem dạng bảng cho ${title}`}
        >
          {showTable ? (
            <>
              <ChartIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Xem biểu đồ</span>
            </>
          ) : (
            <>
              <Table className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Xem dạng bảng</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full min-h-[300px]">
        {showTable ? tableComponent : children}
      </div>

      {disclaimer && (
        <p className="text-[11px] text-slate-600 italic border-t border-slate-100 pt-3">
          {disclaimer}
        </p>
      )}
    </section>
  );
};
