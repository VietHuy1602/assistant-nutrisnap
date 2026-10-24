/**
 * src/frontend/src/utils/chartFormat.ts
 * String-based date and number formatters for charts without date timezone shifting.
 * ADR-W5-01 / Section 8 Step 2 of NS-FE-W5-001.
 */

/**
 * Format YYYY-MM-DD to DD/MM using pure string operations (no new Date to avoid timezone offset).
 */
export function formatDayMonth(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const clean = dateStr.trim().slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[1] && parts[2]) {
    return `${parts[2]}/${parts[1]}`;
  }
  return clean;
}

/**
 * Format label for a weekly bar chart column or period.
 */
export function formatWeekLabel(dateStr: string | null | undefined): string {
  const dm = formatDayMonth(dateStr);
  return dm ? `Tuần ${dm}` : 'Tuần';
}

/**
 * Format weight in kilograms (vi-VN locale, 1 decimal place).
 */
export function formatKg(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  // zero-math-ok: purely display number formatting with 1 decimal digit
  return `${Number(val.toFixed(1)).toLocaleString('vi-VN')} kg`;
}

/**
 * Format calories in kcal.
 */
export function formatKcal(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  // zero-math-ok: purely display number formatting with round
  return `${Math.round(val).toLocaleString('vi-VN')} kcal`;
}

/**
 * Format currency in VNĐ.
 */
export function formatVnd(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  // zero-math-ok: purely display number formatting with round
  return `${Math.round(val).toLocaleString('vi-VN')} VNĐ`;
}
