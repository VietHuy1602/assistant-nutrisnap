import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MobileAccountMenu } from '../components/MobileAccountMenu';

function setup() {
  const logout = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<MemoryRouter><MobileAccountMenu username="Nguyễn An" onLogout={logout} /><button>Nội dung trang</button></MemoryRouter>);
  return { user, logout, trigger: screen.getByRole('button', { name: 'Tài khoản' }) };
}

describe('Mobile account navigation', () => {
  it('exposes secondary destinations, dismisses with Escape, and restores trigger focus', async () => {
    const { user, trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    const nav = screen.getByRole('navigation', { name: 'Tài khoản' });
    expect(within(nav).getByText('Nguyễn An')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Mục tiêu' })).toHaveAttribute('href', '/goal-setup');
    expect(within(nav).getByRole('link', { name: 'Báo cáo tháng' })).toHaveAttribute('href', '/monthly-report');
    await user.tab();
    expect(within(nav).getByRole('link', { name: 'Mục tiêu' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Tài khoản' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes after navigation or an outside interaction without stealing outside focus', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('link', { name: 'Mục tiêu' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Nội dung trang' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Nội dung trang' })).toHaveFocus();
  });

  it('dismisses on Tab out and delegates logout exactly once', async () => {
    const { user, trigger, logout } = setup();
    await user.click(trigger);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toHaveFocus();
    await user.tab();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
