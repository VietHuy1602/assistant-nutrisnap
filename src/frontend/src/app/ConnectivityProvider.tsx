/**
 * src/frontend/src/app/ConnectivityProvider.tsx
 * Quản lý trạng thái kết nối mạng & hàng đợi 429 toàn cục (ADR-W6-08, ADR-W6-09).
 * Không chặn thao tác đọc dữ liệu từ cache bộ nhớ.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { WifiOff, Clock, AlertCircle } from 'lucide-react';
import { appBus } from './appBus';
import { planRetry } from '../utils/retry';

export type ConnectivityStatus = 'online' | 'offline' | 'unreachable' | 'rateLimited';

interface ConnectivityContextValue {
  status: ConnectivityStatus;
  isOnline: boolean;
  isOffline: boolean;
  isRateLimited: boolean;
  isUnreachable: boolean;
  rateLimitCountdown: number;
  triggerRateLimit: (retryAfterSec?: number) => void;
  triggerUnreachable: () => void;
  resetStatus: () => void;
}

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export interface ConnectivityProviderProps {
  children: React.ReactNode;
}

export const ConnectivityProvider: React.FC<ConnectivityProviderProps> = ({ children }) => {
  const [status, setStatus] = useState<ConnectivityStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  );
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);
  const [rateLimitAttempt, setRateLimitAttempt] = useState<number>(0);

  // Cập nhật khi sự kiện trình duyệt thay đổi
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => (prev === 'offline' ? 'online' : prev));
      appBus.emit({
        type: 'connectivity-changed',
        at: Date.now(),
        source: 'navigator-online',
      });
    };

    const handleOffline = () => {
      setStatus('offline');
      appBus.emit({
        type: 'connectivity-changed',
        at: Date.now(),
        source: 'navigator-offline',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Xử lý đếm ngược khi bị giới hạn tốc độ 429
  useEffect(() => {
    if (status !== 'rateLimited' || rateLimitCountdown <= 0) return;

    const timer = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('online');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, rateLimitCountdown]);

  const triggerRateLimit = useCallback(
    (retryAfterSec?: number) => {
      const nextAttempt = rateLimitAttempt + 1;
      setRateLimitAttempt(nextAttempt);
      const plan = planRetry(nextAttempt, retryAfterSec);

      if (plan) {
        setStatus('rateLimited');
        setRateLimitCountdown(plan.waitSec);
        appBus.emit({
          type: 'connectivity-changed',
          at: Date.now(),
          source: 'rate-limit-active',
        });
      } else {
        // Đã hết 3 lượt tự động -> Chuyển về trạng thái bận
        setStatus('rateLimited');
        setRateLimitCountdown(0);
      }
    },
    [rateLimitAttempt]
  );

  const triggerUnreachable = useCallback(() => {
    setStatus('unreachable');
    appBus.emit({
      type: 'connectivity-changed',
      at: Date.now(),
      source: 'api-unreachable',
    });
  }, []);

  const resetStatus = useCallback(() => {
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online');
    setRateLimitCountdown(0);
    setRateLimitAttempt(0);
  }, []);

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      status,
      isOnline: status === 'online',
      isOffline: status === 'offline',
      isRateLimited: status === 'rateLimited',
      isUnreachable: status === 'unreachable',
      rateLimitCountdown,
      triggerRateLimit,
      triggerUnreachable,
      resetStatus,
    }),
    [status, rateLimitCountdown, triggerRateLimit, triggerUnreachable, resetStatus]
  );

  return (
    <ConnectivityContext.Provider value={value}>
      {/* Banner thông báo trạng thái kết nối nhẹ nhàng (Accessible Banner) */}
      {status === 'offline' && (
        <div
          role="status"
          aria-live="polite"
          className="bg-slate-800 text-slate-100 text-xs px-4 py-2 flex items-center justify-center gap-2 border-b border-slate-700 shadow-xs z-50 sticky top-0"
        >
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span>Đang offline. Bản ghi của bạn đã được lưu nháp trên thiết bị và chưa được gửi.</span>
        </div>
      )}

      {status === 'rateLimited' && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white text-xs px-4 py-2 flex items-center justify-center gap-2 border-b border-amber-700 shadow-xs z-50 sticky top-0"
        >
          <Clock className="w-4 h-4 text-amber-200 shrink-0 animate-pulse" aria-hidden="true" />
          {rateLimitCountdown > 0 ? (
            <span>Bạn thao tác hơi nhanh. Sẽ thử lại sau {rateLimitCountdown} giây.</span>
          ) : (
            <div className="flex items-center gap-2">
              <span>Hệ thống đang bận. Bạn có thể thử lại sau ít phút.</span>
              <button
                type="button"
                onClick={resetStatus}
                className="underline hover:text-amber-100 font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white rounded px-1"
              >
                Thử lại ngay
              </button>
            </div>
          )}
        </div>
      )}

      {status === 'unreachable' && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-slate-700 text-slate-200 text-xs px-4 py-2 flex items-center justify-center gap-2 border-b border-slate-600 shadow-xs z-50 sticky top-0"
        >
          <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
          <span>Không thể kết nối tới máy chủ. Dữ liệu đọc trong bộ nhớ vẫn khả dụng.</span>
          <button
            type="button"
            onClick={resetStatus}
            className="underline hover:text-white font-semibold ml-2 focus-visible:outline-none"
          >
            Thử kết nối lại
          </button>
        </div>
      )}

      {children}
    </ConnectivityContext.Provider>
  );
};

const defaultConnectivityValue: ConnectivityContextValue = {
  status: 'online',
  isOnline: true,
  isOffline: false,
  isRateLimited: false,
  isUnreachable: false,
  rateLimitCountdown: 0,
  triggerRateLimit: () => {},
  triggerUnreachable: () => {},
  resetStatus: () => {},
};

export function useConnectivity(): ConnectivityContextValue {
  const context = useContext(ConnectivityContext);
  return context || defaultConnectivityValue;
}
