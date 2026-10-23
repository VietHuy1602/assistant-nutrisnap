import { cloneElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthlyReportView } from '../pages/MonthlyReportView';
import type { MonthlyReportData, MonthlyReportViewProps } from '../types/monthlyReport';

// jsdom has no layout. Supply chart dimensions; keep the actual Recharts chart.
vi.mock('recharts', async importOriginal => ({
  ...await importOriginal<typeof import('recharts')>(),
  ResponsiveContainer: ({ children }: { children: ReactElement }) => cloneElement(children, { width: 640, height: 240 }),
}));

const data: MonthlyReportData = {
  month: '2026-02', source: 'demo',
  days: [{ date: '2026-02-01', state: 'available', calories: 1234, proteinG: 70 }],
  summary: { totalCalories: 9876, averageDailyCalories: 567 },
};
const props: MonthlyReportViewProps = { month: '2026-02', today: '2026-03-10', loadState: 'ready', data, onMonthChange: vi.fn() };

afterEach(() => vi.restoreAllMocks());

describe('MonthlyReportView', () => {
  it('shows demo provenance, supplied statistics and an equivalent daily table without calculating totals', () => {
    render(<MonthlyReportView {...props} />);
    expect(screen.getByRole('heading', { name: 'Báo cáo tháng' })).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu minh họa')).toBeInTheDocument();
    expect(screen.getByText('9.876')).toBeInTheDocument();
    expect(screen.getByText('567')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(29);
    const first = within(table).getByRole('row', { name: /01\/02\/2026/ });
    expect(within(first).getByText('1.234')).toBeInTheDocument();
    expect(within(first).getByText('70')).toBeInTheDocument();
    expect(within(first).getAllByText('Chưa có dữ liệu')).toHaveLength(2);
    expect(screen.getByText(/Chỉ có một phần dữ liệu/)).toBeInTheDocument();
  });
  it('changes month and year through callbacks without mutation or stale data after rerender', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    const { rerender } = render(<MonthlyReportView {...props} onMonthChange={onMonthChange} />);
    const select = screen.getByRole('combobox', { name: 'Tháng' });
    await user.selectOptions(select, '03');
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-03');
    rerender(<MonthlyReportView {...props} month="2026-03" onMonthChange={onMonthChange} />);
    expect(select).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Tháng 3/2026' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('9.876')).not.toBeInTheDocument();
    expect(screen.queryByText('Dữ liệu minh họa')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In / Lưu PDF' })).toBeDisabled();
    const year = screen.getByRole('spinbutton', { name: 'Năm' });
    await user.tripleClick(year);
    await user.keyboard('2027');
    await user.tab();
    expect(onMonthChange).toHaveBeenLastCalledWith('2027-03');
    rerender(<MonthlyReportView {...props} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
  it.each([
    ['loading', 'Đang tải báo cáo tháng…'],
    ['error', 'Không tải được báo cáo tháng. Vui lòng thử lại.'],
    ['empty', 'Chưa có dữ liệu báo cáo cho tháng này.'],
  ] as const)('hides all old numbers during %s', (loadState, message) => {
    render(<MonthlyReportView {...props} loadState={loadState} />);
    expect(screen.getByText(new RegExp(message.replace(/[.…]/g, '.')))).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('9.876')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In / Lưu PDF' })).toBeDisabled();
  });
  it('supports retry without any API implementation', async () => {
    const onRetry = vi.fn();
    render(<MonthlyReportView {...props} loadState="error" errorMessage="Kết nối bị gián đoạn" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Kết nối bị gián đoạn');
  });
  it('keeps supplied zero distinct from missing and hides macros that were not supplied', () => {
    render(<MonthlyReportView {...props} data={{ ...data, summary: undefined, days: [{ date: '2026-02-01', state: 'available', calories: 0 }] }} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('0')).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Protein (g)' })).not.toBeInTheDocument();
    const second = within(table).getByRole('row', { name: /02\/02\/2026/ });
    expect(within(second).getAllByText('Chưa có dữ liệu')).toHaveLength(2);
  });
  it('supports a macro-only day without manufacturing calories', () => {
    render(<MonthlyReportView {...props} data={{ ...data, days: [{ date: '2026-02-01', state: 'available', proteinG: 25 }] }} />);
    const first = within(screen.getByRole('table')).getByRole('row', { name: /01\/02\/2026/ });
    expect(within(first).getByText('25')).toBeInTheDocument();
    expect(within(first).getAllByText('Chưa có dữ liệu')).toHaveLength(3);
  });
  it('labels verified input without a demo badge and retains explicit partial status', () => {
    render(<MonthlyReportView {...props} loadState="partial" data={{ ...data, source: 'verified' }} />);
    expect(screen.queryByText('Dữ liệu minh họa')).not.toBeInTheDocument();
    expect(screen.getByText(/Chỉ có một phần dữ liệu/)).toBeInTheDocument();
  });
  it('locks future months and suppresses contradictory supplied values', () => {
    render(<MonthlyReportView {...props} today="2026-01-31" />);
    expect(screen.getByText('Tháng tương lai chưa có báo cáo.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('suppresses future-day numbers in a current-month report', () => {
    render(<MonthlyReportView {...props} today="2026-02-01" data={{ ...data, days: [...data.days, { date: '2026-02-02', state: 'available', calories: 9999 }] }} />);
    const second = within(screen.getByRole('table')).getByRole('row', { name: /02\/02\/2026/ });
    expect(within(second).getByText('Ngày tương lai')).toBeInTheDocument();
    expect(screen.queryByText('9.999')).not.toBeInTheDocument();
  });
  it('shows invalid input and entirely missing nutrition safely', () => {
    const { rerender } = render(<MonthlyReportView {...props} month="2026-13" />);
    expect(screen.getByRole('alert')).toHaveTextContent('không hợp lệ');
    rerender(<MonthlyReportView {...props} data={{ ...data, days: [] }} />);
    expect(screen.getByText('Chưa có dữ liệu dinh dưỡng hợp lệ cho tháng này.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('opens the browser print dialog by keyboard, preserves focus and reports a thrown failure', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<MonthlyReportView {...props} />);
    await user.tab();
    const button = screen.getByRole('button', { name: 'In / Lưu PDF' });
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(print).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
    print.mockImplementation(() => { throw new Error('unsupported'); });
    await user.keyboard(' ');
    expect(screen.getByRole('alert')).toHaveTextContent('Không mở được hộp thoại in');
    expect(document.querySelector('style')?.textContent).toContain('@media print');
    expect(screen.getByRole('region', { name: /Bảng dinh dưỡng/ })).toHaveAttribute('tabindex', '0');
  });
});
