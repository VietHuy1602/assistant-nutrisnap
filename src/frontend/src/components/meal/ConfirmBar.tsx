import React from 'react';
import { Check, X, AlertCircle, Loader2 } from 'lucide-react';

interface ConfirmBarProps {
  isSavable: boolean;
  isSaving: boolean;
  isCalculating: boolean;
  unsavableReasons: string[];
  onConfirmSave: () => void;
  onCancel: () => void;
  className?: string;
}

export const ConfirmBar: React.FC<ConfirmBarProps> = ({
  isSavable,
  isSaving,
  isCalculating,
  unsavableReasons,
  onConfirmSave,
  onCancel,
  className = '',
}) => {
  const canSubmit = isSavable && !isSaving && !isCalculating;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Thông báo lý do nút Lưu bị khóa nếu có */}
      {!isSavable && unsavableReasons.length > 0 && (
        <div
          className="flex items-start gap-2 p-3 text-xs text-amber-800 bg-amber-50 rounded-xl border border-amber-200"
          role="status"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <span className="font-semibold">Chưa thể lưu: </span>
            <span>{unsavableReasons.join(' ')}</span>
          </div>
        </div>
      )}

      <div className="capture-action-row flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="py-3 px-5 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5">
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Hủy</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onConfirmSave}
          disabled={!canSubmit}
          aria-busy={isSaving}
          className={`flex-1 py-3 px-5 rounded-2xl text-sm font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
            canSubmit
              ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-emerald-600/20 active:scale-[0.99]'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Đang lưu vào nhật ký...</span>
            </>
          ) : isCalculating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Đang tính dinh dưỡng...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>Xác nhận lưu bữa ăn</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
