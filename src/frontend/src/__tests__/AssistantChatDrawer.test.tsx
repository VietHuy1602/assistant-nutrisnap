// Frontend tests use simulated transport. They do not establish live meal persistence.
import { useRef, useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChatDrawer } from '../components/AssistantChatDrawer';
import { apiClient } from '../api/client';
import { ApiError } from '../utils/apiError';
import { isMealCard, saveAssistantMeal } from '../api/assistantApi';
import type { ActionCard } from '../types/api';

vi.mock('../api/client', () => ({ apiClient: { post: vi.fn() } }));
const card = { type: 'confirm_log_meal', status: 'pending_user_action', data: {
  meal_type: 'lunch', total_calories: 100, items: [{ food_id: 7, food_name: 'Món kiểm thử', estimated_gram: 100, calories: 100, protein_g: 2, carbs_g: 20, fat_g: 1 }],
} };
const reply = (action: unknown = card) => ({ data: { reply_text: 'Bản nháp kiểm thử.', action_card: action, disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.' } });
const ack = { status: 201, data: { success: true, meal_id: 42, total_calories: 135, logged_at: '2026-10-23T12:00:00Z' } };
const onSaved = vi.fn();
function Harness() {
  const [open, setOpen] = useState(false);
  const background = useRef<HTMLDivElement>(null);
  return <><div ref={background}><button onClick={() => setOpen(true)}>Mở chat kiểm thử</button></div><AssistantChatDrawer isOpen={open} onClose={() => setOpen(false)} username="Test" backgroundRef={background} onMealSaved={onSaved} /></>;
}
async function open() {
  const user = userEvent.setup();
  const view = render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Mở chat kiểm thử' }));
  return { user, ...view };
}
async function requestCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '🍲 Ghi nhận phở bò' }));
  return screen.findByRole('button', { name: 'Xác nhận lưu' });
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
    vi.mocked(apiClient.post).mockImplementation(async url => url === '/assistant/chat' ? reply() : ack);
  });

  it.each([
    ['💡 Calo còn lại?', 'Hôm nay tôi còn bao nhiêu calo?'],
    ['🍲 Ghi nhận phở bò', 'Trưa nay tôi ăn 1 tô phở bò tái'],
    ['🥗 Gợi ý món 40k', 'Gợi ý bữa tối 40k đủ đạm'],
  ])('preserves prompt %s and its exact submitted message', async (label, message) => {
    const { user } = await open();
    expect(apiClient.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: label }));
    await screen.findByText('Bản nháp kiểm thử.');
    expect(apiClient.post).toHaveBeenCalledWith('/assistant/chat', { session_id: 1, message });
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
    expect(apiClient.post).toHaveBeenLastCalledWith('/meals/log', { meal_type: 'lunch', items: [{ food_id: 7, food_name: 'Món kiểm thử', estimated_gram: 100 }], is_confirmed: true });
    await act(async () => pending.resolve(ack));
    expect(await screen.findByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Xác nhận lưu' })).not.toBeInTheDocument();
  });

  it('cancels immutably without saving or refreshing', async () => {
    const { user } = await open(); await requestCard(user);
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByText('Đã hủy · Bữa ăn chưa được lưu')).toBeInTheDocument();
    expect(card.status).toBe('pending_user_action');
    expect(saves()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a definite validation failure and allows only an explicit retry', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Rejected', { status: 400 }));
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ chưa chấp nhận');
    expect(onSaved).not.toHaveBeenCalled(); expect(saves()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
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
    expect(screen.queryByRole('button', { name: 'Thử lưu lại' })).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled(); expect(saves()).toHaveLength(1);
  });

  it('does not retry a timeout or claim that the meal was not saved', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Timeout', { isNetworkError: true }));
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('tránh trùng bữa ăn');
    expect(screen.queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument();
    expect(screen.queryByText('Đã hủy · Bữa ăn chưa được lưu')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: '🍲 Ghi nhận phở bò' }));
    expect(await screen.findByText(/Thẻ này chưa hỗ trợ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận lưu' })).not.toBeInTheDocument();
    expect(saves()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  });

  it('retains a confirmed card when a concurrent chat reply arrives', async () => {
    const { user } = await open(); const confirm = await requestCard(user);
    const pendingReply = deferred<ReturnType<typeof reply>>();
    vi.mocked(apiClient.post).mockReturnValueOnce(pendingReply.promise);
    await user.click(screen.getByRole('button', { name: '💡 Calo còn lại?' }));
    await user.click(confirm);
    expect(await screen.findByText(/Đã lưu vào nhật ký · 135 kcal/)).toBeInTheDocument();
    await act(async () => pendingReply.resolve({ data: { reply_text: 'Phản hồi đến sau.', action_card: null, disclaimer: '' } }));
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

  it('traps focus, supports Escape, restores focus and cleans up modal effects', async () => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'scroll';
    const { user, unmount } = await open();
    const close = screen.getByRole('button', { name: 'Đóng trợ lý' });
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
    expect(screen.getByRole('button', { name: 'Xác nhận lưu' })).toBeDisabled();
    await act(async () => pending.resolve(ack));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
