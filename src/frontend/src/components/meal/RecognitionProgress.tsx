import React from 'react';
import { Loader2, X, AlertCircle } from 'lucide-react';
import { DISCLAIMER_RECOGNITION } from '../../constants/copy';

interface RecognitionProgressProps {
  slow: boolean;
  onCancel: () => void;
  className?: string;
}

export const RecognitionProgress: React.FC<RecognitionProgressProps> = ({
  slow,
  onCancel,
  className = '',
}) => {
  return (
    <div
      className={`w-full max-w-md mx-auto p-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center text-center gap-5 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-bold text-slate-900">Đang nhận diện món ăn...</h3>
        <p className="text-xs text-slate-500">
          AI Vision đang bóc tách món ăn và ước lượng khẩu phần từ hình ảnh đĩa ăn của bạn.
        </p>
      </div>

      {/* Thông báo tiến trình chậm sau 5s (PSC-4) */}
      {slow && (
        <div className="flex items-start gap-2 p-3 text-xs text-amber-800 bg-amber-50 rounded-xl border border-amber-200 text-left animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Quá trình đang mất nhiều thời gian hơn bình thường. Bạn có thể đợi thêm vài giây hoặc hủy để nhập thủ công.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Hủy nhận diện</span>
      </button>

      <p className="text-[11px] text-slate-400 italic">
        {DISCLAIMER_RECOGNITION}
      </p>
    </div>
  );
};
