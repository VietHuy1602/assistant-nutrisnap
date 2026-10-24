/**
 * src/frontend/src/__tests__/ProgressAnalyticsPage.test.tsx
 * Unit & integration tests for ProgressAnalyticsPage, PatternInsightsPanel, and PatternInsightCard.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PatternInsightCard } from '../components/analytics/PatternInsightCard';
import { PatternInsightsPanel } from '../components/analytics/PatternInsightsPanel';
import { ProgressAnalyticsPage } from '../pages/ProgressAnalyticsPage';
import { progressApi } from '../api/progressApi';
import type { NormalizedPatternInsights } from '../api/progressContract';

// Mock Recharts
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

describe('PatternInsightCard', () => {
  it('renders title, severity badge, and actionable recommendation', () => {
    render(
      <PatternInsightCard
        insight={{
          pattern_code: 'LATE_NIGHT_SNACK',
          title: 'Ăn khuya thường xuyên',
          severity: 'warning',
          recommendation: 'Nên ăn tối trước 19h để hỗ trợ tiêu hóa tốt hơn.',
        }}
      />
    );

    expect(screen.getByText('Ăn khuya thường xuyên')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText(/Nên ăn tối trước 19h/i)).toBeInTheDocument();
  });
});

describe('PatternInsightsPanel', () => {
  it('renders loading skeleton when loading=true', () => {
    render(<PatternInsightsPanel data={null} loading={true} />);
    expect(screen.getByLabelText(/Đang phân tích thói quen/i)).toBeInTheDocument();
  });

  it('renders insufficient data explanation when isSufficientData=false', () => {
    const insufficient: NormalizedPatternInsights = {
      status: 'insufficient_data',
      isSufficientData: false,
      loggedDaysCount: 3,
      minimumRequiredDays: 5,
      patterns: [],
      lockedDailyTargetCalories: null,
      message: 'Cần ghi chép thêm 2 ngày nữa.',
      warnings: [],
    };
    render(<PatternInsightsPanel data={insufficient} loading={false} />);
    expect(screen.getByText('Cần thêm dữ liệu ghi chép')).toBeInTheDocument();
    expect(screen.getByText('Cần ghi chép thêm 2 ngày nữa.')).toBeInTheDocument();
  });

  it('renders pattern cards when isSufficientData=true and displays locked target calories', () => {
    const analyzed: NormalizedPatternInsights = {
      status: 'analyzed',
      isSufficientData: true,
      loggedDaysCount: 14,
      minimumRequiredDays: 5,
      lockedDailyTargetCalories: 2100,
      patterns: [
        {
          pattern_code: 'WEEKEND_SURGE',
          title: 'Năng lượng cuối tuần tăng nhẹ',
          severity: 'info',
          recommendation: 'Duy trì cân bằng bữa ăn vào ngày nghỉ.',
        },
      ],
      warnings: [],
    };
    render(<PatternInsightsPanel data={analyzed} loading={false} />);
    expect(screen.getByText('Nhận diện Thói quen & Xu hướng')).toBeInTheDocument();
    expect(screen.getByText(/Mục tiêu an toàn: 2100 kcal/i)).toBeInTheDocument();
    expect(screen.getByText('Năng lượng cuối tuần tăng nhẹ')).toBeInTheDocument();
  });
});

describe('ProgressAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(progressApi, 'getWeightSeries').mockResolvedValue({
      points: [
        { date: '2026-10-18', weight_kg: 68.5, ema_weight: null },
        { date: '2026-10-19', weight_kg: 68.2, ema_weight: null },
      ],
      pointsCount: 2,
      latestWeightKg: 68.2,
      latestEmaKg: null,
      startWeightKg: 68.5,
      rawChangeKg: -0.3,
      emaChangeKg: null,
      disclaimer: 'Dữ liệu tham khảo',
      warnings: [],
    });

    vi.spyOn(progressApi, 'getWeeklyCalories').mockResolvedValue({
      bars: [
        { dateKey: '2026-10-18', label: '18/10', calories: 2000, daysLogged: 1 },
      ],
      targetCalories: 2000,
      mode: 'dailyFallback',
      warnings: [],
    });

    vi.spyOn(progressApi, 'getPatternInsights').mockResolvedValue({
      status: 'insufficient_data',
      isSufficientData: false,
      loggedDaysCount: 2,
      minimumRequiredDays: 5,
      patterns: [],
      lockedDailyTargetCalories: null,
      warnings: [],
    });

    vi.spyOn(progressApi, 'logWeight').mockResolvedValue({ ok: true });
  });

  it('renders page header and privacy mask toggle', async () => {
    render(<ProgressAnalyticsPage />);

    expect(screen.getByRole('heading', { name: 'Tiến độ & Xu hướng' })).toBeInTheDocument();
    const maskButton = screen.getByRole('button', { name: /Ẩn số cân nặng/i });
    expect(maskButton).toBeInTheDocument();

    fireEvent.click(maskButton);
    expect(screen.getByRole('button', { name: /Hiện số cân nặng/i })).toBeInTheDocument();
  });

  it('opens weight log modal and submits successfully', async () => {
    render(<ProgressAnalyticsPage />);

    const openBtn = screen.getByRole('button', { name: /Ghi nhận cân nặng/i });
    fireEvent.click(openBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Ghi nhận cân nặng', { selector: '#log-weight-dialog-title' })).toBeInTheDocument();

    const input = screen.getByLabelText(/Cân nặng thực tế/i);
    fireEvent.change(input, { target: { value: '67.8' } });

    const submitBtn = screen.getByRole('button', { name: 'Lưu cân nặng' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(progressApi.logWeight).toHaveBeenCalledWith(67.8);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('validates invalid weight before submitting', async () => {
    render(<ProgressAnalyticsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Ghi nhận cân nặng/i }));
    const input = screen.getByLabelText(/Cân nặng thực tế/i);
    fireEvent.change(input, { target: { value: '500' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cân nặng' }));
    expect(progressApi.logWeight).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Vui lòng nhập cân nặng hợp lệ/i);
  });
});
