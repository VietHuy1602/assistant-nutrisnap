import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { apiClient } from '../api/client';

let mockStatus = 'authenticated';
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({
  status: mockStatus, user: { username: 'Test' }, hasGoal: false, logout: vi.fn(),
}) }));
vi.mock('../components/dev/ApiStatusBadge', () => ({ ApiStatusBadge: () => null }));
vi.mock('../components/AssistantChatDrawer', () => ({ AssistantChatDrawer: () => null }));
vi.mock('../pages/LoginPage', () => ({ LoginPage: () => <h1>Đăng nhập kiểm thử</h1> }));
vi.mock('../pages/BasicDashboard', () => ({ BasicDashboard: () => <h1>Dashboard kiểm thử</h1> }));

// Transform the chart module before timing route assertions in a parallel suite.
beforeAll(async () => { await import('../pages/MonthlyReportView'); });
beforeEach(() => { mockStatus = 'authenticated'; });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Monthly report application route', () => {
  it('opens inside the existing shell without a goal, data fixtures or monthly requests', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // UTC is still September; the business date in Vietnam is already October.
    vi.setSystemTime(new Date('2026-09-30T18:00:00Z'));
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { days: [] } } as any);
    render(<MemoryRouter initialEntries={['/monthly-report']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Báo cáo tháng' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tháng 10/2026' })).toBeInTheDocument();
    expect(await screen.findByText(/Chưa có dữ liệu báo cáo cho tháng này/)).toBeInTheDocument();
    expect(screen.queryByText('Dữ liệu minh họa')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In / Lưu PDF' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Báo cáo tháng' })).toHaveAttribute('aria-current', 'page');
    expect(get).toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tháng' }), '09');
    expect(screen.getByRole('heading', { name: 'Tháng 9/2026' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('navigates from the Dashboard using the new link and keeps other links', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Dashboard kiểm thử' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Báo cáo tháng' }));
    expect(await screen.findByRole('heading', { name: 'Báo cáo tháng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Mục tiêu' })).toHaveAttribute('href', '/goal-setup');
    expect(screen.getByRole('button', { name: 'Trợ lý AI' })).toBeInTheDocument();
  });

  it('keeps unauthenticated users behind the existing ProtectedRoute', async () => {
    mockStatus = 'unauthenticated';
    render(<MemoryRouter initialEntries={['/monthly-report']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập kiểm thử' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Báo cáo tháng' })).not.toBeInTheDocument();
  });
});
