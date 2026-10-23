import React, { useEffect, useState } from 'react';
import { RotateCcw, ArrowRight, Sparkles } from 'lucide-react';
import { MEAL_TYPES } from '../../constants/copy';

interface CapturePreviewProps {
  blob: Blob;
  mealType: string;
  onMealTypeChange: (type: string) => void;
  onConfirmPhoto: () => void;
  onRetake: () => void;
  isProcessing?: boolean;
}

export const CapturePreview: React.FC<CapturePreviewProps> = ({
  blob,
  mealType,
  onMealTypeChange,
  onConfirmPhoto,
  onRetake,
  isProcessing = false,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Quản lý ObjectURL an toàn: thu hồi ngay khi blob thay đổi hoặc unmount (ADR-W3-05)
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return (
    <div className="w-full max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Xem lại ảnh đã chụp</h2>
          <p className="text-xs text-slate-500">Kiểm tra độ rõ nét của ảnh và chọn loại bữa ăn</p>
        </div>
      </div>

      {/* Ảnh xem trước */}
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Đĩa thức ăn đã chụp"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            Đang tải ảnh...
          </div>
        )}
      </div>

      {/* Chọn loại bữa ăn */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
          Loại bữa ăn
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MEAL_TYPES.map((type) => {
            const isSelected = mealType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => onMealTypeChange(type.id)}
                disabled={isProcessing}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-pressed={isSelected}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nút hành động */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onRetake}
          disabled={isProcessing}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>Chụp lại</span>
        </button>

        <button
          type="button"
          onClick={onConfirmPhoto}
          disabled={isProcessing}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Đang xử lý...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Nhận diện món ăn</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
