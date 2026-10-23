import React from 'react';
import { Camera, Upload, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { CameraStatus } from '../../hooks/useCamera';

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: string | null;
  onCapture: () => void;
  onSwitchToUpload: () => void;
  onClose?: () => void;
  disabled?: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  status,
  error,
  onCapture,
  onSwitchToUpload,
  onClose,
  disabled = false,
}) => {
  const isLive = status === 'live';
  const isRequesting = status === 'requesting';

  return (
    <div className="relative w-full max-w-lg mx-auto overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl flex flex-col items-center">
      {/* Header điều khiển */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          <span>Bảo mật & Không lưu đĩa</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-black/40 text-slate-200 hover:text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Đóng máy ảnh"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Khung ngắm Camera */}
      <div className="relative w-full aspect-[4/3] bg-slate-900 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {isRequesting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/80">
            <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-200">Đang khởi động máy ảnh...</p>
          </div>
        )}

        {/* Khung ngắm bố cục góc */}
        {isLive && (
          <div className="absolute inset-8 pointer-events-none border-2 border-white/30 rounded-2xl flex flex-col justify-between p-2">
            <div className="flex justify-between">
              <span className="w-4 h-4 border-t-2 border-l-2 border-emerald-400 -mt-1 -ml-1 rounded-tl" />
              <span className="w-4 h-4 border-t-2 border-r-2 border-emerald-400 -mt-1 -mr-1 rounded-tr" />
            </div>
            <div className="flex justify-between">
              <span className="w-4 h-4 border-b-2 border-l-2 border-emerald-400 -mb-1 -ml-1 rounded-bl" />
              <span className="w-4 h-4 border-b-2 border-r-2 border-emerald-400 -mb-1 -mr-1 rounded-br" />
            </div>
          </div>
        )}

        {/* Trạng thái lỗi hoặc từ chối */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 z-10">
            <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-200 mb-4">{error}</p>
            <button
              type="button"
              onClick={onSwitchToUpload}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Tải ảnh từ thiết bị</span>
            </button>
          </div>
        )}
      </div>

      {/* Chân điều khiển & Nút chụp */}
      <div className="w-full p-5 bg-slate-950 flex flex-col items-center gap-3">
        <p className="text-xs text-slate-400 text-center">
          Đặt toàn bộ đĩa ăn vào khung hình, đủ ánh sáng để nhận diện chính xác nhất.
        </p>

        <div className="w-full flex items-center justify-between px-6 mt-1">
          <button
            type="button"
            onClick={onSwitchToUpload}
            className="flex flex-col items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg p-1"
          >
            <Upload className="w-5 h-5" aria-hidden="true" />
            <span>Tải ảnh</span>
          </button>

          {/* Nút chụp lớn chuẩn PSC-1 (≥ 56px) */}
          <button
            type="button"
            disabled={!isLive || disabled}
            onClick={onCapture}
            className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center transition-all transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 ${
              isLive && !disabled
                ? 'bg-emerald-500 hover:bg-emerald-400 cursor-pointer shadow-lg shadow-emerald-500/30'
                : 'bg-slate-700 opacity-50 cursor-not-allowed'
            }`}
            aria-label="Chụp ảnh đĩa thức ăn"
          >
            <Camera className="w-7 h-7 text-white" aria-hidden="true" />
          </button>

          <div className="w-10" />
        </div>
      </div>
    </div>
  );
};
