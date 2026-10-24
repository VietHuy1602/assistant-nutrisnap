/**
 * src/frontend/src/offline/DraftBanner.tsx
 * Banner thông báo khi có bản nháp ngoại tuyến chưa lưu (ADR-W6-02, ADR-W6-08).
 */

import React, { useState, useEffect } from 'react';
import { Database, ArrowRight } from 'lucide-react';
import { draftStore } from '../storage/draftStore';
import { useConnectivity } from '../app/ConnectivityProvider';
import { appBus } from '../app/appBus';
import { DraftReviewDialog } from './DraftReviewDialog';

export const DraftBanner: React.FC = () => {
  const { isOnline } = useConnectivity();
  const [draftCount, setDraftCount] = useState<number>(0);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  const checkCount = async () => {
    try {
      const count = await draftStore.countDrafts();
      setDraftCount(count);
    } catch {
      setDraftCount(0);
    }
  };

  useEffect(() => {
    void checkCount();
    const unsubMeal = appBus.on('meal-logged', () => void checkCount());
    const unsubDraft = appBus.on('offline-draft-synced', () => void checkCount());

    return () => {
      unsubMeal();
      unsubDraft();
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      void checkCount();
    }
  }, [isOnline]);

  if (!isOnline || draftCount <= 0) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="w-full bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex items-center justify-between text-xs text-emerald-950 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>
            Bạn có <strong>{draftCount} bản nháp bữa ăn</strong> đã lưu ngoại tuyến trên thiết bị.
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus rounded-lg px-2"
        >
          <span>Xem và lưu vào CSDL</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <DraftReviewDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          void checkCount();
        }}
      />
    </>
  );
};
