import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../chat/components/ChatComposer';

describe('ChatComposer (IME-safe & Accessibility)', () => {
  it('sends message on Enter key when not composing', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer isSending={false} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    await user.type(input, 'Hôm nay tôi ăn gì{Enter}');

    expect(onSend).toHaveBeenCalledWith('Hôm nay tôi ăn gì');
  });

  it('does NOT send message on Enter key while IME composition is active (Vietnamese typing)', () => {
    const onSend = vi.fn();
    render(<ChatComposer isSending={false} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });

    // Simulate IME composition start (bắt đầu gõ dấu tiếng Việt, ví dụ: 'ph' + 'ow' -> 'phở')
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'phở' } });

    // Press Enter to commit IME conversion
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });

    // Must NOT send message while composing
    expect(onSend).not.toHaveBeenCalled();

    // IME composition ends
    fireEvent.compositionEnd(input);

    // Normal Enter now submits
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onSend).toHaveBeenCalledWith('phở');
  });

  it('allows Shift+Enter without sending message', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer isSending={false} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    await user.type(input, 'Dòng 1{Shift>}{Enter}{/Shift}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input and send button when isSending is true', () => {
    const onSend = vi.fn();
    render(<ChatComposer isSending={true} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    expect(input).toBeDisabled();
  });

  it('shows cancel button and calls onCancel when isSending is true and onCancel provided', async () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer isSending={true} onSend={onSend} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: 'Hủy yêu cầu đang gửi' });
    expect(cancelBtn).toBeInTheDocument();

    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows slow warning message when isSlow is true', () => {
    render(<ChatComposer isSending={true} isSlow={true} onSend={vi.fn()} />);
    expect(
      screen.getByText(/Việc này đang mất nhiều thời gian hơn bình thường/),
    ).toBeInTheDocument();
  });

  it('preserves draft and reflects external draft changes', () => {
    const onDraftChange = vi.fn();
    const { rerender } = render(
      <ChatComposer
        isSending={false}
        onSend={vi.fn()}
        draft="Bản nháp 1"
        onDraftChange={onDraftChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    expect(input).toHaveValue('Bản nháp 1');

    rerender(
      <ChatComposer
        isSending={false}
        onSend={vi.fn()}
        draft="Bản nháp 2"
        onDraftChange={onDraftChange}
      />,
    );
    expect(input).toHaveValue('Bản nháp 2');
  });
});
