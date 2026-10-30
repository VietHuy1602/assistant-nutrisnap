/**
 * src/frontend/src/components/report/ReportNotice.tsx
 * 3 dòng chú thích minh bạch bắt buộc cho Báo cáo Tháng (M4, ISC-7, Mục 16.5).
 */

import React from 'react';
import { Info } from 'lucide-react';
import { REPORT_NOTICES } from '../../api/reportContract';

export const ReportNotice: React.FC = () => {
  return (
    <div
      role="note"
      aria-label="Chú thích y khoa & dinh dưỡng"
      className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs text-slate-600 space-y-1.5"
    >
      <div className="flex items-center gap-1.5 font-bold text-slate-700">
        <Info className="w-4 h-4 text-nutri-primary shrink-0" aria-hidden="true" />
        <span>Lưu ý minh bạch về số liệu:</span>
      </div>
      <ul className="list-disc list-outside space-y-2 pl-5 text-sm leading-6">
        {REPORT_NOTICES.map((notice, idx) => (
          <li key={idx}>{notice}</li>
        ))}
      </ul>
    </div>
  );
};
