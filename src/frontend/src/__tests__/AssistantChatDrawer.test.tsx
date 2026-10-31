// Frontend tests use simulated transport. They do not establish live meal persistence.
import { useRef, useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChatDrawer } from '../components/AssistantChatDrawer';
import { DEFAULT_PROMPTS } from '../chat/components/QuickSuggestions';
import { apiClient } from '../api/client';
import { ApiError } from '../utils/apiError';
import { isMealCard, saveAssistantMeal } from '../api/assistantApi';
import type { ActionCard } from '../types/api';
import { MemoryRouter } from 'react-router-dom';
import { ChatProvider } from '../context/ChatContext';
import { onMealLogged } from '../utils/mealEvents';

vi.mock('../api/client', () => ({ apiClient: { post: vi.fn(), get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ status: 'authenticated', user: { id: 1 } }) }));
const card = { type: 'confirm_log_meal', status: 'pending_user_action', data: {
  meal_type: 'lunch', total_calories: 100, items: [{ food_id: 7, food_name: 'Món kiểm thử', estimated_gram: 100, calories: 100, protein_g: 2, carbs_g: 20, fat_g: 1 }],
} };
const reply = (action: unknown = card) => ({ data: { session_id: 9, reply_text: 'Bản nháp kiểm thử.', action_card: action, disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.' } });
const ack = { status: 201, data: { success: true, status: 'logged', meal_id: 42, total_calories: 135, logged_at: '2026-10-23T12:00:00Z' } };
const onSaved = vi.fn();
function Harness() {
  const [open, setOpen] = useState(false);
  const background = useRef<HTMLDivElement>(null);
  return <><div ref={background}><button onClick={() => setOpen(true)}>Mở chat kiểm thử</button></div><AssistantChatDrawer isOpen={open} onClose={() => setOpen(false)} username="Test" backgroundRef={background} onMealSaved={onSaved} /></>;
}
async function open() {
  const user = userEvent.setup();
  const view = render(<MemoryRouter><ChatProvider><Harness /></ChatProvider></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Mở chat kiểm thử' }));
  return { user, ...view };
}
async function requestCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '🍜 Ghi nhận bữa ăn' }));
  return screen.findByRole('button', { name: /^Xác nhận lưu/ });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const saves = () => vi.mocked(apiClient.post).mock.calls.filter(([url]) => url === '/meals/log');

describe('AssistantChatDrawer — simulated API only', () => {
  it('initializes closed and supports chat without randomUUID', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
      const { user, unmount } = await open();
      await requestCard(user);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      unmount();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it.each([['lunch'], {}, 1, null, 'brunch', 'Lunch', ' lunch '].map(value => ({ value })))('rejects malformed meal_type %# before transport', async ({ value: mealType }) => {
    const malformed = { ...card, data: { ...card.data, meal_type: mealType } };
    expect(isMealCard(malformed)).toBe(false);
    await expect(saveAssistantMeal(malformed as unknown as ActionCard)).rejects.toThrow();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockImplementation(async url => url === '/assistant/chat' ? reply() : ack);
  });

  it.each([
    ['💡 Calo & Đạm hôm nay', 'Hôm nay mình đã ăn bao nhiêu calo và còn thiếu bao nhiêu đạm?'],
    ['🍜 Ghi nhận bữa ăn', 'Ghi nhận nhanh bữa ăn vừa dùng'],
    ['🍱 Gợi ý thực đơn', 'Gợi ý thực đơn vừa ngân sách hôm nay'],
  ])('preserves prompt %s and its exact submitted message', async (label, message) => {
    const { user } = await open();
    expect(apiClient.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: label }));
    await screen.findByText('Bản nháp kiểm thử.');
    expect(apiClient.post).toHaveBeenCalledWith('/assistant/chat', { message }, expect.objectContaining({ timeout: 45000, signal: expect.any(AbortSignal) }));
    expect(saves()).toHaveLength(0);
  });

  it('preserves history and unsent drafts across closing and reopening', async () => {
    const { user } = await open();
    await requestCard(user);
    await user.type(screen.getByRole('textbox', { name: 'Tin nhắn cho trợ lý' }), 'Chưa gửi');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở chat kiểm thử' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Mở chat kiểm thử' }));
    expect(screen.getByRole('textbox')).toHaveValue('Chưa gửi');
    expect(screen.getByText('Bản nháp kiểm thử.')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('uses the acknowledged session for the next message rather than a fixed session', async () => {
    const { user } = await open(); await requestCard(user);
    await user.click(screen.getByRole('button', { name: '💡 Calo & Đạm hôm nay' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(apiClient.post).toHaveBeenLastCalledWith('/assistant/chat', { session_id: 9, message: 'Hôm nay mình đã ăn bao nhiêu calo và còn thiếu bao nhiêu đạm?' }, expect.any(Object));
  });

  it('cancels the actual in-flight request and ignores a late reply', async () => {
    const pending = deferred<ReturnType<typeof reply>>();
    vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise);
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '💡 Calo & Đạm hôm nay' }));
    const signal = vi.mocked(apiClient.post).mock.calls[0][2]?.signal;
    await user.click(screen.getByRole('button', { name: 'Hủy yêu cầu đang gửi' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(reply()));
    expect(screen.queryByText('Bản nháp kiểm thử.')).not.toBeInTheDocument();
    expect(saves()).toHaveLength(0);
  });

  it('shows a failed message and explicitly retries it through the same provider', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Giới hạn', { status: 429 }));
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '💡 Calo & Đạm hôm nay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('thao tác hơi nhanh');
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Gửi lại' }));
    expect(await screen.findByText('Bản nháp kiểm thử.')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });

  it('locks saving immediately, ignores repeated clicks/Enter and uses acknowledged calories', async () => {
    const pending = deferred<typeof ack>();
    const { user } = await open();
    const confirm = await requestCard(user);
    expect(screen.getByText(/Chờ bạn xác nhận/)).toBeInTheDocument();
    vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise);
    await user.dblClick(confirm);
    await user.keyboard('{Enter}{Enter}');
    expect(saves()).toHaveLength(1);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    expect(screen.getByText('Đang lưu bữa ăn…')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenLastCalledWith('/meals/log', { meal_type: 'lunch', items: [{ food_id: 7, food_name: 'Món kiểm thử', estimated_gram: 100 }], is_confirmed: true }, { signal: undefined });
    await act(async () => pending.resolve(ack));
    expect(await screen.findByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Xác nhận lưu/ })).not.toBeInTheDocument();
  });

  it('emits the Vietnam business date after valid acknowledgement without claiming refresh completed', async () => {
    const events = vi.fn(); const unsubscribe = onMealLogged(events);
    try {
      const { user } = await open(); const confirm = await requestCard(user);
      vi.mocked(apiClient.post).mockResolvedValueOnce({ ...ack, data: { ...ack.data, logged_at: '2026-10-23T18:30:00Z', total_calories: 0 } });
      await user.click(confirm);
      expect(await screen.findByText(/Đã lưu vào nhật ký · 0 kcal/)).toBeInTheDocument();
      expect(events).toHaveBeenCalledTimes(1);
      expect(events.mock.calls[0][0].detail).toEqual({ source: 'chat', date: '2026-10-24', mealId: 42 });
      expect(screen.queryByText(/Dashboard đã được làm mới/)).not.toBeInTheDocument();
    } finally { unsubscribe(); }
  });

  it('cancels immutably without saving or refreshing', async () => {
    const { user } = await open(); await requestCard(user);
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByText('Đã hủy thẻ ghi nhận bữa ăn.')).toBeInTheDocument();
    expect(card.status).toBe('pending_user_action');
    expect(saves()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a definite validation failure and allows only an explicit retry', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Rejected', { status: 400 }));
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ chưa chấp nhận');
    expect(onSaved).not.toHaveBeenCalled(); expect(saves()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^Thử lưu lại/ }));
    expect(await screen.findByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
    expect(saves()).toHaveLength(2); expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...ack, status: 200 },
    { status: 201, data: { ...ack.data, success: false } },
    { status: 201, data: { ...ack.data, meal_id: 0 } },
    { status: 201, data: { ...ack.data, total_calories: NaN } },
    { status: 201, data: { ...ack.data, total_calories: null } },
    { status: 201, data: { ...ack.data, logged_at: 'invalid' } },
    { status: 201, data: { success: true, status: 'pending_confirmation', meal_id: null } },
    { status: 201, data: null },
  ])('rejects an invalid acknowledgement %# without success or refresh', async invalid => {
    const { user } = await open(); const confirm = await requestCard(user);
    vi.mocked(apiClient.post).mockResolvedValueOnce(invalid);
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa xác minh được kết quả lưu');
    expect(screen.queryByText(/Đã lưu vào nhật ký/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Thử lưu lại/ })).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled(); expect(saves()).toHaveLength(1);
  });

  it('does not retry a timeout or claim that the meal was not saved', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Timeout', { isNetworkError: true }));
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('tránh trùng bữa ăn');
    expect(screen.queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument();
    expect(screen.queryByText('Đã hủy thẻ ghi nhận bữa ăn.')).not.toBeInTheDocument();
    expect(saves()).toHaveLength(1); expect(onSaved).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'confirm_update_goal', status: 'pending_user_action', data: { goal_update: {} } },
    { type: 'recommendation_preview', status: 'pending_user_action', data: {} },
    { ...card, data: { ...card.data, items: [] } },
    { ...card, data: { ...card.data, items: [{ ...card.data.items[0], food_id: null }] } },
    { ...card, data: { ...card.data, items: [{ ...card.data.items[0], estimated_gram: Infinity }] } },
    { ...card, status: 'confirmed' },
    {},
  ])('never offers an unsupported or malformed card for saving %#', async unsupported => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(reply(unsupported));
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '🍜 Ghi nhận bữa ăn' }));
    expect(await screen.findByText(/Thẻ này chưa hỗ trợ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(saves()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  });

  it('retains a confirmed card when a concurrent chat reply arrives', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    const pendingReply = deferred<ReturnType<typeof reply>>();
    vi.mocked(apiClient.post).mockReturnValueOnce(pendingReply.promise);
    await user.click(screen.getByRole('button', { name: '💡 Calo & Đạm hôm nay' }));
    await user.click(confirm);
    expect(await screen.findByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
    await act(async () => pendingReply.resolve({ data: { session_id: 9, reply_text: 'Phản hồi đến sau.', action_card: null, disclaimer: '' } }));
    expect(await screen.findByText('Phản hồi đến sau.')).toBeInTheDocument();
    expect(screen.getByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('locks repeated message submission and displays a friendly reply error', async () => {
    const pending = deferred<ReturnType<typeof reply>>();
    vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise);
    const { user } = await open();
    await user.type(screen.getByRole('textbox'), 'Câu hỏi kiểm thử');
    await user.dblClick(screen.getByRole('button', { name: 'Gửi tin nhắn' }));
    await user.keyboard('{Enter}{Enter}');
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new Error('Unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa nhận được phản hồi');
  });

  it.each([
    [new ApiError('Internal implementation details', { status: 500 }), 'lỗi máy chủ (HTTP 500)'],
    [new ApiError('Khẩu phần không hợp lệ.', { status: 422 }), 'Khẩu phần không hợp lệ.'],
    [new ApiError('Network Error', { isNetworkError: true }), 'Không thể kết nối hoặc đã hết thời gian chờ'],
  ])('explains normalized chat failures without creating a card: %s', async (error, message) => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(error);
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '🍜 Ghi nhận bữa ăn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getAllByText(text => text.includes(message))).toHaveLength(1);
    expect(screen.queryByText('Internal implementation details')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(saves()).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each([null, {}, { reply_text: '   ' }, { action_card: { data: { items: [] } } }])('treats unusable HTTP-success responses as failed messages %#', async data => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '🍜 Ghi nhận bữa ăn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CONTRACT_MISMATCH');
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(saves()).toHaveLength(0);
  });

  it('keeps ordinary assistant text without fabricating a meal card', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { reply: 'Bạn muốn ghi nhận món nào?', action_card: null, pending_confirmation: false } });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '🍜 Ghi nhận bữa ăn' }));
    expect(await screen.findByText('Bạn muốn ghi nhận món nào?')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(saves()).toHaveLength(0);
  });

  it('explains missing structured confirmation data without inventing a card', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { reply: 'Vui lòng xác nhận.', pending_confirmation: true, action_card: null } });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: '🍜 Ghi nhận bữa ăn' }));
    expect(await screen.findByText(/Thẻ này chưa hỗ trợ lưu bữa ăn tại đây hoặc thiếu thông tin hợp lệ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(saves()).toHaveLength(0);
  });

  it('traps focus, supports Escape, restores focus and cleans up modal effects', async () => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'scroll';
    const { user, unmount } = await open();
    const close = screen.getByRole('button', { name: 'Đóng trợ lý' });
    expect(screen.getByRole('textbox')).toHaveFocus();
    // Mỗi gợi ý nhanh là một nút; lùi qua tất cả để tới nút đóng.
    for (let index = 0; index <= DEFAULT_PROMPTS.length; index++) await user.tab({ shift: true });
    expect(close).toHaveFocus();
    expect(document.querySelector('[inert]')).not.toBeNull();
    await user.tab({ shift: true }); expect(screen.getByRole('textbox')).toHaveFocus();
    await user.tab(); expect(close).toHaveFocus();
    await user.type(screen.getByRole('textbox'), 'Bản nháp');
    await user.tab(); expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toHaveFocus();
    await user.tab(); expect(close).toHaveFocus();
    expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Tin nhắn cho trợ lý' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('scroll');
    expect(screen.getByRole('button', { name: 'Mở chat kiểm thử' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Mở chat kiểm thử' }));
    unmount(); expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = previous;
  });

  it('keeps a pending save locked when the drawer closes and reopens', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    const pending = deferred<typeof ack>();
    vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise);
    await user.click(confirm); await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Mở chat kiểm thử' }));
    expect(screen.getByRole('button', { name: /^Xác nhận lưu/ })).toBeDisabled();
    await act(async () => pending.resolve(ack));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
