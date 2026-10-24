import { describe, expect, it } from 'vitest';
import { normalizeAssistantResponse, ALIASES, MEAL_TYPE_MAP } from '../api/chatContract';
import {
  mockChatTurnStandard,
  mockChatTurnAliases,
  mockChatTurnNoCard,
  mockChatTurnInvalidCardNoFoodId,
  mockChatTurnInvalidGram,
  mockChatTurnWithExpiryAndActionId,
} from './fixtures/chat';

describe('chatContract — normalizeAssistantResponse (Tolerant Reader)', () => {
  it.each(['confirm_update_goal', 'recommendation_preview', 'unknown'])('does not turn %s into a saveable meal', type => {
    const result = normalizeAssistantResponse({ ...mockChatTurnStandard, action_card: { ...mockChatTurnStandard.action_card, type } });
    expect(result.card).toBeNull();
    expect(result.text).toBe(mockChatTurnStandard.reply_text);
  });
  it.each(['confirmed', 'cancelled', 'unknown'])('keeps card status %s readonly', status => {
    const result = normalizeAssistantResponse({ ...mockChatTurnStandard, action_card: { ...mockChatTurnStandard.action_card, status } });
    expect(result.card?.state).toBe('readonly');
  });
  it('keeps an unverified expiry contract readonly and missing nutrition undefined', () => {
    const result = normalizeAssistantResponse({ action_card: { type: 'confirm_log_meal', status: 'pending_user_action', expires_at: 'invalid', data: { meal_type: 'lunch', items: [{ food_id: 4, food_name: 'Món kiểm thử', estimated_gram: 100 }] } } });
    expect(result.card?.state).toBe('readonly');
    expect(result.card?.totals).toBeUndefined();
    expect(result.card?.items[0].calories).toBeUndefined();
  });
  it('1. Chuẩn hóa thành công fixture thật tiêu chuẩn (Standard)', () => {
    const res = normalizeAssistantResponse(mockChatTurnStandard);
    expect(res.sessionId).toBe(1);
    expect(res.text).toContain('Mình đã ước tính xong');
    expect(res.card).not.toBeNull();
    expect(res.card?.kind).toBe('log_meal');
    expect(res.card?.mealType).toBe('lunch');
    expect(res.card?.items).toHaveLength(1);
    expect(res.card?.items[0].food_id).toBe(4);
    expect(res.card?.items[0].estimated_gram).toBe(400);
    expect(res.card?.totals?.calories).toBe(460);
    expect(res.warnings).toHaveLength(0);
  });

  it('2. Chuẩn hóa thành công các alias khác nhau (sessionId, foods, mealType, grams)', () => {
    const res = normalizeAssistantResponse(mockChatTurnAliases);
    expect(res.sessionId).toBe('sess-abc-123');
    expect(res.text).toBe('Gợi ý món ăn tối nay của bạn.');
    expect(res.card).not.toBeNull();
    expect(res.card?.mealType).toBe('dinner');
    expect(res.card?.items[0].food_id).toBe(10);
    expect(res.card?.items[0].food_name).toBe('Cơm tấm sườn nướng');
    expect(res.card?.items[0].estimated_gram).toBe(300);
    expect(res.card?.totals?.calories).toBe(550);
  });

  it('3. Xử lý phản hồi chỉ có văn bản và không có thẻ (No Card)', () => {
    const res = normalizeAssistantResponse(mockChatTurnNoCard);
    expect(res.sessionId).toBe(2);
    expect(res.text).toContain('Hôm nay bạn đã nạp 500 kcal');
    expect(res.card).toBeNull();
    expect(res.warnings).toHaveLength(0);
  });

  it('4. Loại bỏ thẻ nếu thiếu food_id và không ném lỗi ra ngoài', () => {
    const res = normalizeAssistantResponse(mockChatTurnInvalidCardNoFoodId);
    expect(res.card).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.text).toContain('Có vẻ bạn muốn ghi bữa ăn');
  });

  it('5. Loại bỏ thẻ nếu gram âm hoặc bằng 0', () => {
    const res = normalizeAssistantResponse(mockChatTurnInvalidGram);
    expect(res.card).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('6. Loại bỏ thẻ nếu gram vượt quá giới hạn tối đa 3000g', () => {
    const res = normalizeAssistantResponse({
      reply: 'Quá nhiều',
      action_card: {
        data: {
          items: [{ food_id: 1, food_name: 'Phở', estimated_gram: 5000 }],
        },
      },
    });
    expect(res.card).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('7. Trích xuất đúng action_id và expires_at khi backend cung cấp', () => {
    const res = normalizeAssistantResponse(mockChatTurnWithExpiryAndActionId);
    expect(res.card).not.toBeNull();
    expect(res.card?.actionId).toBe('act-999');
    expect(res.card?.expiresAt).toBe('2026-10-24T12:00:00Z');
    expect(res.card?.mealType).toBe('snack');
  });

  it('8. Xử lý an toàn khi payload null, undefined, số hoặc chuỗi', () => {
    expect(normalizeAssistantResponse(null).card).toBeNull();
    expect(normalizeAssistantResponse(undefined).card).toBeNull();
    expect(normalizeAssistantResponse(123).card).toBeNull();
    expect(normalizeAssistantResponse('hello').text).toBe('hello');
  });

  it('9. Cung cấp câu trả lời mặc định an toàn khi cả text và card đều rỗng', () => {
    const res = normalizeAssistantResponse({});
    expect(res.text).toBe('Trợ lý trả về dữ liệu không đọc được. Vui lòng thử lại.');
    expect(res.card).toBeNull();
  });

  it('10. Ánh xạ chính xác các loại bữa ăn tiếng Việt sang tiếng Anh', () => {
    expect(MEAL_TYPE_MAP['sáng']).toBe('breakfast');
    expect(MEAL_TYPE_MAP['bữa sáng']).toBe('breakfast');
    expect(MEAL_TYPE_MAP['trưa']).toBe('lunch');
    expect(MEAL_TYPE_MAP['tối']).toBe('dinner');
    expect(MEAL_TYPE_MAP['phụ']).toBe('snack');
  });

  it('11. Cảnh báo an toàn không bao giờ chứa giá trị nhạy cảm', () => {
    const res = normalizeAssistantResponse({
      action_card: {
        data: {
          items: [{ food_id: -99, food_name: 'Bí mật', estimated_gram: 'sai' }],
        },
      },
    });
    for (const w of res.warnings) {
      expect(w).not.toContain('Bí mật');
      expect(w).not.toContain('-99');
    }
  });

  it('12. Thẻ có nhiều hơn 20 món bị loại bỏ an toàn (maxItems check)', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      food_id: i + 1,
      food_name: `Món ${i + 1}`,
      estimated_gram: 100,
    }));
    const res = normalizeAssistantResponse({
      reply: 'Thực đơn tiệc',
      action_card: { data: { items } },
    });
    expect(res.card).toBeNull();
    expect(res.warnings).toContain('card.items:too_many');
  });

  it('13. Bỏ qua các trường lạ (extra fields) mà không lỗi', () => {
    const res = normalizeAssistantResponse({
      unknown_field_1: 'test',
      reply_text: 'Xin chào',
      unknown_field_2: 12345,
    });
    expect(res.text).toBe('Xin chào');
  });

  it('14. Xử lý items rỗng (empty items array) trả về cảnh báo an toàn', () => {
    const res = normalizeAssistantResponse({
      reply: 'Không có món',
      action_card: { data: { items: [] } },
    });
    expect(res.card).toBeNull();
    expect(res.warnings).toContain('card.items:empty');
  });

  it('15. Tên món ăn rỗng bị loại bỏ', () => {
    const res = normalizeAssistantResponse({
      action_card: {
        data: {
          items: [{ food_id: 1, food_name: '   ', estimated_gram: 100 }],
        },
      },
    });
    expect(res.card).toBeNull();
  });

  it('16. Bảng ALIASES có đầy đủ các biến thể từ khóa bắt buộc', () => {
    expect(ALIASES.text).toContain('reply_text');
    expect(ALIASES.text).toContain('reply');
    expect(ALIASES.sessionId).toContain('session_id');
    expect(ALIASES.card).toContain('action_card');
    expect(ALIASES.items).toContain('items');
  });

  it('17. Khối lượng gram dạng chuỗi số được ép kiểu hợp lệ', () => {
    const res = normalizeAssistantResponse({
      reply: 'Bữa trưa',
      action_card: {
        data: {
          items: [{ food_id: 5, food_name: 'Gà', estimated_gram: '250' }],
        },
      },
    });
    expect(res.card).not.toBeNull();
    expect(res.card?.items[0].estimated_gram).toBe(250);
  });

  it('18. Calo tổng dạng chuỗi số được ép kiểu hợp lệ', () => {
    const res = normalizeAssistantResponse({
      reply: 'Bữa trưa',
      action_card: {
        data: {
          items: [{ food_id: 5, food_name: 'Gà', estimated_gram: 250 }],
          total_calories: '350',
        },
      },
    });
    expect(res.card?.totals?.calories).toBe(350);
  });

  it('19. food_id dạng chuỗi số dương được ép kiểu hợp lệ', () => {
    const res = normalizeAssistantResponse({
      reply: 'Bữa trưa',
      action_card: {
        data: {
          items: [{ food_id: '4', food_name: 'Phở', estimated_gram: 300 }],
        },
      },
    });
    expect(res.card?.items[0].food_id).toBe(4);
  });

  it('20. Phản hồi hợp lệ gán trạng thái ban đầu của thẻ là pending', () => {
    const res = normalizeAssistantResponse(mockChatTurnStandard);
    expect(res.card?.state).toBe('pending');
  });
});
