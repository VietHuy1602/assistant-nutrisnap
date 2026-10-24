import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MonthlyReportPage } from '../pages/MonthlyReportPage';
import { reportApi } from '../api/reportApi';
import type { MonthlyReport } from '../api/reportContract';

const mockReportData: MonthlyReport = {
  month: '2026-10',
  period: {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    periodDays: 31,
  },
  loggingSummary: {
    totalLoggedDays: 18,
    totalMealsLogged: 52,
    consistencyRatePct: 58.1,
    periodDays: 31,
  },
  weightSummary: {
    startWeightKg: 72.0,
    endWeightKg: 71.2,
    rawWeightChangeKg: -0.8,
    emaStartKg: 71.9,
    emaEndKg: 71.3,
    emaWeightChangeKg: -0.6,
    trendDirection: 'decreasing',
    recordsCount: 12,
  },
  nutritionSummary: {
    avgDailyCalories: 1980.5,
    avgProteinG: 115.0,
    avgCarbsG: 215.0,
    avgFatG: 50.0,
    targetTdeeCalories: 2000,
    targetProteinG: 120,
    targetCarbsG: 200,
    targetFatG: 50,
  },
  strengths: ['Duy trì thói quen ghi nhật ký ẩm thực (18 ngày).', 'Kiểm soát tổng năng lượng nạp vào.'],
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
  notices: [
    'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
    'Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo.',
    'Báo cáo không thay thế tư vấn y khoa.',
  ],
  insufficient: false,
  days: [
    { date: '2026-10-01', state: 'available', calories: 2050, proteinG: 120, carbsG: 220, fatG: 55 },
    { date: '2026-10-02', state: 'available', calories: 1950, proteinG: 110, carbsG: 210, fatG: 50 },
  ],
  summary: {
    totalCalories: 35649,
    averageDailyCalories: 1980.5,
  },
};

describe('Step 5: MonthlyReportPage & Transparent Notices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. renders MonthlyReportPage with metric cards and strengths', async () => {
    vi.spyOn(reportApi, 'getMonthly').mockResolvedValue(mockReportData);

    render(
      <MemoryRouter>
        <MonthlyReportPage />
      </MemoryRouter>
    );

    // Verify Title
    expect(screen.getByText(/Báo cáo Tháng/)).toBeInTheDocument();

    // Verify Metrics
    await waitFor(() => {
      expect(screen.getByText('18')).toBeInTheDocument();
      expect(screen.getByText('-0.8')).toBeInTheDocument();
      expect(screen.getByText('1980.5')).toBeInTheDocument();
      expect(screen.getByText('58.1%')).toBeInTheDocument();
    });

    // Verify Strengths
    expect(screen.getByText(/Duy trì thói quen ghi nhật ký ẩm thực/)).toBeInTheDocument();
  });

  it('2. TRANSPARENT NOTICES (M4, ISC-7): renders all 3 fixed medical disclaimers', async () => {
    vi.spyOn(reportApi, 'getMonthly').mockResolvedValue(mockReportData);

    render(
      <MemoryRouter>
        <MonthlyReportPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.')).toBeInTheDocument();
      expect(screen.getByText('Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo.')).toBeInTheDocument();
      expect(screen.getByText('Báo cáo không thay thế tư vấn y khoa.')).toBeInTheDocument();
    });
  });

  it('3. INSUFFICIENT DATA (ADR-W6-10): displays non-speculative message when insufficient', async () => {
    vi.spyOn(reportApi, 'getMonthly').mockResolvedValue({
      ...mockReportData,
      insufficient: true,
      loggingSummary: { ...mockReportData.loggingSummary, totalLoggedDays: 0 },
      weightSummary: { ...mockReportData.weightSummary, recordsCount: 0 },
    });

    render(
      <MemoryRouter>
        <MonthlyReportPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Chưa đủ dữ liệu để tổng kết tháng này.')).toBeInTheDocument();
    });
  });

  it('4. MONTH NAVIGATION (ISC-8): shifts month and calls API with new month', async () => {
    const fetchSpy = vi.spyOn(reportApi, 'getMonthly').mockResolvedValue(mockReportData);

    render(
      <MemoryRouter>
        <MonthlyReportPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Click previous month
    const prevBtn = screen.getByRole('button', { name: 'Tháng trước' });
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('5. handles API error with retry button', async () => {
    const fetchSpy = vi.spyOn(reportApi, 'getMonthly').mockRejectedValueOnce(new Error('Lỗi máy chủ 500'));

    render(
      <MemoryRouter>
        <MonthlyReportPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Lỗi máy chủ 500/)).toBeInTheDocument();
    });

    fetchSpy.mockResolvedValueOnce(mockReportData);
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('18')).toBeInTheDocument();
    });
  });
});
