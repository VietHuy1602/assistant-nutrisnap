/**
 * src/frontend/src/components/ConnectionErrorScreen.tsx
 * Màn hình thông báo mất kết nối tới Backend (theo frame Figma "Mất kết nối", SAC-3, SAC-4).
 * Giữ nguyên ngữ cảnh phiên, cho phép người dùng bấm "Thử lại" mà không bị văng ra trang /login.
 */

import React, { useState, useContext } from 'react';
import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

export interface ConnectionErrorScreenProps {
  onRetry?: () => Promise<void>;
}

export const ConnectionErrorScreen: React.FC<ConnectionErrorScreenProps> = ({ onRetry }) => {
  const auth = useContext(AuthContext);
  const httpStatus = auth?.failureStatus;
  const [retrying, setRetrying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    setErrorMessage(null);
    try {
      if (onRetry) {
        await onRetry();
      } else if (auth?.retryBootstrap) {
        await auth.retryBootstrap();
      }
    } catch {
      setErrorMessage('Vẫn chưa thể kết nối tới máy chủ. Vui lòng thử lại sau giây lát.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div
        role="alert"
        aria-live="assertive"
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-6"
      >
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600">
          <WifiOff className="w-8 h-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {httpStatus ? 'Máy chủ trả về lỗi' : 'Không thể kết nối máy chủ'}
          </h1>
          <p className="text-sm text-nutri-muted leading-6">
            {httpStatus
              ? `Đã nhận phản hồi HTTP ${httpStatus} từ máy chủ. Vui lòng thử lại sau.`
              : 'Chưa nhận được phản hồi từ máy chủ. Vui lòng kiểm tra kết nối và thử lại.'}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 text-nutri-error text-sm leading-6 border border-red-200 flex items-center gap-2 text-left"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="min-h-12 min-w-12 w-full py-2.5 px-4 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Đang kết nối lại…' : 'Thử lại'}
          </button>
        </div>

        <p className="text-sm leading-6 text-nutri-muted [overflow-wrap:anywhere]">
          Mã lỗi: <span className="font-mono">{httpStatus ? `ERR_HTTP_${httpStatus}` : 'ERR_SERVER_UNREACHABLE'}</span>
        </p>
      </div>
    </div>
  );
};
