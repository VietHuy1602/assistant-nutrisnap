import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChatDrawer } from '../components/AssistantChatDrawer';
import { apiClient } from '../api/client';

vi.mock('../api/client', () => ({ apiClient: { post: vi.fn() } }));

const baseCardData = {
  meal_type: 'lunch' as const,
  total_calories: 250,
  items: [
    {
      food_id: 10,
      food_name: 'Cơm tấm sườn',
      estimated_gram: 200,
      calories: 250,
      protein_g: 15,
      carbs_g: 35,
      fat_g: 5,
    },
  ],
};

const cardWithConfirmation = {
  type: 'confirm_log_meal' as const,
  status: 'pending_user_action' as const,
  confirmation_id: 'pending-conf-12345',
  data: {
    ...baseCardData,
    confirmation_id: 'pending-conf-12345',
  },
};

const cardWithoutConfirmation = {
  type: 'confirm_log_meal' as const,
  status: 'pending_user_action' as const,
  data: {
    ...baseCardData,
  },
};

const mockChatReply = (actionCard: unknown) => ({
  data: {
    reply_text: 'Trợ lý đã chuẩn bị thẻ ghi nhận bữa ăn.',
    action_card: actionCard,
    disclaimer: 'Ước tính calo mang tính chất tham khảo.',
  },
});

const onSavedMock = vi.fn();

function TestHarness() {
  const [open, setOpen] = useState(false);
  const background = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={background}>
        <button onClick={() => setOpen(true)}>Mở trợ lý</button>
      </div>
      <AssistantChatDrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        username="MinhDuc"
        backgroundRef={background}
        onMealSaved={onSavedMock}
      />
    </>
  );
}

describe('AssistantConfirmationId — Confirmation endpoint routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    onSavedMock.mockClear();
  });

  it('thẻ CÓ confirmation_id -> gọi /assistant/confirmations/{id}/confirm và KHÔNG gọi /meals/log', async () => {
    const user = userEvent.setup();

    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url === '/assistant/chat') {
        return mockChatReply(cardWithConfirmation);
      }
      if (url === '/assistant/confirmations/pending-conf-12345/confirm') {
        return {
          status: 200,
          data: {
            success: true,
            meal_id: 88,
            total_calories: 250,
          },
        };
      }
      return { status: 404, data: {} };
    });

    render(<TestHarness />);
    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));

    // Send a message to receive the card with confirmation_id
    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    await user.type(input, 'Ghi nhận cơm tấm{Enter}');

    // Card should appear
    const confirmBtn = await screen.findByRole('button', { name: 'Xác nhận lưu' });
    expect(confirmBtn).toBeInTheDocument();

    // Click confirm
    await user.click(confirmBtn);

    // Verify confirmation endpoint was called with correct ID
    expect(apiClient.post).toHaveBeenCalledWith(
      '/assistant/confirmations/pending-conf-12345/confirm',
    );

    // Verify /meals/log was NEVER called
    const mealsLogCalls = vi
      .mocked(apiClient.post)
      .mock.calls.filter(([url]) => url === '/meals/log');
    expect(mealsLogCalls).toHaveLength(0);

    // Verify onMealSaved was triggered
    expect(onSavedMock).toHaveBeenCalledTimes(1);

    // Verify UI reflects confirmed state
    await screen.findByText(/Đã lưu/);
  });

  it('thẻ KHÔNG có confirmation_id -> vẫn gọi /meals/log (hành vi fallback cũ)', async () => {
    const user = userEvent.setup();

    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url === '/assistant/chat') {
        return mockChatReply(cardWithoutConfirmation);
      }
      if (url === '/meals/log') {
        return {
          status: 201,
          data: {
            success: true,
            meal_id: 99,
            total_calories: 250,
            logged_at: '2026-10-24T12:00:00Z',
          },
        };
      }
      return { status: 404, data: {} };
    });

    render(<TestHarness />);
    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    await user.type(input, 'Ghi nhận bữa trưa{Enter}');

    const confirmBtn = await screen.findByRole('button', { name: 'Xác nhận lưu' });
    await user.click(confirmBtn);

    // Verify /meals/log was called with is_confirmed: true
    const mealsLogCalls = vi
      .mocked(apiClient.post)
      .mock.calls.filter(([url]) => url === '/meals/log');
    expect(mealsLogCalls).toHaveLength(1);
    expect(mealsLogCalls[0][1]).toMatchObject({
      meal_type: 'lunch',
      is_confirmed: true,
    });

    // Verify no confirmation endpoints were called
    const confirmationCalls = vi
      .mocked(apiClient.post)
      .mock.calls.filter(([url]) => (url as string).includes('/assistant/confirmations'));
    expect(confirmationCalls).toHaveLength(0);

    expect(onSavedMock).toHaveBeenCalledTimes(1);
    await screen.findByText(/Đã lưu/);
  });

  it('thẻ CÓ confirmation_id -> khi bấm Hủy gọi /assistant/confirmations/{id}/cancel', async () => {
    const user = userEvent.setup();

    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url === '/assistant/chat') {
        return mockChatReply(cardWithConfirmation);
      }
      if (url === '/assistant/confirmations/pending-conf-12345/cancel') {
        return {
          status: 200,
          data: {
            success: true,
            message: 'Cancelled',
          },
        };
      }
      return { status: 404, data: {} };
    });

    render(<TestHarness />);
    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));

    const input = screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' });
    await user.type(input, 'Ghi nhận cơm{Enter}');

    const cancelBtn = await screen.findByRole('button', { name: 'Hủy' });
    await user.click(cancelBtn);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/assistant/confirmations/pending-conf-12345/cancel',
    );
    await screen.findByText(/Đã hủy/);
  });

  it('normalizeAssistantResponse preserves confirmation_id in ActionCardModel', async () => {
    const { normalizeAssistantResponse } = await import('../api/chatContract');
    const raw = {
      reply_text: 'Đã chuẩn bị bữa ăn.',
      action_card: {
        type: 'confirm_log_meal',
        status: 'pending_user_action',
        confirmation_id: 'conf-zod-check-999',
        data: {
          meal_type: 'dinner',
          items: [
            { food_id: 1, food_name: 'Phở bò', estimated_gram: 300, calories: 450 },
          ],
          confirmation_id: 'conf-zod-check-999',
        },
      },
    };

    const turn = normalizeAssistantResponse(raw);
    expect(turn.card).not.toBeNull();
    expect(turn.card?.confirmation_id).toBe('conf-zod-check-999');
  });
});

