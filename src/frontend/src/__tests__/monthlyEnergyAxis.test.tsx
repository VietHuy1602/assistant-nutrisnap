import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthlyEnergyChart } from '../pages/MonthlyReportPage';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 288 } as React.Attributes),
  };
});

describe('Monthly energy donut presentation', () => {
  afterEach(cleanup);
  it.each(['2026-02', '2026-04', '2026-10'])(
    'shows only the supplied days of %s without adding nutrition points', (monthKey) => {
      // Existing MonthlyReportPage fixture calorie values; only two supplied observations.
      const data = [
        { day: 1, date: `${monthKey}-01`, calories: 2050 },
        { day: 2, date: `${monthKey}-02`, calories: 1950 },
        { day: 3, date: `${monthKey}-03`, calories: null },
      ];
      const original = JSON.stringify(data);
      render(<MonthlyEnergyChart monthKey={monthKey} chartData={data} />);

      const legend = screen.getByRole('list', { name: 'Chú thích năng lượng theo kỳ' });
      const items = within(legend).getAllByRole('listitem').map((li) => li.textContent);
      expect(items).toEqual([`01/${monthKey.slice(5)}2.050 kcal`, `02/${monthKey.slice(5)}1.950 kcal`]);
      expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('2 ngày có dữ liệu'));
      expect(screen.queryByText(/Chưa có số liệu tổng hợp theo tuần/)).not.toBeInTheDocument();
      expect(JSON.stringify(data)).toBe(original);
    },
  );
});
