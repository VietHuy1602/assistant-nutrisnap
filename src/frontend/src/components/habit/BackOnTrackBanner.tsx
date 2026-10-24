/**
 * src/frontend/src/components/habit/BackOnTrackBanner.tsx
 * Chế độ "Quay lại đường đua" không phạt lỗi (Non-punitive Mode — ADR-W6-11).
 * RÀNG BUỘC NGHIÊM NGẶT (S7, N10):
 * Tuyệt đối không dùng màu đỏ, biểu tượng cảnh báo, hoặc ngôn từ trách móc.
 */

import React from 'react';
import { Sparkles, HeartHandshake, ShieldCheck } from 'lucide-react';
import type { BackOnTrack } from '../../api/habitContract';

interface BackOnTrackBannerProps {
  backOnTrack: BackOnTrack;
}

export const BackOnTrackBanner: React.FC<BackOnTrackBannerProps> = ({ backOnTrack }) => {
  const isBackOnTrack = backOnTrack.active;

  return (
    <div
      role="status"
      className={`rounded-2xl p-5 shadow-xs border flex flex-col justify-between transition-colors ${
        isBackOnTrack
          ? 'bg-amber-50/70 border-amber-200 text-amber-950'
          : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <span
            className={`text-xs uppercase font-bold tracking-wider ${
              isBackOnTrack ? 'text-amber-800' : 'text-emerald-800'
            }`}
          >
            {isBackOnTrack ? 'Quay lại đường đua' : 'Trạng thái phong độ'}
          </span>
          {isBackOnTrack ? (
            <HeartHandshake className="w-5 h-5 text-amber-600" aria-hidden="true" />
          ) : (
            <Sparkles className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          )}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-slate-700">
          {backOnTrack.encouragementMessage}
        </p>
        <div className="mt-3 p-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-xs text-slate-700 flex items-start gap-2">
          <span className="shrink-0" aria-hidden="true">
            💡
          </span>
          <div>
            <strong>Gợi ý nhỏ:</strong> {backOnTrack.suggestedMicroAction}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-200/40 text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>
          Khóa calo an toàn: Giữ nguyên mục tiêu ({backOnTrack.nextDayTargetCalories || 2000} kcal),
          không cắt giảm.
        </span>
      </div>
    </div>
  );
};
