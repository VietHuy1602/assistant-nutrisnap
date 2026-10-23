import React from 'react';
import { Camera, Search, HelpCircle } from 'lucide-react';

interface UnrecognizedPanelProps {
  onRetake: () => void;
  onManualEntry: () => void;
  className?: string;
}

export const UnrecognizedPanel: React.FC<UnrecognizedPanelProps> = ({
  onRetake,
  onManualEntry,
  className = '',
}) => {
  return (
    <div
      className={`w-full max-w-md mx-auto p-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center text-center gap-5 ${className}`}
    >
      <div className="w-16 h-16 rounded-full bg-amber-50 border-4 border-amber-100 flex items-center justify-center text-amber-600">
        <HelpCircle className="w-8 h-8" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-bold text-slate-900">Chưa nhận diện được món ăn</h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Ảnh có thể bị mờ, thiếu sáng hoặc góc chụp chưa trọn vẹn đĩa ăn. Bạn hãy thử chụp lại góc thẳng từ trên xuống hoặc chọn món từ danh mục.
        </p>
      </div>

      <div className="flex flex-col w-full gap-2.5 pt-2">
        <button
          type="button"
          onClick={onRetake}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Chụp lại ảnh đĩa ăn</span>
        </button>

        <button
          type="button"
          onClick={onManualEntry}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span>Chọn món thủ công từ CSDL</span>
        </button>
      </div>
    </div>
  );
};
