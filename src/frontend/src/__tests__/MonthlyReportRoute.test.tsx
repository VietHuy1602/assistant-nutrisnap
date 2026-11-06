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
beforeAll(async () => { await import('../pages/MonthlyReportPage'); }, 30000);
beforeEach(() => { mockStatus = 'authenticated'; });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Monthly report application route', () => {
  it('opens the single monthly report screen inside the shell', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T18:00:00Z'));
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { days: [] } } as any);
    render(<MemoryRouter initialEntries={['/monthly-report']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1, name: /Báo cáo/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Chọn tháng báo cáo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Báo cáo tháng' })).toHaveAttribute('aria-current', 'page');
    expect(get).toHaveBeenCalled();
  });

  it('redirects the old /reports address to the monthly report', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { days: [] } } as any);
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>);
    expect(await screen.findByRole('group', { name: 'Chọn tháng báo cáo' })).toBeInTheDocument();
  });

  it('navigates from the Dashboard using the new link and keeps other links', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Dashboard kiểm thử' })).toBeInTheDocument();
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { days: [] } } as any);
    await userEvent.click(screen.getByRole('link', { name: 'Báo cáo tháng' }));
    expect(await screen.findByRole('group', { name: 'Chọn tháng báo cáo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link', { name: 'Mục tiêu' })[0]).toHaveAttribute('href', '/goal-setup');
    expect(screen.getByRole('button', { name: 'Trợ lý AI' })).toBeInTheDocument();
  });

  it('keeps unauthenticated users behind the existing ProtectedRoute', async () => {
    mockStatus = 'unauthenticated';
    render(<MemoryRouter initialEntries={['/monthly-report']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập kiểm thử' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Chọn tháng báo cáo' })).not.toBeInTheDocument();
  });
});
