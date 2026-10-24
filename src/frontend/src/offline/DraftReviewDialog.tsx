/**
 * src/frontend/src/offline/DraftReviewDialog.tsx
 * Hộp thoại duyệt và xác nhận đồng bộ bản nháp ngoại tuyến (ADR-W6-02, ADR-W6-08).
 * RÀNG BUỘC AN TOÀN (S8, M6, AS-6):
 * - TUYỆT ĐỐI KHÔNG tự động ghi CSDL khi online nếu chưa có người dùng bấm xác nhận.
 * - Cho phép người dùng duyệt từng bữa ăn, kiểm tra nhật ký hôm nay để tránh ghi đè/trùng.
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, Calendar, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import { draftStore } from '../storage/draftStore';
import type { DecryptedDraft } from '../storage/draftTypes';
import { mealApi } from '../api/mealApi';
import { appBus } from '../app/appBus';

export interface DraftReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckTodayMeals?: () => void;
}

export const DraftReviewDialog: React.FC<DraftReviewDialogProps> = ({
  isOpen,
  onClose,
  onCheckTodayMeals,
}) => {
  const [drafts, setDrafts] = useState<DecryptedDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; msg: string; type: 'success' | 'error' } | null>(null);

  const loadDrafts = async () => {
    setIsLoading(true);
    try {
      const list = await draftStore.listDrafts();
      setDrafts(list);
    } catch {
      setDrafts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadDrafts();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncDraft = async (draft: DecryptedDraft) => {
    setSyncingId(draft.id);
    setFeedback(null);

    const validItems = draft.payload.items
      .filter((it) => it.name && it.grams > 0)
      .map((it) => ({
        food_id: it.foodId ?? null,
        food_name: it.name,
        estimated_gram: it.grams,
      }));

    if (validItems.length === 0) {
      setFeedback({ id: draft.id, msg: 'Bản nháp không có món ăn hợp lệ.', type: 'error' });
      setSyncingId(null);
      return;
    }

    try {
      await mealApi.logMeal({
        meal_type: draft.payload.mealType,
        items: validItems,
        image_path: null,
      });

      // Xóa bản nháp sau khi đã gửi thành công
      await draftStore.deleteDraft(draft.id);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));

      // Phát sự kiện toàn cục để làm mới màn hình
      appBus.emit({
        type: 'meal-logged',
        at: Date.now(),
        source: 'offline-sync',
      });

      setFeedback({ id: draft.id, msg: 'Đã lưu bữa ăn vào nhật ký thành công!', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu bản nháp. Vui lòng thử lại.';
      setFeedback({ id: draft.id, msg, type: 'error' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      await draftStore.deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
  };

  const formatMealTypeName = (type: string) => {
    switch (type.toLowerCase()) {
      case 'breakfast':
        return 'Bữa sáng';
      case 'lunch':
        return 'Bữa trưa';
      case 'dinner':
        return 'Bữa tối';
      case 'snack':
        return 'Bữa phụ';
      default:
        return type;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            <h2 id="draft-dialog-title" className="text-base font-bold text-slate-900">
              Bản nháp bữa ăn ngoại tuyến
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Bảo vệ chống trùng lặp dữ liệu:</p>
              <p className="mt-0.5 text-amber-800">
                NutriSnap không tự động ghi dữ liệu vào CSDL khi có mạng lại. Bạn vui lòng xem lại từng
                bữa và bấm nút xác nhận lưu bên dưới.
              </p>
              {onCheckTodayMeals && (
                <button
                  type="button"
                  onClick={onCheckTodayMeals}
                  className="mt-2 inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Kiểm tra Nhật ký hôm nay trước khi lưu</span>
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-500">Đang tải bản nháp…</div>
          ) : drafts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Không có bản nháp ngoại tuyến nào đang chờ duyệt.
            </div>
          ) : (
            drafts.map((d) => {
              const isSyncing = syncingId === d.id;
              const savedDate = new Date(d.createdAt).toLocaleString('vi-VN');

              return (
                <div
                  key={d.id}
                  className="p-4 border border-slate-200 rounded-2xl bg-white shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {formatMealTypeName(d.payload.mealType)}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-2">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {savedDate}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => handleDeleteDraft(d.id)}
                      title="Bỏ bản nháp này"
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors focus-visible:outline-none"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Danh sách món ăn */}
                  <ul className="divide-y divide-slate-100 text-xs">
                    {d.payload.items.map((it, idx) => (
                      <li key={idx} className="py-1.5 flex justify-between text-slate-700">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-slate-500">{it.grams}g</span>
                      </li>
                    ))}
                  </ul>

                  {/* Feedback msg */}
                  {feedback && feedback.id === d.id && (
                    <p
                      className={`text-xs ${
                        feedback.type === 'success' ? 'text-emerald-700 font-medium' : 'text-amber-800'
                      }`}
                    >
                      {feedback.msg}
                    </p>
                  )}

                  {/* Thao tác xác nhận */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => handleSyncDraft(d)}
                      className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 bg-nutri-primary hover:bg-nutri-dark text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSyncing ? 'Đang gửi…' : 'Xác nhận lưu vào CSDL'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
