import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ChatProvider, useChat } from '../context/ChatContext';
import { assistantApi } from '../api/assistantApi';
import { onMealLogged } from '../utils/mealEvents';
import { useCardConfirm } from '../hooks/useCardConfirm';
import type { ActionCardModel } from '../chat/types';
import type { ChatAction } from '../chat/chatReducer';

let mockAuth = {
  status: 'authenticated',
  user: { id: 1, username: 'dat_user' } as { id: number; username: string } | null,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

describe('ChatProvider & useAssistantChat — Quản lý vòng đời hội thoại', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAuth = { status: 'authenticated', user: { id: 1, username: 'dat_user' } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const TestChatComponent: React.FC = () => {
    const { state, send, cancel, retry, isOpen, openChat, closeChat } = useChat();
    return (
      <div>
        <div data-testid="status">{state.status}</div>
        <div data-testid="msg-count">{state.messages.length}</div>
        <div data-testid="is-open">{isOpen ? 'open' : 'closed'}</div>
        <button onClick={openChat}>Mở Chat</button>
        <button onClick={closeChat}>Đóng Chat</button>
        <button onClick={() => void send('Xin chào')}>Gửi Chào</button>
        <button onClick={() => void send('   ')}>Gửi Rỗng</button>
        <button onClick={() => void send('a'.repeat(1005))}>Gửi Dài</button>
        <button onClick={cancel}>Hủy Gửi</button>
        {state.messages.map((m) => (
          <div key={m.id} data-testid={`msg-${m.sender}`}>
            {m.text} - {m.status}
            {m.error && <span>{m.error}</span>}
            {m.isRetryable && (
              <button onClick={() => retry(m.clientId)}>Thử Lại</button>
            )}
          </div>
        ))}
      </div>
    );
  };

  it('1. Khởi tạo đóng, mở và đóng drawer hoạt động chính xác', async () => {
    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    expect(screen.getByTestId('is-open').textContent).toBe('closed');
    await act(async () => {
      screen.getByText('Mở Chat').click();
    });
    expect(screen.getByTestId('is-open').textContent).toBe('open');
    await act(async () => {
      screen.getByText('Đóng Chat').click();
    });
    expect(screen.getByTestId('is-open').textContent).toBe('closed');
  });

  it('2. Gửi tin nhắn thành công, nhận phản hồi từ assistantApi', async () => {
    let resolveMsg: any;
    vi.spyOn(assistantApi, 'sendMessage').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMsg = resolve;
        }),
    );

    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Chào').click();
    });

    // Tin người dùng được thêm ngay lạc quan
    expect(screen.getByTestId('status').textContent).toBe('awaitingReply');
    expect(screen.getByText(/Xin chào/)).toBeInTheDocument();

    await act(async () => {
      resolveMsg({
        sessionId: 10,
        text: 'Chào bạn! Tôi có thể giúp gì?',
        card: null,
        warnings: [],
      });
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByText(/Chào bạn! Tôi có thể giúp gì?/)).toBeInTheDocument();
  });

  it('3. Bỏ qua tin nhắn chỉ chứa khoảng trắng', async () => {
    const sendSpy = vi.spyOn(assistantApi, 'sendMessage');
    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Rỗng').click();
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('msg-count').textContent).toBe('0');
  });

  it('4. Chặn tin nhắn vượt quá 1000 ký tự và thêm tin cảnh báo hệ thống', async () => {
    const sendSpy = vi.spyOn(assistantApi, 'sendMessage');
    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Dài').click();
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/vượt quá giới hạn 1000 ký tự/)).toBeInTheDocument();
  });

  it('5. Cảnh báo chậm (slow) kích hoạt sau 8 giây khi backend phản hồi lâu', async () => {
    vi.spyOn(assistantApi, 'sendMessage').mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 15000)),
    );

    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Chào').click();
    });

    expect(screen.getByTestId('status').textContent).toBe('awaitingReply');

    await act(async () => {
      vi.advanceTimersByTime(8500);
    });

    expect(screen.getByTestId('status').textContent).toBe('slow');
  });

  it('6. Hủy tin nhắn đang chờ phản hồi (cancel) an toàn', async () => {
    vi.spyOn(assistantApi, 'sendMessage').mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 20000)),
    );

    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Chào').click();
    });

    await act(async () => {
      screen.getByText('Hủy Gửi').click();
    });

    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByText(/Đã hủy gửi tin nhắn/)).toBeInTheDocument();
  });

  it('7. Đăng xuất (unauthenticated) tự động RESET toàn bộ hội thoại', async () => {
    vi.spyOn(assistantApi, 'sendMessage').mockResolvedValueOnce({
      sessionId: 10,
      text: 'Câu trả lời',
      card: null,
      warnings: [],
    });

    const { rerender } = render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Chào').click();
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('msg-count').textContent).toBe('2');

    // Giả lập đăng xuất
    mockAuth = { status: 'unauthenticated', user: null };
    rerender(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    expect(screen.getByTestId('msg-count').textContent).toBe('0');
  });

  it('8. Đổi tài khoản người dùng tự động RESET toàn bộ hội thoại', async () => {
    vi.spyOn(assistantApi, 'sendMessage').mockResolvedValueOnce({
      sessionId: 10,
      text: 'Câu trả lời tài khoản 1',
      card: null,
      warnings: [],
    });

    const { rerender } = render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    await act(async () => {
      screen.getByText('Gửi Chào').click();
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('msg-count').textContent).toBe('2');

    // Đổi sang tài khoản 2
    mockAuth = { status: 'authenticated', user: { id: 2, username: 'other_user' } };
    rerender(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>,
    );

    expect(screen.getByTestId('msg-count').textContent).toBe('0');
  });
});

describe('useCardConfirm — Thực thi xác nhận thẻ và đồng bộ Dashboard', () => {
  const sampleCard: ActionCardModel = {
    id: 'card-confirm-1',
    kind: 'log_meal',
    state: 'pending',
    mealType: 'lunch',
    items: [{ food_id: 4, food_name: 'Phở bò', estimated_gram: 400 }],
    totals: { calories: 460 },
  };

  const TestCardConfirmComponent: React.FC<{
    card: ActionCardModel;
    onDispatch?: (action: ChatAction) => void;
  }> = ({ card, onDispatch }) => {
    const dispatch: React.Dispatch<ChatAction> = onDispatch || vi.fn();
    const { confirm, cancel, isConfirming } = useCardConfirm({ card, dispatch });

    return (
      <div>
        <div data-testid="card-state">{card.state}</div>
        <div data-testid="is-confirming">{isConfirming ? 'yes' : 'no'}</div>
        <button onClick={() => void confirm()}>Xác nhận lưu</button>
        <button onClick={cancel}>Hủy thẻ</button>
      </div>
    );
  };

  it('1. Xác nhận thành công: gọi saveMealFromCard, cập nhật state confirmed và phát event', async () => {
    const saveSpy = vi.spyOn(assistantApi, 'saveMealFromCard').mockResolvedValueOnce({
      mealId: 88,
      calories: 460,
      loggedAt: '2026-10-24T12:00:00Z',
    });

    const eventSpy = vi.fn();
    const unsubscribe = onMealLogged(eventSpy);

    const dispatchSpy = vi.fn();
    render(<TestCardConfirmComponent card={sampleCard} onDispatch={dispatchSpy} />);

    await act(async () => {
      screen.getByText('Xác nhận lưu').click();
    });

    expect(saveSpy).toHaveBeenCalledWith(sampleCard);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_CARD',
        card: expect.objectContaining({ state: 'confirmed', savedMealId: 88 }),
      }),
    );
    expect(eventSpy).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('2. Double-submit: Bấm xác nhận 2 lần chỉ kích hoạt đúng 1 request', async () => {
    let resolvePromise: any;
    const saveSpy = vi.spyOn(assistantApi, 'saveMealFromCard').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const dispatchSpy = vi.fn();
    render(<TestCardConfirmComponent card={sampleCard} onDispatch={dispatchSpy} />);

    await act(async () => {
      screen.getByText('Xác nhận lưu').click();
      screen.getByText('Xác nhận lưu').click();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePromise({ mealId: 89, calories: 460, loggedAt: '2026-10-24T12:00:00Z' });
    });
  });

  it('3. Lỗi mạng / timeout chuyển thẻ sang trạng thái uncertain', async () => {
    vi.spyOn(assistantApi, 'saveMealFromCard').mockRejectedValueOnce({
      code: 'ECONNABORTED',
      message: 'timeout of 45000ms exceeded',
    });

    const dispatchSpy = vi.fn();
    render(<TestCardConfirmComponent card={sampleCard} onDispatch={dispatchSpy} />);

    await act(async () => {
      screen.getByText('Xác nhận lưu').click();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_CARD',
        card: expect.objectContaining({ state: 'uncertain' }),
      }),
    );
  });

  it('4. Hủy thẻ chuyển trạng thái sang readonly', async () => {
    const dispatchSpy = vi.fn();
    render(<TestCardConfirmComponent card={sampleCard} onDispatch={dispatchSpy} />);

    await act(async () => {
      screen.getByText('Hủy thẻ').click();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_CARD',
        card: expect.objectContaining({ state: 'readonly' }),
      }),
    );
  });
});
