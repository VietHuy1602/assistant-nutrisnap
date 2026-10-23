/**
 * src/frontend/src/components/dev/ApiStatusBadge.tsx
 * Huy hiệu giám sát tình trạng API chỉ hiển thị trong môi trường phát triển (DEV-only, Step 6).
 * Định kỳ gọi GET /health mỗi 15 s và khi online; tự động bị loại bỏ khỏi bản production.
 */

import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { getContractMode } from '../../api/parseResponse';

export const ApiStatusBadge: React.FC = () => {
  if (!import.meta.env.DEV) {
    return null;
  }

  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const contractMode = getContractMode();

  useEffect(() => {
    let ignore = false;

    const checkHealth = async () => {
      try {
        await apiClient.get('/health', { timeout: 3000 });
        if (!ignore) setStatus('online');
      } catch {
        if (!ignore) setStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);

    const handleOnline = () => checkHealth();
    window.addEventListener('online', handleOnline);

    return () => {
      ignore = true;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const badgeConfig = {
    checking: {
      bg: 'bg-slate-100 text-slate-600 border-slate-300',
      label: 'API: checking…',
    },
    online: {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      label: contractMode === 'warn' ? 'API: online ✓ (warn)' : 'API: online ✓',
    },
    offline: {
      bg: 'bg-red-50 text-red-700 border-red-300',
      label: 'API: offline ✗',
    },
  }[status];

  return (
    <aside
      aria-hidden="true"
      className={`fixed bottom-2 right-2 z-50 px-2 py-0.5 rounded text-[11px] font-mono font-medium border shadow-xs pointer-events-none select-none transition-colors ${badgeConfig.bg}`}
    >
      {badgeConfig.label}
    </aside>
  );
};
