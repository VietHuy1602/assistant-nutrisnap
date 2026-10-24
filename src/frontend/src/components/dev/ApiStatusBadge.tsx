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
  const [aiLive, setAiLive] = useState<boolean>(false);
  const contractMode = getContractMode();

  useEffect(() => {
    let ignore = false;

    const checkHealth = async () => {
      try {
        const res = await apiClient.get<{
          status?: string;
          ai_provider?: string;
          ai_live?: boolean;
          success?: boolean;
        }>('/health', { timeout: 3000 });
        let assistantMode = 'fallback';
        try {
          const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api/v1';
          const base = rawBase.endsWith('/api/v1') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api/v1`;
          const aRes = await fetch(`${base}/assistant/health`, { signal: AbortSignal.timeout(3000) });
          const aData = await aRes.json();
          if (aData?.mode === 'live') {
            assistantMode = 'live';
          }
        } catch {
          // fallback
        }
        if (!ignore) {
          setStatus('online');
          if (assistantMode === 'live' || res.data?.ai_live === true || import.meta.env.VITE_ENABLE_LIVE_AI === 'true') {
            setAiLive(true);
          } else {
            setAiLive(false);
          }
        }
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
      bg: aiLive ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-300',
      label: aiLive ? (contractMode === 'warn' ? 'AI trực tuyến ✓ (warn)' : 'AI trực tuyến ✓') : 'Chế độ cơ bản ⚠',
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
