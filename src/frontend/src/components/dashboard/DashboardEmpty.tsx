import React from 'react';
import { Camera, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardEmptyProps {
  onCaptureClick?: () => void;
  className?: string;
}

export const DashboardEmpty: React.FC<DashboardEmptyProps> = ({ onCaptureClick, className = '' }) => {
  return (
    <div
      className={`p-8 bg-white rounded-3xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center gap-4 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
        <Utensils className="w-7 h-7" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1 max-w-sm">
        <h4 className="text-base font-bold text-slate-800">Chưa ghi nhận bữa ăn nào hôm nay</h4>
        <p className="text-xs text-slate-500">
          Hãy chụp ảnh đĩa thức ăn của bạn để NutriSnap tự động nhận diện và cập nhật tiến trình calo.
        </p>
      </div>

      {onCaptureClick ? (
        <button
          type="button"
          onClick={onCaptureClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Chụp bữa ăn đầu tiên</span>
        </button>
      ) : (
        <Link
          to="/capture"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Chụp bữa ăn đầu tiên</span>
        </Link>
      )}
    </div>
  );
};
