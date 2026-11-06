import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import OnboardingSurvey, { QUESTIONS } from '../pages/OnboardingSurvey';
import { preferenceApi, type Preferences } from '../api/preferenceApi';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasGoal: false }) }));
beforeEach(() => vi.restoreAllMocks());

describe('OnboardingSurvey', () => {
  it('walks through 11 questions, saves answers and shows the AI summary', async () => {
    vi.spyOn(preferenceApi, 'get').mockResolvedValue(null);
    const save = vi.spyOn(preferenceApi, 'save').mockResolvedValue({ summary: 'Bạn muốn giảm cân, ăn thanh đạm.', summary_source: 'ai' } as Preferences);
    const user = userEvent.setup();
    render(<MemoryRouter><OnboardingSurvey /></MemoryRouter>);
    expect(QUESTIONS).toHaveLength(11);

    for (let i = 0; i < 11; i++) {
      const q = QUESTIONS[i];
      expect(await screen.findByRole('heading', { name: q.title })).toBeInTheDocument();
      if (q.kind === 'choice') await user.click(screen.getAllByRole('radio')[i % 4]);
      else if (q.kind === 'allergies') await user.click(screen.getByRole('button', { name: /Không dị ứng gì/ }));
      else {
        await user.type(screen.getByLabelText('Ngân sách mỗi ngày'), '60000');
        expect(screen.getByLabelText('Ngân sách mỗi ngày')).toHaveValue('60.000');
        await user.click(screen.getByRole('button', { name: 'Hoàn tất' }));
      }
    }
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ age_group: 'A', activity: 'B', allergies: '', daily_budget_vnd: 60000, meals: 'B' }));
    expect(await screen.findByText('Bạn muốn giảm cân, ăn thanh đạm.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiếp tục thiết lập mục tiêu/ })).toBeInTheDocument();
  });
});
