import { describe, expect, it } from 'vitest';
import { nutritionValue, prepareReportRows, reportMonthLength, validReportDate } from '../utils/monthlyReport';
import type { MonthlyReportData } from '../types/monthlyReport';

describe('monthly report presentation helpers', () => {
  it.each([['2025-02', 28], ['2024-02', 29], ['2000-02', 29], ['2100-02', 28], ['2026-04', 30], ['2026-12', 31]])('supports %s (%i days)', (month, length) => {
    expect(reportMonthLength(month)).toBe(length);
  });
  it('rejects malformed and impossible civil dates without UTC parsing', () => {
    for (const month of ['0000-01', '2026-13', '2026-2', '2026-00', 'bad']) expect(reportMonthLength(month)).toBe(0);
    for (const date of ['2025-02-29', '2026-04-31', '2026-01-00', '2026-01-01T00:00:00Z', '2026-1-01']) expect(validReportDate(date)).toBe(false);
    expect(validReportDate('2024-02-29')).toBe(true);
    expect(prepareReportRows('2026-02', 'bad')).toEqual([]);
  });
  it('preserves supplied zero, leaves missing values null, and never totals nutrition', () => {
    const rows = prepareReportRows('2026-02', '2026-03-01', { month: '2026-02', source: 'demo', days: [
      { date: '2026-02-01', state: 'available', calories: 0, proteinG: 12 },
    ] });
    expect(rows[0]).toMatchObject({ date: '2026-02-01', calories: 0, proteinG: 12, carbsG: null });
    expect(rows[1]).toMatchObject({ state: 'unavailable', calories: null });
  });
  it('quarantines duplicates, ignores invalid/out-of-month records, and overrides future records', () => {
    const data: MonthlyReportData = { month: '2026-02', source: 'verified', days: [
      { date: '2026-02-01', state: 'available', calories: 100 },
      { date: '2026-02-01', state: 'available', calories: 200 },
      { date: '2026-02-02', state: 'error', calories: 300 },
      { date: '2026-02-03', state: 'available', calories: 400 },
      { date: '2026-02-30', state: 'available', calories: 999 },
      { date: '2026-03-01', state: 'available', calories: 999 },
    ] };
    const rows = prepareReportRows('2026-02', '2026-02-02', data);
    expect(rows).toHaveLength(28);
    expect(rows[0]).toMatchObject({ state: 'invalid', calories: null });
    expect(rows[1]).toMatchObject({ state: 'error', calories: null });
    expect(rows[2]).toMatchObject({ state: 'future', calories: null });
  });
  it('rejects malformed nutrition instead of coercing it to zero', () => {
    for (const value of [NaN, Infinity, -1, '20', null, undefined, [], {}]) expect(nutritionValue(value)).toBeNull();
    expect(nutritionValue(0)).toBe(0);
    expect(nutritionValue(123.45)).toBe(123.45);
  });
  it('does not reuse data from another month', () => {
    const rows = prepareReportRows('2027-01', '2027-02-01', { month: '2026-12', source: 'demo', days: [{ date: '2026-12-01', state: 'available', calories: 123 }] });
    expect(rows).toHaveLength(31);
    expect(rows.every(row => row.calories === null && row.state === 'unavailable')).toBe(true);
  });
});
