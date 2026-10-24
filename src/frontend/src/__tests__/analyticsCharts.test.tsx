/**
 * src/frontend/src/__tests__/analyticsCharts.test.tsx
 * Unit & component tests for Recharts charts, table views, status chips and range selector.
 * Covers Mode A (EMA unavailable), Mode B (EMA available), accessibility, masking, and fallbacks.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeightTrendChart } from '../components/analytics/WeightTrendChart';
import { WeeklyCaloriesChart } from '../components/analytics/WeeklyCaloriesChart';
import { ChartDataTable } from '../components/analytics/ChartDataTable';
import { RangeSelector } from '../components/analytics/RangeSelector';
import { TrendStatusChip } from '../components/analytics/TrendStatusChip';
import { ChartCard } from '../components/analytics/ChartCard';
import type { WeightPoint, NormalizedCalorieBars } from '../api/progressContract';

// Mock Recharts ResponsiveContainer to render in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 400 }}>
        {React.isValidElement(children)
          ? React.cloneElement(children, {
              // @ts-expect-error recharts chart props
              width: 800,
              height: 400,
            })
          : children}
      </div>
    ),
  };
});

describe('WeightTrendChart', () => {
  const samplePoints: WeightPoint[] = [
    { date: '2026-10-18', weight_kg: 68.5, ema_weight: null },
    { date: '2026-10-19', weight_kg: 68.2, ema_weight: null },
    { date: '2026-10-20', weight_kg: 68.0, ema_weight: null },
  ];

  it('renders empty placeholder when points array is empty', () => {
    render(<WeightTrendChart points={[]} status="unavailable" />);
    expect(screen.getByRole('status')).toHaveTextContent(/Chưa có dữ liệu cân nặng/);
  });

  it('in Mode A (status: unavailable), aria-label warns EMA is pending and chart is rendered', () => {
    const { container } = render(
      <WeightTrendChart points={samplePoints} status="unavailable" />
    );
    const chartWrapper = container.querySelector('[role="img"]');
    expect(chartWrapper).toBeInTheDocument();
    expect(chartWrapper?.getAttribute('aria-label')).toContain('Đường xu hướng EMA đang chờ hệ thống tính');
    
    // In Mode A, legend only contains "Cân nặng ghi nhận"
    expect(screen.getByText('Cân nặng ghi nhận')).toBeInTheDocument();
    expect(screen.queryByText('Xu hướng EMA (tham khảo)')).not.toBeInTheDocument();
  });

  it('in Mode B (status: available), renders both actual weight and EMA trend legends', () => {
    const pointsWithEma: WeightPoint[] = [
      { date: '2026-10-18', weight_kg: 68.5, ema_weight: 68.5 },
      { date: '2026-10-19', weight_kg: 68.2, ema_weight: 68.35 },
    ];
    render(<WeightTrendChart points={pointsWithEma} status="available" />);
    expect(screen.getByText('Cân nặng ghi nhận')).toBeInTheDocument();
    expect(screen.getByText('Xu hướng EMA (tham khảo)')).toBeInTheDocument();
  });

  it('handles privacy masking correctly', () => {
    render(<WeightTrendChart points={samplePoints} status="unavailable" masked={true} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});

describe('WeeklyCaloriesChart', () => {
  it('renders empty placeholder when bars array is empty', () => {
    const emptyData: NormalizedCalorieBars = {
      bars: [],
      targetCalories: 2000,
      mode: 'dailyFallback',
      warnings: [],
    };
    render(<WeeklyCaloriesChart data={emptyData} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Chưa có dữ liệu nhật ký/);
  });

  it('renders dailyFallback disclaimer message in dailyFallback mode', () => {
    const fallbackData: NormalizedCalorieBars = {
      bars: [
        { dateKey: '2026-10-20', label: '20/10', calories: 1950, daysLogged: 1 },
        { dateKey: '2026-10-21', label: '21/10', calories: 2100, daysLogged: 1 },
      ],
      targetCalories: 2000,
      mode: 'dailyFallback',
      warnings: [],
    };
    render(<WeeklyCaloriesChart data={fallbackData} />);
    expect(screen.getByText(/Chưa có số liệu tổng hợp theo tuần/i)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Biểu đồ cột calo từng ngày cho 2 ngày')
    );
  });

  it('renders weekly chart without daily fallback disclaimer in weekly mode', () => {
    const weeklyData: NormalizedCalorieBars = {
      bars: [
        { dateKey: '2026-W41', label: '05/10 - 11/10', calories: 1980, daysLogged: 7 },
        { dateKey: '2026-W42', label: '12/10 - 18/10', calories: 2050, daysLogged: 7 },
      ],
      targetCalories: 2000,
      mode: 'weekly',
      warnings: [],
    };
    render(<WeeklyCaloriesChart data={weeklyData} />);
    expect(screen.queryByText(/Chưa có số liệu tổng hợp theo tuần/i)).not.toBeInTheDocument();
  });
});

describe('ChartDataTable', () => {
  it('renders weight data table with formatKg', () => {
    const points: WeightPoint[] = [
      { date: '2026-10-20', weight_kg: 65.5, ema_weight: 65.4 },
      { date: '2026-10-21', weight_kg: 65.2, ema_weight: null },
    ];
    render(<ChartDataTable type="weight" points={points} />);
    expect(screen.getByText('20/10')).toBeInTheDocument();
    expect(screen.getByText('65,5 kg')).toBeInTheDocument();
    expect(screen.getByText('65,4 kg')).toBeInTheDocument();
    expect(screen.getByText('21/10')).toBeInTheDocument();
    expect(screen.getByText('65,2 kg')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('masks values when masked=true', () => {
    const points: WeightPoint[] = [
      { date: '2026-10-20', weight_kg: 65.5, ema_weight: 65.4 },
    ];
    render(<ChartDataTable type="weight" points={points} masked={true} />);
    const maskedCells = screen.getAllByText('•••');
    expect(maskedCells.length).toBe(2);
  });

  it('renders calories data table with formatKcal', () => {
    const bars = [
      { dateKey: '2026-10-20', label: '20/10', calories: 2050, daysLogged: 1 },
    ];
    render(<ChartDataTable type="calories" bars={bars} />);
    expect(screen.getByText('20/10')).toBeInTheDocument();
    expect(screen.getByText('2.050 kcal')).toBeInTheDocument();
    expect(screen.getByText('1 ngày')).toBeInTheDocument();
  });

  it('renders empty table message when data is empty', () => {
    render(<ChartDataTable type="weight" points={[]} />);
    expect(screen.getByText(/Chưa có dữ liệu trong khoảng này/i)).toBeInTheDocument();
  });
});

describe('RangeSelector', () => {
  it('renders 4 ranges: 7, 14, 30, 90 ngày', () => {
    const onChange = vi.fn();
    render(<RangeSelector value={14} onChange={onChange} />);

    expect(screen.getByRole('radio', { name: '7 ngày' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '14 ngày' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 ngày' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '90 ngày' })).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: '14 ngày' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 ngày' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: '30 ngày' }));
    expect(onChange).toHaveBeenCalledWith(30);
  });
});

describe('TrendStatusChip', () => {
  it('renders nothing when status is available', () => {
    const { container } = render(<TrendStatusChip status="available" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Đường xu hướng đang chờ hệ thống tính" when unavailable', () => {
    render(<TrendStatusChip status="unavailable" />);
    expect(screen.getByText('Đường xu hướng đang chờ hệ thống tính')).toBeInTheDocument();
  });

  it('renders "Một số ngày chưa có xu hướng" when partial', () => {
    render(<TrendStatusChip status="partial" />);
    expect(screen.getByText('Một số ngày chưa có xu hướng')).toBeInTheDocument();
  });
});

describe('ChartCard', () => {
  it('toggles between chart view and table view', () => {
    render(
      <ChartCard
        title="Tiến độ cân nặng"
        disclaimer="Dữ liệu tham khảo"
        tableComponent={<div data-testid="test-table">Table Content</div>}
      >
        <div data-testid="test-chart">Chart Content</div>
      </ChartCard>
    );

    expect(screen.getByTestId('test-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('test-table')).not.toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: /Xem dạng bảng/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('test-table')).toBeInTheDocument();
    expect(screen.queryByTestId('test-chart')).not.toBeInTheDocument();
    expect(screen.getByText('Dữ liệu tham khảo')).toBeInTheDocument();
  });
});
