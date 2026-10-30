import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickSuggestions, DEFAULT_PROMPTS } from '../chat/components/QuickSuggestions';
import { MessageList } from '../chat/components/MessageList';

describe('Assistant presentation accessibility', () => {
  it('keeps the existing suggestion payloads and keyboard activation, and respects pending disablement', async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    const view = render(<QuickSuggestions onSelect={select} />);
    expect(screen.getByRole('group', { name: 'Gợi ý bắt đầu trò chuyện' })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: DEFAULT_PROMPTS[0].label })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(select).toHaveBeenCalledWith(DEFAULT_PROMPTS[0].message);
    view.rerender(<QuickSuggestions disabled onSelect={select} />);
    for (const prompt of DEFAULT_PROMPTS) {
      const button = screen.getByRole('button', { name: prompt.label });
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('names the conversation and exposes the existing latest-message action to keyboard users', async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    render(<MessageList messages={[]} isSending={false} containerRef={createRef<HTMLDivElement>()}
      showScrollBottom onScrollToBottom={scroll} onScroll={() => {}} />);
    expect(screen.getByRole('log', { name: 'Hội thoại với trợ lý' })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cuộn xuống tin nhắn mới nhất' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
