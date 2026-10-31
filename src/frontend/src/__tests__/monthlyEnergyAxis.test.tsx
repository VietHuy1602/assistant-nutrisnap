import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthlyEnergyChart } from '../pages/MonthlyReportPage';

const chartDataSpy = vi.hoisted(() => vi.fn());
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return { ...actual, LineChart: (props: React.ComponentProps<typeof actual.LineChart>) => {
    chartDataSpy(props.data);
    return <actual.LineChart {...props} />;
  }, ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
    React.cloneElement(children, { width: 1200, height: 256 } as React.Attributes) };
});

describe('Monthly energy calendar-axis presentation', () => {
  afterEach(cleanup);
  it.each([['2026-02', 28], ['2026-04', 30], ['2026-10', 31]] as const)(
    'renders every day of %s without adding nutrition points', (monthKey, count) => {
      // Existing MonthlyReportPage fixture calorie values; only two supplied observations.
      const data = [{ day: 1, date: `${monthKey}-01`, calories: 2050 }, { day: 2, date: `${monthKey}-02`, calories: 1950 }];
      const original = JSON.stringify(data);
      const view = render(<MonthlyEnergyChart monthKey={monthKey} chartData={data} />);
      expect(Array.from(view.container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')).map(node => node.textContent)).toEqual(
        Array.from({ length: count }, (_, i) => `N${i + 1}`),
      );
      expect(chartDataSpy).toHaveBeenLastCalledWith(data);
      expect(JSON.stringify(data)).toBe(original);
      expect(screen.getByRole('region', { name: /có thể cuộn ngang/ })).toHaveAttribute('tabindex', '0');
    },
  );
});
