import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { CalorieRing } from '../components/dashboard/CalorieRing';
import { MacroBar } from '../components/dashboard/MacroBar';

afterEach(cleanup);
describe('Dashboard visual refinement preserves data and destinations', () => {
  it('retains supplied calorie values and reference-goal distinction', () => {
    const view = render(<CalorieRing consumed={450} target={2000} remaining={1550} progressPercent={22.5} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/450.*2.000.*23%.*1.550/);
    const face = view.container.querySelector('.calorie-ring-face')!;
    expect(face).not.toContainElement(screen.getByText('Calo còn lại'));
    expect(face).toContainElement(screen.getByText('1.550'));
    expect(face).toHaveTextContent('kcal');
    view.rerender(<CalorieRing consumed={450} target={2000} remaining={1550} progressPercent={22.5} personalized={false} />);
    expect(screen.queryByText('Calo còn lại')).not.toBeInTheDocument();
    expect(screen.queryByText('1.550')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(/chưa phải mục tiêu cá nhân/);
  });
  it('keeps values, percentage and nutrient progress semantics with concise labels', () => {
    const detail = { consumed: 20, target: 100, unit: 'g', progress_percent: 20 };
    render(<MacroBar macros={{ protein: detail, carbs: detail, fat: detail }} />);
    for (const label of ['Đạm', 'Tinh bột', 'Chất béo']) expect(screen.getByText(label)).toBeInTheDocument();
    for (const bar of screen.getAllByRole('progressbar')) {
      expect(bar).toHaveAttribute('aria-valuenow', '20');
      expect(bar).toHaveAttribute('aria-valuemax', '100');
      expect(bar).toHaveAttribute('aria-valuetext', expect.stringContaining('(20%)'));
    }
  });
  it.each(['/', '/habits', '/capture', '/progress', '/reports'])('keeps the active destination and consistent treatment at %s', path => {
    render(<MemoryRouter initialEntries={[path]}><BottomNav /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/', '/habits', '/capture', '/progress', '/reports']);
    const active = links.filter(link => link.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', path);
    expect(active[0]).toHaveClass('bg-[#E0F1B8]', 'min-h-12', 'min-w-12');
  });
});
