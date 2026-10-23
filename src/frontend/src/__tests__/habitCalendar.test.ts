import { describe, expect, it } from 'vitest';
import { daysInMonth, mondayOffset, monthDates, monthGrid, normalizeDays, shiftMonth, validDate } from '../utils/habitCalendar';
describe('Habit calendar — pure calendar dates', () => {
  it.each([[2026, 2, 28], [2024, 2, 29], [2000, 2, 29], [2100, 2, 28], [2026, 4, 30], [2026, 1, 31]])('counts %s/%s correctly', (year, month, count) => {
    expect(daysInMonth({ year, month })).toBe(count);
    expect(monthDates({ year, month })).toHaveLength(count);
    expect(monthGrid({ year, month }).flat().filter(Boolean)).toEqual(monthDates({ year, month }));
  });
  it('aligns Monday first, including a six-week month', () => {
    expect(mondayOffset({ year: 2026, month: 6 })).toBe(0);
    expect(mondayOffset({ year: 2026, month: 2 })).toBe(6);
    expect(monthGrid({ year: 2026, month: 3 })).toHaveLength(6);
    expect(monthGrid({ year: 2026, month: 2 })[0]).toEqual([null, null, null, null, null, null, '2026-02-01']);
  });
  it('navigates years and guards supported year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 1, month: 1 }, -1)).toBeNull();
    expect(shiftMonth({ year: 9999, month: 12 }, 1)).toBeNull();
  });
  it.each(['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-1-01', '0000-01-01', '2026-01-01T00:00:00Z'])('rejects invalid date %s', date => expect(validDate(date)).toBe(false));
  it('accepts real date-only strings independently of device time', () => {
    expect(validDate('2024-02-29')).toBe(true);
    expect(validDate('0001-01-01')).toBe(true);
    expect(monthDates({ year: 1, month: 1 })[0]).toBe('0001-01-01');
    expect(monthGrid({ year: 2026, month: 0 })).toEqual([]);
  });
  it('marks duplicates as error and discards malformed/out-of-month dates', () => {
    const { days, invalid } = normalizeDays({ year: 2026, month: 2 }, [
      { date: '2026-02-01', state: 'completed', description: 'Confirmed fixture' },
      { date: '2026-02-01', state: 'unconfirmed' },
      { date: '2026-03-01', state: 'completed', description: 'Outside' },
      { date: '2026-02-30', state: 'completed', description: 'Invalid' },
    ]);
    expect(invalid).toBe(true); expect(days.size).toBe(1);
    expect(days.get('2026-02-01')?.state).toBe('error');
  });
});
