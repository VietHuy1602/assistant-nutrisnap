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
      className={`px-4 py-6 sm:p-8 bg-white rounded-3xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center gap-4 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
        <Utensils className="w-7 h-7" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1 max-w-sm">
        <h4 className="text-base font-bold text-slate-800">{selectedDate === toLocalISODate() ? 'Chưa ghi nhận bữa ăn nào hôm nay' : `Chưa ghi nhận bữa ăn ngày ${formatVNDate(selectedDate)}`}</h4>
        <p className="text-sm leading-6 text-nutri-muted">
          Hãy chụp ảnh đĩa thức ăn của bạn để NutriSnap tự động nhận diện và cập nhật tiến trình calo.
        </p>
      </div>

      {onCaptureClick ? (
        <button
          type="button"
          onClick={onCaptureClick}
          className="inline-flex min-h-12 min-w-12 items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>{selectedDate === toLocalISODate() ? 'Chụp bữa ăn đầu tiên' : 'Ghi bữa ăn mới'}</span>
        </button>
      ) : (
        <Link
          to="/capture"
          className="inline-flex min-h-12 min-w-12 items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>{selectedDate === toLocalISODate() ? 'Chụp bữa ăn đầu tiên' : 'Ghi bữa ăn mới'}</span>
        </Link>
      )}
    </div>
  );
};
