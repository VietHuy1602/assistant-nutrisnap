import type { CalendarMonth, HabitDay } from '../types/habit';

export function validMonth(value: CalendarMonth): boolean {
  return !!value && Number.isInteger(value.year) && value.year >= 1 && value.year <= 9999 && Number.isInteger(value.month) && value.month >= 1 && value.month <= 12;
}
export function daysInMonth({ year, month }: CalendarMonth): number {
  if (!validMonth({ year, month })) return 0;
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return validMonth({ year, month }) && day >= 1 && day <= daysInMonth({ year, month });
}
export function shiftMonth(value: CalendarMonth, offset: -1 | 1): CalendarMonth | null {
  if (!validMonth(value)) return null;
  const index = (value.year - 1) * 12 + value.month - 1 + offset;
  if (index < 0 || index >= 9999 * 12) return null;
  return { year: Math.floor(index / 12) + 1, month: index % 12 + 1 };
}
export function monthDates(month: CalendarMonth): string[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
// Gregorian arithmetic on calendar components, not timestamp/time-zone conversion.
export function mondayOffset({ year, month }: CalendarMonth): number {
  if (!validMonth({ year, month })) return 0;
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const sundayIndex = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offsets[month - 1] + 1) % 7;
  return (sundayIndex + 6) % 7;
}
export function monthGrid(month: CalendarMonth): (string | null)[][] {
  const dates = monthDates(month);
  if (!dates.length) return [];
  const cells: (string | null)[] = [...Array(mondayOffset(month)).fill(null), ...dates];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
export function normalizeDays(month: CalendarMonth, days: readonly HabitDay[]) {
  const allowed = new Set(monthDates(month));
  const result = new Map<string, HabitDay>();
  let invalid = false;
  for (const day of days) {
    if (!day || !validDate(day.date) || !allowed.has(day.date)) { invalid = true; continue; }
    if (result.has(day.date)) {
      invalid = true;
      result.set(day.date, { date: day.date, state: 'error', message: 'Thông tin ngày bị trùng; chưa thể xác minh.' });
    } else result.set(day.date, day);
  }
  return { days: result, invalid };
}
