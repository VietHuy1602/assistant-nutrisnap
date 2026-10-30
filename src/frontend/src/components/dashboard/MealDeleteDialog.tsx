import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { DailyDashboardMeal } from '../../types/api';
import { getMealTypeLabel } from '../../constants/copy';

interface Props {
  meal: DailyDashboardMeal;
  selectedDate: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MealDeleteDialog({ meal, selectedDate, pending, error, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const timestamp = meal.logged_at ? new Date(meal.logged_at) : null;
  const dateLabel = timestamp && !Number.isNaN(timestamp.getTime())
    ? timestamp.toLocaleString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : selectedDate.split('-').reverse().join('/');

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    cancelRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    // Disabled buttons cannot retain focus while the request is in flight.
    if (pending) dialogRef.current?.focus({ preventScroll: true });
    else if (error) cancelRef.current?.focus({ preventScroll: true });
  }, [pending, error]);

  return createPortal(
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-nutri-border bg-nutri-panel p-6 text-nutri-ink shadow-xl focus:outline-none backdrop:bg-slate-900/40"
    >
      <h2 id={titleId} className="text-xl font-bold">Xóa bữa ăn này?</h2>
      <div id={descriptionId} className="mt-3 space-y-2 text-sm leading-6">
        <p className="font-semibold">{getMealTypeLabel(meal.meal_type)} · {dateLabel}</p>
        <p className="break-words text-nutri-muted">
          {meal.items.length ? meal.items.map(item => item.food_name).join(', ') : `Bữa ăn #${meal.id}`}
        </p>
        <p>Bữa ăn sẽ bị xóa khỏi nhật ký. Thao tác này không thể hoàn tác.</p>
      </div>
      <div className="mt-4" aria-live="polite" aria-atomic="true">
        {pending && <p className="text-sm text-nutri-muted">Đang xóa bữa ăn… Vui lòng chờ.</p>}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-nutri-error">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button ref={cancelRef} type="button" disabled={pending} onClick={onCancel}
          className="min-h-12 min-w-12 rounded-xl border border-nutri-border px-4 py-2 text-sm font-semibold hover:bg-nutri-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
          {error ? 'Đóng' : 'Giữ lại bữa ăn'}
        </button>
        <button type="button" disabled={pending} onClick={onConfirm}
          className="min-h-12 min-w-12 rounded-xl bg-nutri-error px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-error focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
          {pending ? 'Đang xóa…' : error ? 'Thử xóa lại' : 'Xóa bữa ăn'}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
