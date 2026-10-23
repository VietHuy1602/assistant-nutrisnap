import { describe, expect, it } from 'vitest';
import {
  chatReducer,
  initialChatState,
  type ChatState,
} from '../chat/chatReducer';
import {
  canTransitionCard,
  transitionCard,
  VALID_CARD_TRANSITIONS,
} from '../chat/actionCardMachine';
import {
  resolveStrategy,
  buildLogPayload,
} from '../chat/confirmStrategy';
import type { ActionCardModel } from '../chat/types';

describe('chatReducer — Lõi trạng thái hội thoại thuần túy', () => {
  it('1. Trạng thái khởi tạo mặc định đúng chuẩn', () => {
    expect(initialChatState.messages).toEqual([]);
    expect(initialChatState.status).toBe('idle');
    expect(initialChatState.historyStatus).toBe('idle');
    expect(initialChatState.cards).toEqual({});
  });

  it('2. SEND_START: Thêm tin nhắn lạc quan với status sending và khóa in-flight', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Ăn phở',
    });
    expect(s1.status).toBe('sending');
    expect(s1.currentPendingClientId).toBe('c1');
    expect(s1.messages).toHaveLength(1);
    expect(s1.messages[0].text).toBe('Ăn phở');
    expect(s1.messages[0].status).toBe('sending');
  });

  it('3. SEND_START: Chặn gửi tin thứ hai khi đang có tin in-flight', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Tin 1',
    });
    const s2 = chatReducer(s1, {
      type: 'SEND_START',
      clientId: 'c2',
      text: 'Tin 2',
    });
    expect(s2.messages).toHaveLength(1);
    expect(s2.currentPendingClientId).toBe('c1');
  });

  it('4. AWAITING_REPLY: Chuyển status sang awaitingReply khi request đã gửi', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Tin 1',
    });
    const s2 = chatReducer(s1, { type: 'AWAITING_REPLY' });
    expect(s2.status).toBe('awaitingReply');
  });

  it('5. SLOW: Chuyển status sang slow khi quá 8s', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Tin 1',
    });
    const s2 = chatReducer(s1, { type: 'AWAITING_REPLY' });
    const s3 = chatReducer(s2, { type: 'SLOW' });
    expect(s3.status).toBe('slow');
  });

  it('6. REPLY_OK: Đánh dấu tin user thành sent và thêm tin trợ lý kèm thẻ', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Ghi phở',
    });
    const sampleCard: ActionCardModel = {
      id: 'card-1',
      kind: 'log_meal',
      state: 'pending',
      mealType: 'lunch',
      items: [{ food_id: 4, food_name: 'Phở bò', estimated_gram: 400 }],
    };
    const s2 = chatReducer(s1, {
      type: 'REPLY_OK',
      sessionId: 10,
      text: 'Đã tính calo',
      card: sampleCard,
    });
    expect(s2.status).toBe('idle');
    expect(s2.currentPendingClientId).toBeNull();
    expect(s2.sessionId).toBe(10);
    expect(s2.messages).toHaveLength(2);
    expect(s2.messages[0].status).toBe('sent');
    expect(s2.messages[1].sender).toBe('assistant');
    expect(s2.messages[1].cardId).toBe('card-1');
    expect(s2.cards['card-1']).toBeDefined();
  });

  it('7. SEND_FAILED: Đánh dấu tin user failed, thêm thông báo hệ thống và mở khóa in-flight', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Tin lỗi',
    });
    const s2 = chatReducer(s1, {
      type: 'SEND_FAILED',
      error: 'Lỗi mạng 500',
    });
    expect(s2.status).toBe('idle');
    expect(s2.currentPendingClientId).toBeNull();
    expect(s2.messages[0].status).toBe('failed');
    expect(s2.messages[0].isRetryable).toBe(true);
    expect(s2.messages[1].sender).toBe('system');
  });

  it('8. CANCEL: Hủy tin nhắn không để lại tin trợ lý rác', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Muốn hủy',
    });
    const s2 = chatReducer(s1, { type: 'CANCEL' });
    expect(s2.status).toBe('idle');
    expect(s2.currentPendingClientId).toBeNull();
    expect(s2.messages).toHaveLength(1);
    expect(s2.messages[0].status).toBe('failed');
    expect(s2.messages[0].error).toContain('Đã hủy');
  });

  it('9. RETRY_PREPARE: Loại bỏ tin nhắn lỗi cũ để sẵn sàng gửi lại', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Gửi lại',
    });
    const s2 = chatReducer(s1, { type: 'SEND_FAILED', error: 'Thất bại' });
    const s3 = chatReducer(s2, { type: 'RETRY_PREPARE', clientId: 'c1' });
    expect(s3.messages.find((m) => m.clientId === 'c1')).toBeUndefined();
  });

  it('10. HISTORY_LOADED: Khử trùng lặp tin nhắn lịch sử', () => {
    const s1: ChatState = {
      ...initialChatState,
      messages: [
        { id: '1', clientId: '1', sender: 'user', text: 'Tin cũ', createdAt: '2026-10-24T00:00:00Z' },
      ],
    };
    const s2 = chatReducer(s1, {
      type: 'HISTORY_LOADED',
      sessionId: 5,
      messages: [
        { id: '1', senderRole: 'user', content: 'Tin cũ', createdAt: '2026-10-24T00:00:00Z' },
        { id: '2', senderRole: 'assistant', content: 'Tin mới từ lịch sử', createdAt: '2026-10-24T00:01:00Z' },
      ],
    });
    expect(s2.messages).toHaveLength(2);
    expect(s2.historyStatus).toBe('ready');
  });

  it('11. HISTORY_FAILED: Đánh dấu trạng thái lỗi lịch sử', () => {
    const s = chatReducer(initialChatState, { type: 'HISTORY_FAILED' });
    expect(s.historyStatus).toBe('error');
  });

  it('12. UPDATE_CARD: Cập nhật thẻ tương ứng trong dictionary', () => {
    const card: ActionCardModel = {
      id: 'c-1',
      kind: 'log_meal',
      state: 'pending',
      mealType: 'lunch',
      items: [],
    };
    const s1 = { ...initialChatState, cards: { 'c-1': card } };
    const updatedCard: ActionCardModel = { ...card, state: 'confirmed' };
    const s2 = chatReducer(s1, { type: 'UPDATE_CARD', card: updatedCard });
    expect(s2.cards['c-1'].state).toBe('confirmed');
  });

  it('13. SYSTEM_NOTE: Thêm ghi chú hệ thống với các tông màu', () => {
    const s = chatReducer(initialChatState, {
      type: 'SYSTEM_NOTE',
      text: 'Đã làm mới',
      tone: 'success',
    });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].sender).toBe('system');
    expect(s.messages[0].systemTone).toBe('success');
  });

  it('14. RESET: Xóa sạch toàn bộ phiên, tin nhắn và thẻ', () => {
    const s1 = chatReducer(initialChatState, {
      type: 'SEND_START',
      clientId: 'c1',
      text: 'Tin',
    });
    const s2 = chatReducer(s1, { type: 'RESET' });
    expect(s2).toEqual(initialChatState);
  });
});

describe('actionCardMachine — Máy trạng thái Thẻ hành động', () => {
  const baseCard: ActionCardModel = {
    id: 'test-card',
    kind: 'log_meal',
    state: 'pending',
    mealType: 'lunch',
    items: [{ food_id: 4, food_name: 'Phở bò', estimated_gram: 400 }],
  };

  it('1. pending -> editing (START_EDIT)', () => {
    const c = transitionCard(baseCard, { type: 'START_EDIT' });
    expect(c.state).toBe('editing');
  });

  it('2. editing -> pending (CANCEL_EDIT)', () => {
    const editingCard: ActionCardModel = { ...baseCard, state: 'editing' };
    const c = transitionCard(editingCard, { type: 'CANCEL_EDIT' });
    expect(c.state).toBe('pending');
  });

  it('3. pending -> confirming (START_CONFIRM)', () => {
    const c = transitionCard(baseCard, { type: 'START_CONFIRM' });
    expect(c.state).toBe('confirming');
  });

  it('4. editing -> confirming (START_CONFIRM)', () => {
    const editingCard: ActionCardModel = { ...baseCard, state: 'editing' };
    const c = transitionCard(editingCard, { type: 'START_CONFIRM' });
    expect(c.state).toBe('confirming');
  });

  it('5. confirming -> confirmed (CONFIRM_SUCCESS)', () => {
    const confirmingCard: ActionCardModel = { ...baseCard, state: 'confirming' };
    const c = transitionCard(confirmingCard, { type: 'CONFIRM_SUCCESS', mealId: 55, calories: 460 });
    expect(c.state).toBe('confirmed');
    expect(c.savedMealId).toBe(55);
    expect(c.savedCalories).toBe(460);
  });

  it('6. confirming -> failed (CONFIRM_FAILED)', () => {
    const confirmingCard: ActionCardModel = { ...baseCard, state: 'confirming' };
    const c = transitionCard(confirmingCard, { type: 'CONFIRM_FAILED', error: 'Lỗi 500' });
    expect(c.state).toBe('failed');
    expect(c.errorMessage).toBe('Lỗi 500');
  });

  it('7. confirming -> uncertain (CONFIRM_UNCERTAIN)', () => {
    const confirmingCard: ActionCardModel = { ...baseCard, state: 'confirming' };
    const c = transitionCard(confirmingCard, { type: 'CONFIRM_UNCERTAIN' });
    expect(c.state).toBe('uncertain');
    expect(c.errorMessage).toContain('Dashboard');
  });

  it('8. failed -> confirming (START_CONFIRM: Thử lại)', () => {
    const failedCard: ActionCardModel = { ...baseCard, state: 'failed', errorMessage: 'Lỗi' };
    const c = transitionCard(failedCard, { type: 'START_CONFIRM' });
    expect(c.state).toBe('confirming');
    expect(c.errorMessage).toBeUndefined();
  });

  it('9. uncertain -> confirming (START_CONFIRM: Thử lại sau kiểm tra)', () => {
    const uncertainCard: ActionCardModel = { ...baseCard, state: 'uncertain' };
    const c = transitionCard(uncertainCard, { type: 'START_CONFIRM' });
    expect(c.state).toBe('confirming');
  });

  it('10. pending -> expired (EXPIRE)', () => {
    const c = transitionCard(baseCard, { type: 'EXPIRE' });
    expect(c.state).toBe('expired');
  });

  it('11. Chặn chuyển trạng thái khi thẻ đã confirmed (Terminal state)', () => {
    const confirmedCard: ActionCardModel = { ...baseCard, state: 'confirmed' };
    const c = transitionCard(confirmedCard, { type: 'START_CONFIRM' });
    expect(c.state).toBe('confirmed');
  });

  it('12. Bỏ qua các chuyển trạng thái không hợp lệ mà không ném lỗi', () => {
    // Không thể nhảy từ pending thẳng sang confirmed mà không qua confirming
    const c = transitionCard(baseCard, { type: 'CONFIRM_SUCCESS', mealId: 1 });
    expect(c.state).toBe('pending');
  });

  it('13. Bảng chuyển trạng thái VALID_CARD_TRANSITIONS đúng cấu trúc và canTransitionCard hoạt động', () => {
    expect(canTransitionCard('pending', 'confirming')).toBe(true);
    expect(canTransitionCard('pending', 'confirmed')).toBe(false);
    expect(VALID_CARD_TRANSITIONS.pending).toContain('confirming');
    expect(VALID_CARD_TRANSITIONS.pending).toContain('editing');
    expect(VALID_CARD_TRANSITIONS.confirmed).toHaveLength(0);
    expect(VALID_CARD_TRANSITIONS.readonly).toHaveLength(0);
  });
});

describe('confirmStrategy — Bộ chọn chiến lược xác nhận S1/S2/S3 & Payload Builder', () => {
  const validCard: ActionCardModel = {
    id: 'c-valid',
    kind: 'log_meal',
    state: 'pending',
    mealType: 'lunch',
    items: [
      { food_id: 4, food_name: 'Phở bò tái', estimated_gram: 400 },
      { food_id: 8, food_name: 'Trà đá', estimated_gram: 200 },
    ],
  };

  it('1. Chọn S2 khi thẻ có các món với food_id và gram hợp lệ', () => {
    expect(resolveStrategy(validCard)).toBe('S2');
  });

  it('2. Chọn S1 khi thẻ có actionId và môi trường hỗ trợ confirm endpoint', () => {
    const s1Card: ActionCardModel = {
      ...validCard,
      actionId: 'action-123',
    };
    expect(resolveStrategy(s1Card, { hasConfirmEndpoint: true })).toBe('S1');
  });

  it('3. Rơi về S2 nếu thẻ có actionId nhưng không có confirm endpoint', () => {
    const s1Card: ActionCardModel = {
      ...validCard,
      actionId: 'action-123',
    };
    expect(resolveStrategy(s1Card, { hasConfirmEndpoint: false })).toBe('S2');
  });

  it('4. Chọn S3 nếu thẻ ở trạng thái readonly hoặc expired', () => {
    expect(resolveStrategy({ ...validCard, state: 'readonly' })).toBe('S3');
    expect(resolveStrategy({ ...validCard, state: 'expired' })).toBe('S3');
    expect(resolveStrategy({ ...validCard, state: 'confirmed' })).toBe('S3');
  });

  it('5. Chọn S3 nếu món ăn thiếu food_id hoặc food_id <= 0', () => {
    const invalidCard: ActionCardModel = {
      ...validCard,
      items: [{ food_id: 0, food_name: 'Món lạ', estimated_gram: 100 }],
    };
    expect(resolveStrategy(invalidCard)).toBe('S3');
  });

  it('6. Chọn S3 nếu món ăn có gram <= 0', () => {
    const invalidCard: ActionCardModel = {
      ...validCard,
      items: [{ food_id: 4, food_name: 'Phở', estimated_gram: -50 }],
    };
    expect(resolveStrategy(invalidCard)).toBe('S3');
  });

  it('7. Chọn S3 nếu danh sách món rỗng', () => {
    expect(resolveStrategy({ ...validCard, items: [] })).toBe('S3');
  });

  it('8. buildLogPayload tạo payload chính xác và TUYỆT ĐỐI KHÔNG CÓ user_id', () => {
    const payload = buildLogPayload(validCard);
    expect(payload.meal_type).toBe('lunch');
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toEqual({
      food_id: 4,
      food_name: 'Phở bò tái',
      estimated_gram: 400,
    });
    expect(payload.is_confirmed).toBe(true);
    expect((payload as unknown as Record<string, unknown>).user_id).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).authenticated_user_id).toBeUndefined();
  });
});
