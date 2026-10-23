/**
 * src/frontend/src/utils/format.ts
 * Number & text formatting helpers for Vietnamese locale (vi-VN).
 */

export function formatKcal(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0';
  return Math.round(val).toLocaleString('vi-VN');
}

export function formatGram(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0g';
  const rounded = Number(val.toFixed(1));
  return `${rounded.toLocaleString('vi-VN')}g`;
}

export function formatVND(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0 đ';
  return `${Math.round(val).toLocaleString('vi-VN')} đ`;
}

export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0%';
  return `${Math.round(val)}%`;
}
