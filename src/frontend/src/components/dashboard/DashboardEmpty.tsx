import React from 'react';
import { Camera, Utensils } from 'lucide-react';
import { formatVNDate, toLocalISODate } from '../../utils/date';
import { Link } from 'react-router-dom';

interface DashboardEmptyProps {
  onCaptureClick?: () => void;
  className?: string;
  selectedDate?: string;
}

export const DashboardEmpty: React.FC<DashboardEmptyProps> = ({ onCaptureClick, className = '', selectedDate = toLocalISODate() }) => {
  return (
    <div
      className={`px-4 py-5 bg-white rounded-3xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <div className="w-10 h-10 rounded-xl bg-[#E0F1B8] flex items-center justify-center text-nutri-dark">
        <Utensils className="w-5 h-5" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1 max-w-sm">
        <h4 className="text-base font-bold text-slate-800">{selectedDate === toLocalISODate() ? 'Chưa ghi nhận bữa ăn nào hôm nay' : `Chưa ghi nhận bữa ăn ngày ${formatVNDate(selectedDate)}`}</h4>
        <p className="text-sm leading-6 text-nutri-muted">
          Bắt đầu bằng một ảnh bữa ăn. Bạn sẽ kiểm tra kết quả trước khi lưu.
        </p>
      </div>

      {onCaptureClick ? (
        <button
          type="button"
          onClick={onCaptureClick}
          className="inline-flex min-h-12 min-w-12 items-center gap-2 px-4 py-2.5 rounded-xl bg-[#9ADA26] hover:bg-[#E0F1B8] text-[#171717] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>{selectedDate === toLocalISODate() ? 'Chụp bữa ăn đầu tiên' : 'Ghi bữa ăn mới'}</span>
        </button>
      ) : (
        <Link
          to="/capture"
          className="inline-flex min-h-12 min-w-12 items-center gap-2 px-4 py-2.5 rounded-xl bg-[#9ADA26] hover:bg-[#E0F1B8] text-[#171717] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>{selectedDate === toLocalISODate() ? 'Chụp bữa ăn đầu tiên' : 'Ghi bữa ăn mới'}</span>
        </Link>
      )}
    </div>
  );
};
