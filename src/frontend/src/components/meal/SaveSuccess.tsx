import React from 'react';
import { CheckCircle2, ArrowRight, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMealTypeLabel } from '../../constants/copy';

interface SaveSuccessProps {
  itemCount: number;
  mealType: string;
  onReset: () => void;
  className?: string;
}

export const SaveSuccess: React.FC<SaveSuccessProps> = ({
  itemCount,
  mealType,
  onReset,
  className = '',
}) => {
  const navigate = useNavigate();

  return (
    <div
      className={`w-full max-w-md mx-auto p-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center text-center gap-5 ${className}`}
      role="status"
    >
      <div className="w-16 h-16 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center text-emerald-600 animate-in zoom-in-75">
        <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-xl font-bold text-slate-900">Ghi nhận bữa ăn thành công!</h3>
        <p className="text-sm text-slate-600">
          Đã lưu <span className="font-semibold text-emerald-700">{itemCount} món</span> cho {getMealTypeLabel(mealType).toLowerCase()} vào nhật ký dinh dưỡng của bạn.
        </p>
      </div>

      <div className="flex flex-col w-full gap-2.5 pt-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        >
          <span>Xem Dashboard dinh dưỡng</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onReset}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors"
        >
          <PlusCircle className="w-4 h-4" aria-hidden="true" />
          <span>Ghi nhận bữa ăn khác</span>
        </button>
      </div>
    </div>
  );
};
