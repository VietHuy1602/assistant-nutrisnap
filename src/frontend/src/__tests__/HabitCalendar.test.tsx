import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HabitCalendar } from '../components/HabitCalendar';
import type { HabitCalendarProps } from '../types/habit';
function props(overrides: Partial<HabitCalendarProps> = {}): HabitCalendarProps {
  return { month: { year: 2026, month: 2 }, today: '2026-02-10', days: [], loadState: 'ready', source: 'verified', onMonthChange: vi.fn(), onDateSelect: vi.fn(), ...overrides };
}
describe('HabitCalendar — controlled presentation only', () => {
  it('distinguishes all daily states and never derives completion from missing entries', () => {
    render(<HabitCalendar {...props({ days: [
      { date: '2026-02-01', state: 'completed', description: 'Confirmed fixture' },
      { date: '2026-02-02', state: 'unconfirmed' },
      { date: '2026-02-03', state: 'unavailable', reason: 'no-records' },
      { date: '2026-02-04', state: 'unavailable', reason: 'insufficient-data' },
      { date: '2026-02-05', state: 'loading' },
      { date: '2026-02-06', state: 'error', message: 'Fixture error' },
    ] })} />);
    for (const name of ['01/02/2026 — Đã xác nhận hoàn thành', '02/02/2026 — Chưa có xác nhận hoàn thành', '03/02/2026 — Chưa có nhật ký', '04/02/2026 — Chưa đủ dữ liệu', '05/02/2026 — Đang tải', '06/02/2026 — Lỗi dữ liệu ngày', '07/02/2026 — Chưa có dữ liệu']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByText(/Chuỗi ngày và huy hiệu sẽ hiển thị/)).toBeInTheDocument();
    expect(screen.queryByText('Dữ liệu minh họa')).not.toBeInTheDocument();
  });
  it('overrides contradictory future completion and ignores future selection', async () => {
    const p = props({ selectedDate: '2026-02-11', days: [{ date: '2026-02-11', state: 'completed', description: 'Must not render' }] });
    render(<HabitCalendar {...p} />);
    const future = screen.getByRole('button', { name: '11/02/2026 — Ngày tương lai' });
    expect(future).toBeDisabled(); expect(future).toHaveAttribute('aria-pressed', 'false');
    expect(future).not.toHaveTextContent('✓');
    await userEvent.click(future); expect(p.onDateSelect).not.toHaveBeenCalled();
    expect(screen.queryByText('Must not render')).not.toBeInTheDocument();
  });
  it('uses controlled month navigation and selection with keyboard', async () => {
    const p = props(); const user = userEvent.setup(); const view = render(<HabitCalendar {...p} />);
    await user.tab(); expect(screen.getByRole('button', { name: 'Xem tháng trước' })).toHaveFocus();
    await user.keyboard('{Enter}'); expect(p.onMonthChange).toHaveBeenCalledWith({ year: 2026, month: 1 });
    await user.tab(); await user.keyboard(' '); expect(p.onMonthChange).toHaveBeenCalledWith({ year: 2026, month: 3 });
    await user.tab(); await user.tab();
    expect(screen.getByRole('button', { name: '01/02/2026 — Chưa có dữ liệu' })).toHaveFocus();
    await user.keyboard('{Enter}'); expect(p.onDateSelect).toHaveBeenCalledWith('2026-02-01');
    view.rerender(<HabitCalendar {...p} selectedDate="2026-02-01" />);
    expect(screen.getByRole('button', { name: '01/02/2026 — Chưa có dữ liệu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /10\/02\/2026/ })).toHaveAttribute('aria-current', 'date');
  });
  it.each(['loading', 'error'] as const)('does not show stale completion during %s', async loadState => {
    const p = props({ loadState, days: [{ date: '2026-02-01', state: 'completed', description: 'Stale description' }], selectedDate: '2026-02-01', onRetry: vi.fn() });
    render(<HabitCalendar {...p} />);
    expect(screen.queryByRole('button', { name: /01\/02\/2026 — Đã xác nhận/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Stale description')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', String(loadState === 'loading'));
    if (loadState === 'error') { expect(screen.getByRole('alert')).toBeInTheDocument(); await userEvent.click(screen.getByRole('button', { name: 'Thử lại' })); expect(p.onRetry).toHaveBeenCalledTimes(1); }
  });
  it('labels demo data and treats duplicate days as unverified errors', () => {
    const record = { date: '2026-02-01', state: 'completed' as const, description: 'Demo' };
    render(<HabitCalendar {...props({ source: 'demo', days: [record, record, { ...record, date: '2026-02-30' }, { ...record, date: '2026-03-01' }] })} />);
    expect(screen.getByText('Dữ liệu minh họa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '01/02/2026 — Lỗi dữ liệu ngày' })).not.toHaveTextContent('✓');
    expect(screen.getByRole('status')).toHaveTextContent('bị trùng');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(28);
  });
  it('shows new month data only and keeps focus on the navigation control', async () => {
    const p = props({ today: '2026-12-31', days: [{ date: '2026-02-01', state: 'completed', description: 'Old' }] });
    const user = userEvent.setup(); const view = render(<HabitCalendar {...p} />);
    await user.tab(); await user.tab();
    view.rerender(<HabitCalendar {...p} month={{ year: 2026, month: 3 }} />);
    expect(screen.getByRole('button', { name: 'Xem tháng sau' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '01/03/2026 — Chưa có dữ liệu' })).toBeInTheDocument();
  });
  it.each([{ month: { year: 2026, month: 13 } }, { today: '2026-02-30' }])('safely rejects invalid calendar configuration %#', invalid => {
    render(<HabitCalendar {...props(invalid)} />);
    expect(screen.getByRole('alert')).toHaveTextContent('không hợp lệ'); expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps selection, details and focus consistent across February → March → February', async () => {
    const p = props({ selectedDate: '2026-02-01', days: [{ date: '2026-02-01', state: 'completed', description: 'Chi tiết tháng Hai' }] });
    const view = render(<HabitCalendar {...p} />);
    const user = userEvent.setup();
    await user.tab(); await user.tab();
    const next = screen.getByRole('button', { name: 'Xem tháng sau' });
    expect(next).toHaveFocus();
    expect(screen.getByRole('button', { name: /01\/02\/2026/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Chi tiết tháng Hai')).toBeInTheDocument();

    view.rerender(<HabitCalendar {...p} month={{ year: 2026, month: 3 }} today="2026-03-10" loadState="loading" />);
    expect(screen.getByText('Tháng 3/2026')).toBeInTheDocument();
    expect(screen.queryByText('Chi tiết tháng Hai')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thông tin ngày' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /01\/03\/2026/ })).toHaveAttribute('aria-pressed', 'false');
    expect(next).toHaveFocus();

    const march = { ...p, month: { year: 2026, month: 3 }, today: '2026-03-10', selectedDate: '2026-03-02', days: [{ date: '2026-03-02', state: 'unconfirmed' as const, description: 'Chi tiết tháng Ba' }] };
    view.rerender(<HabitCalendar {...march} />);
    expect(screen.getByRole('button', { name: '02/03/2026 — Chưa có xác nhận hoàn thành' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Ngày 02/03/2026' })).toBeInTheDocument();
    expect(screen.getByText('Chi tiết tháng Ba')).toBeInTheDocument();
    expect(next).toHaveFocus();

    view.rerender(<HabitCalendar {...march} today="2026-03-01" />);
    expect(screen.getByRole('button', { name: '02/03/2026 — Ngày tương lai' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /02\/03\/2026/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Chi tiết tháng Ba')).not.toBeInTheDocument();
    expect(next).toHaveFocus();

    view.rerender(<HabitCalendar {...p} days={march.days} loadState="error" />);
    expect(screen.getByText('Tháng 2/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /01\/02\/2026/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Không tải được dữ liệu')).not.toHaveLength(0);
    expect(screen.queryByText('Chi tiết tháng Ba')).not.toBeInTheDocument();
    expect(next).toHaveFocus();

    view.rerender(<HabitCalendar {...p} selectedDate="2026-02-03" />);
    expect(screen.getByRole('button', { name: /01\/02\/2026/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '03/02/2026 — Chưa có dữ liệu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Chi tiết tháng Hai')).not.toBeInTheDocument();
    expect(next).toHaveFocus();
  });

  it('documents the current detail accessibility structure without claiming screen-reader announcements', async () => {
    const p = props({ selectedDate: '2026-02-01', days: [{ date: '2026-02-01', state: 'unconfirmed', description: 'Mô tả ban đầu' }] });
    const view = render(<HabitCalendar {...p} />);
    const user = userEvent.setup();
    await user.tab(); await user.tab(); await user.tab(); await user.tab();
    const day = screen.getByRole('button', { name: /01\/02\/2026/ });
    expect(day).toHaveFocus();
    const detail = screen.getByRole('heading', { name: 'Ngày 01/02/2026' }).parentElement!;
    expect(detail.querySelector('[aria-live]')).toBeNull();
    expect(detail.closest('[aria-live]')).toBeNull();
    expect(day).not.toHaveAttribute('aria-describedby');
    expect(day).toHaveAttribute('aria-pressed', 'true');
    // Only the month heading is live; the entire table must not become a live region.
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-live');
    expect(screen.getByText('Tháng 2/2026')).toHaveAttribute('aria-live', 'polite');

    view.rerender(<HabitCalendar {...p} days={[{ date: '2026-02-01', state: 'error', message: 'Thông báo chi tiết mới' }]} />);
    expect(screen.getByText('Thông báo chi tiết mới')).toBeInTheDocument();
    expect(screen.queryByText('Mô tả ban đầu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '01/02/2026 — Lỗi dữ liệu ngày' })).toHaveFocus();
    // DOM assertions cannot establish what an actual assistive technology announces.
  });
});
