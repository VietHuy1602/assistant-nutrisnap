import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CalorieRing } from '../components/dashboard/CalorieRing';
import { DashboardEmpty } from '../components/dashboard/DashboardEmpty';
import { NoGoalNotice } from '../components/dashboard/NoGoalNotice';
import { BasicDashboard } from '../pages/BasicDashboard';
import { dashboardApi } from '../api/dashboardApi';
vi.mock('../api/dashboardApi');
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'An' }, hasGoal: true }) }));
import { MacroBar } from '../components/dashboard/MacroBar';

describe('Dashboard P2 presentation', () => {
  it('shows the supplied reference instead of a personalized remaining allowance', () => {
    render(<CalorieRing consumed={800} target={1800} remaining={1000} progressPercent={44} personalized={false} />);
    expect(screen.getByText('Mức tham khảo')).toBeInTheDocument();
    expect(screen.getByText('1.800')).toBeInTheDocument();
    expect(screen.queryByText('Calo còn lại')).not.toBeInTheDocument();
    expect(screen.queryByText('1.000')).not.toBeInTheDocument();
  });
  it('keeps a single setup invitation outside the informational reference notice', () => {
    render(<NoGoalNotice target={1800} />);
    expect(screen.getByText(/1.800 kcal/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/TDEE|BMR/)).not.toBeInTheDocument();
  });
  it('names the historical date without claiming the day is today', () => {
    render(<MemoryRouter><DashboardEmpty selectedDate="2020-02-03" /></MemoryRouter>);
    expect(screen.getByRole('heading')).toHaveTextContent('03/02/2020');
    expect(screen.queryByText(/hôm nay/)).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('Ghi bữa ăn mới');
  });
  it('keeps numeric values and nutrient semantics while explaining reference targets', () => {
    const detail = { consumed: 20, target: 100, unit: 'g', progress_percent: 20 };
    render(<MacroBar macros={{ protein: detail, carbs: detail, fat: detail }} personalized={false} />);
    expect(screen.getByText('Giá trị tham khảo')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getByText('Đạm (Protein)')).toBeInTheDocument();
    expect(screen.getAllByText('(20%)')).toHaveLength(3);
  });
});


describe('Selected date resilience', () => {
  it('keeps navigation during loading and preserves the selected day through error and retry', async () => {
    vi.mocked(dashboardApi.getDailyDashboard).mockReturnValueOnce(new Promise(() => {}));
    render(<MemoryRouter><BasicDashboard /></MemoryRouter>);
    const previous = screen.getByRole('button', { name: 'Xem ngày hôm trước' });
    expect(previous).toBeEnabled();
    previous.focus();
    vi.mocked(dashboardApi.getDailyDashboard).mockRejectedValue(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Xem ngày hôm trước' }));
    const heading = await screen.findByRole('heading', { name: /Không tải được dữ liệu ngày/ });
    expect(screen.getByRole('button', { name: 'Xem ngày hôm trước' })).toBe(previous);
    expect(previous).toHaveFocus();
    const date = heading.textContent!.split('ngày ')[1];
    expect(screen.getByText(date)).toBeInTheDocument();
    const firstDate = vi.mocked(dashboardApi.getDailyDashboard).mock.calls.slice(-1)[0]![0];
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(dashboardApi.getDailyDashboard).toHaveBeenCalledTimes(3));
    expect(vi.mocked(dashboardApi.getDailyDashboard).mock.calls.slice(-1)[0]![0]).toBe(firstDate);
  });
});
