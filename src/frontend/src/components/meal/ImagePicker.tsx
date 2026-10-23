import React, { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { validateImageFile } from '../../utils/image';

interface ImagePickerProps {
  onImageSelected: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export const ImagePicker: React.FC<ImagePickerProps> = ({
  onImageSelected,
  disabled = false,
  className = '',
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setValidationError(null);
    const check = validateImageFile(file);
    if (!check.valid) {
      setValidationError(check.error || 'Tệp ảnh không hợp lệ.');
      return;
    }
    onImageSelected(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Đặt lại giá trị input để có thể chọn lại cùng một file nếu muốn
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        id="nutrisnap-image-upload-input"
        disabled={disabled}
        onChange={handleFileChange}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
          dragOver
            ? 'border-emerald-500 bg-emerald-50/50'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Khu vực tải ảnh món ăn từ thiết bị"
      >
        <div className="w-12 h-12 mb-3 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
          <Upload className="w-6 h-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-slate-800">
          Nhấn để chọn ảnh hoặc kéo thả vào đây
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Hỗ trợ định dạng JPEG, PNG, WebP (Tối đa 10MB)
        </p>
      </div>

      {validationError && (
        <div
          className="mt-3 flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 rounded-xl border border-red-200"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" aria-hidden="true" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
