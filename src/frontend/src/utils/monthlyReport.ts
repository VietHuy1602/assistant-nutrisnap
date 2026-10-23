import type { MonthlyReportData, MonthlyReportDay } from '../types/monthlyReport';

export function reportMonthLength(month: string): number {
  if (typeof month !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) return 0;
  const [year, m] = month.split('-').map(Number);
  if (year < 1) return 0;
  if (m === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function validReportDate(date: string): boolean {
  if (typeof date !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return false;
  const day = Number(date.slice(8));
  return day >= 1 && day <= reportMonthLength(date.slice(0, 7));
}

export function nutritionValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export interface ReportRow {
  date: string;
  state: 'available' | 'unavailable' | 'error' | 'future' | 'invalid';
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export function prepareReportRows(month: string, today: string, data?: MonthlyReportData): ReportRow[] {
  if (!reportMonthLength(month) || !validReportDate(today)) return [];
  const records = new Map<string, MonthlyReportDay[]>();
  if (data?.month === month) {
    for (const day of data.days) {
      if (!day || !validReportDate(day.date) || !day.date.startsWith(`${month}-`)) continue;
      records.set(day.date, [...(records.get(day.date) ?? []), day]);
    }
  }
  return Array.from({ length: reportMonthLength(month) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const matches = records.get(date) ?? [];
    const day = matches[0];
    let state: ReportRow['state'] = 'unavailable';
    if (date > today) state = 'future';
    else if (matches.length > 1) state = 'invalid';
    else if (day && ['available', 'unavailable', 'error'].includes(day.state)) state = day.state;
    else if (day) state = 'invalid';
    const readable = state === 'available';
    return {
      date, state,
      calories: readable ? nutritionValue(day?.calories) : null,
      proteinG: readable ? nutritionValue(day?.proteinG) : null,
      carbsG: readable ? nutritionValue(day?.carbsG) : null,
      fatG: readable ? nutritionValue(day?.fatG) : null,
    };
  });
}
