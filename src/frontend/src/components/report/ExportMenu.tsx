/**
 * src/frontend/src/components/report/ExportMenu.tsx
 * Menu xuất báo cáo dưới dạng ảnh PNG và In / Lưu PDF (ADR-W6-05, ADR-W6-06).
 * RÀNG BUỘC (ISC-11):
 * - Không gửi request mạng mới ngoài dữ liệu đã có.
 * - Không lưu ảnh vào bất kỳ kho lưu trữ nào.
 */

import React, { useState } from 'react';
import { Download, Printer, CheckCircle2, AlertCircle } from 'lucide-react';
import type { MonthlyReport } from '../../api/reportContract';
import { renderReportCanvas } from '../../export/renderReportCanvas';
import { exportCanvasAsPng } from '../../export/exportPng';
import { printReport } from '../../export/printReport';

interface ExportMenuProps {
  report: MonthlyReport;
  disabled?: boolean;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ report, disabled = false }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleExportPng = async () => {
    if (disabled || isExporting) return;
    setIsExporting(true);
    setMessage(null);

    try {
      const canvas = renderReportCanvas(report);
      const filename = `NutriSnap_BaoCao_${report.month}.png`;
      await exportCanvasAsPng(canvas, filename);

      setMessage({ text: 'Đã xuất ảnh PNG thành công!', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể xuất ảnh PNG.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    if (disabled) return;
    const ok = printReport();
    if (!ok) {
      setMessage({
        text: 'Không mở được hộp thoại in. Vui lòng nhấn Ctrl+P trên trình duyệt.',
        type: 'error',
      });
    }
  };

  return (
    <div className="report-controls flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || isExporting}
          onClick={handleExportPng}
          className="inline-flex min-h-11 items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
        >
          <Download className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span>{isExporting ? 'Đang tạo ảnh…' : 'Xuất ảnh PNG'}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={handlePrint}
          className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          <span>In / Lưu PDF</span>
        </button>
      </div>

      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
};
