/**
 * src/frontend/src/__tests__/w3_contracts_reducer.test.ts
 * Unit tests for W3 Zod schemas (Contract Guard) and mealDraftReducer.
 * Adheres to ADR-W3-04 (Pure reducer state machine) and Tolerant Reader principles.
 */

import { describe, it, expect } from 'vitest';
import {
  recognizeFoodResponseSchema,
  mealLogResponseSchema,
  dailyDashboardResponseSchema,
  foodSearchResponseSchema,
} from '../api/contracts';
import {
  mealDraftReducer,
  initialDraftState,
  isDraftSavable,
  getDraftUnsavableReasons,
  MealDraftState,
  DraftMealItem,
} from '../components/meal/mealDraftReducer';
import type { FoodReferenceItem, RecognizedFoodItem } from '../types/api';

describe('W3 Contracts — Zod Schemas & Tolerant Reader', () => {
  it('1. recognizeFoodResponseSchema parse thành công payload nhận diện chuẩn', () => {
    const raw = {
      success: true,
      status: 'pending_confirmation',
      meal_type: 'lunch',
      detected_items: [
        {
          food_id: 1,
          food_name: 'Phở bò tái',
          estimated_gram: 450,
          confidence: 0.95,
          matched_name: 'Phở bò',
          estimated_calories: 540,
        },
      ],
      total_estimated_calories: 540,
      message: 'Nhận diện thành công',
    };

    const parsed = recognizeFoodResponseSchema.parse(raw);
    expect(parsed.status).toBe('pending_confirmation');
    expect(parsed.detected_items).toHaveLength(1);
    expect(parsed.detected_items[0].food_name).toBe('Phở bò tái');
  });

  it('2. recognizeFoodResponseSchema chấp nhận trường bổ sung không khai báo (Tolerant Reader)', () => {
    const raw = {
      status: 'pending_confirmation',
      detected_items: [
        {
          food_id: 2,
          food_name: 'Cơm tấm',
          estimated_gram: 300,
          confidence: 0.88,
          extra_ai_model_version: 'vision-v2.1', // Trường mở rộng
        },
      ],
      backend_latency_ms: 320,
    };

    const parsed = recognizeFoodResponseSchema.parse(raw);
    expect(parsed.status).toBe('pending_confirmation');
    expect(parsed.detected_items[0].food_name).toBe('Cơm tấm');
  });

  it('3. recognizeFoodResponseSchema báo lỗi nếu thiếu trường bắt buộc', () => {
    const invalid = {
      status: 'pending_confirmation',
      detected_items: [
        {
          // Thiếu food_name và estimated_gram
          food_id: 3,
        },
      ],
    };

    expect(() => recognizeFoodResponseSchema.parse(invalid)).toThrow();
  });

  it('4. mealLogResponseSchema parse thành công phản hồi lưu bữa ăn', () => {
    const raw = {
      meal_id: 42,
      status: 'logged',
      meal_type: 'lunch',
      logged_at: '2026-10-23T12:00:00Z',
      nutrition: {
        items: [],
        total_weight_g: 400,
        total_calories: 620,
        total_protein_g: 35,
        total_carbs_g: 75,
        total_fat_g: 15,
        total_estimated_price_vnd: 50000,
        disclaimer: 'Ước tính',
      },
      disclaimer: 'Ước tính',
      success: true,
      total_calories: 620,
    };

    const parsed = mealLogResponseSchema.parse(raw);
    expect(parsed.meal_id).toBe(42);
    expect(parsed.status).toBe('logged');
    expect(parsed.total_calories).toBe(620);
  });

  it('5. dailyDashboardResponseSchema parse thành công dashboard với đầy đủ macros', () => {
    const raw = {
      date: '2026-10-23',
      target_calories: 2000,
      consumed_calories: 1250,
      remaining_calories: 750,
      calories_progress_percent: 62.5,
      macros: {
        protein: { consumed: 60, target: 120, unit: 'g', progress_percent: 50 },
        carbs: { consumed: 150, target: 250, unit: 'g', progress_percent: 60 },
        fat: { consumed: 35, target: 65, unit: 'g', progress_percent: 53.8 },
      },
      meals_summary: [],
      disclaimer: 'Ước tính dinh dưỡng tham khảo.',
    };

    const parsed = dailyDashboardResponseSchema.parse(raw);
    expect(parsed.target_calories).toBe(2000);
    expect(parsed.macros.protein.consumed).toBe(60);
    expect(parsed.remaining_calories).toBe(750);
  });

  it('6. foodSearchResponseSchema parse danh sách món ăn từ CSDL', () => {
    const raw = {
      items: [
        {
          id: 10,
          food_name: 'Bún chả Hà Nội',
          calories_per_100g: 175,
          protein_per_100g: 9.2,
          carbs_per_100g: 18.4,
          fat_per_100g: 6.5,
          avg_price_vnd: 45000,
        },
      ],
    };

    const parsed = foodSearchResponseSchema.parse(raw);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].food_name).toBe('Bún chả Hà Nội');
  });
});

describe('W3 Reducer — mealDraftReducer (ADR-W3-04 Pure Reducer & Draft Management)', () => {
  it('7. SET_MEAL_TYPE cập nhật loại bữa ăn', () => {
    const next = mealDraftReducer(initialDraftState, { type: 'SET_MEAL_TYPE', mealType: 'dinner' });
    expect(next.mealType).toBe('dinner');
  });

  it('8. LOAD_RECOGNIZED nạp danh sách món từ AI và sinh key duy nhất ổn định', () => {
    const recognizedItems: RecognizedFoodItem[] = [
      {
        food_id: 1,
        food_name: 'Phở bò',
        estimated_gram: 400,
        confidence: 0.9,
        is_matched: true,
        estimated_calories: 500,
        protein_g: 25,
        carbs_g: 60,
        fat_g: 12,
      },
      {
        food_id: 2,
        food_name: 'Quẩy',
        estimated_gram: 50,
        confidence: 0.8,
        is_matched: true,
        estimated_calories: 120,
        protein_g: 3,
        carbs_g: 18,
        fat_g: 5,
      },
    ];

    const next = mealDraftReducer(initialDraftState, {
      type: 'LOAD_RECOGNIZED',
      recognizedItems,
      mealType: 'breakfast',
    });

    expect(next.mealType).toBe('breakfast');
    expect(next.items).toHaveLength(2);
    expect(next.items[0].food_name).toBe('Phở bò');
    expect(next.items[0].estimated_gram).toBe(400);
    expect(next.items[0].key).toBeDefined();
    expect(next.items[0].key).not.toBe(next.items[1].key);
  });

  it('9. SET_GRAM cập nhật số gam và giới hạn trong khoảng 0 - 3000g', () => {
    const stateWithItem: MealDraftState = {
      ...initialDraftState,
      items: [
        { key: 'item-1', food_id: 1, food_name: 'Cơm', estimated_gram: 200, source: 'ai' },
      ],
    };

    const next = mealDraftReducer(stateWithItem, { type: 'SET_GRAM', key: 'item-1', gram: 250 });
    expect(next.items[0].estimated_gram).toBe(250);

    // Kẹp max 3000g
    const clampedMax = mealDraftReducer(stateWithItem, { type: 'SET_GRAM', key: 'item-1', gram: 5000 });
    expect(clampedMax.items[0].estimated_gram).toBe(3000);

    // Kẹp min 0g
    const clampedMin = mealDraftReducer(stateWithItem, { type: 'SET_GRAM', key: 'item-1', gram: -50 });
    expect(clampedMin.items[0].estimated_gram).toBe(0);
  });

  it('10. SWAP_FOOD thay thế món ăn bằng món mới từ CSDL và giữ nguyên số gam', () => {
    const stateWithItem: MealDraftState = {
      ...initialDraftState,
      items: [
        { key: 'item-1', food_id: 1, food_name: 'Thịt kho tàu', estimated_gram: 150, source: 'ai' },
      ],
    };

    const replacement: FoodReferenceItem = {
      id: 99,
      food_name: 'Thịt gà luộc',
      calories_per_100g: 165,
      protein_per_100g: 25,
      carbs_per_100g: 0,
      fat_per_100g: 5,
      avg_price_vnd: 40000,
    };

    const next = mealDraftReducer(stateWithItem, {
      type: 'SWAP_FOOD',
      key: 'item-1',
      food: replacement,
    });

    expect(next.items[0].food_id).toBe(99);
    expect(next.items[0].food_name).toBe('Thịt gà luộc');
    expect(next.items[0].estimated_gram).toBe(150); // Giữ nguyên gam
    expect(next.items[0].source).toBe('manual');
    expect(next.items[0].confidence).toBe(1.0);
  });

  it('11. REMOVE_ITEM xóa món và lưu vào deletedItem phục vụ hoàn tác', () => {
    const stateWithItems: MealDraftState = {
      ...initialDraftState,
      items: [
        { key: 'item-1', food_id: 1, food_name: 'Cơm', estimated_gram: 200, source: 'ai' },
        { key: 'item-2', food_id: 2, food_name: 'Canh', estimated_gram: 150, source: 'ai' },
      ],
    };

    const next = mealDraftReducer(stateWithItems, { type: 'REMOVE_ITEM', key: 'item-1' });
    expect(next.items).toHaveLength(1);
    expect(next.items[0].key).toBe('item-2');
    expect(next.deletedItem).toEqual({
      item: { key: 'item-1', food_id: 1, food_name: 'Cơm', estimated_gram: 200, source: 'ai' },
      index: 0,
    });
  });

  it('12. UNDO_REMOVE khôi phục món đã xóa về đúng vị trí chỉ số ban đầu', () => {
    const stateWithDeleted: MealDraftState = {
      ...initialDraftState,
      items: [
        { key: 'item-2', food_id: 2, food_name: 'Canh', estimated_gram: 150, source: 'ai' },
      ],
      deletedItem: {
        item: { key: 'item-1', food_id: 1, food_name: 'Cơm', estimated_gram: 200, source: 'ai' },
        index: 0,
      },
    };

    const next = mealDraftReducer(stateWithDeleted, { type: 'UNDO_REMOVE' });
    expect(next.items).toHaveLength(2);
    expect(next.items[0].key).toBe('item-1');
    expect(next.items[1].key).toBe('item-2');
    expect(next.deletedItem).toBeNull();
  });

  it('13. CLEAR_UNDO xóa bỏ thông tin hoàn tác khi hết 5 giây', () => {
    const stateWithDeleted: MealDraftState = {
      ...initialDraftState,
      deletedItem: {
        item: { key: 'item-1', food_id: 1, food_name: 'Cơm', estimated_gram: 200, source: 'ai' },
        index: 0,
      },
    };

    const next = mealDraftReducer(stateWithDeleted, { type: 'CLEAR_UNDO' });
    expect(next.deletedItem).toBeNull();
  });

  it('14. ADD_ITEM thêm món mới (thủ công) vào danh sách', () => {
    const food: FoodReferenceItem = {
      id: 5,
      food_name: 'Trứng ốp la',
      calories_per_100g: 155,
      protein_per_100g: 13,
      carbs_per_100g: 1,
      fat_per_100g: 11,
      avg_price_vnd: 10000,
    };

    const next = mealDraftReducer(initialDraftState, { type: 'ADD_ITEM', food });
    expect(next.items).toHaveLength(1);
    expect(next.items[0].food_id).toBe(5);
    expect(next.items[0].food_name).toBe('Trứng ốp la');
    expect(next.items[0].estimated_gram).toBe(100);
  });

  it('15. RESET đặt lại trạng thái về ban đầu', () => {
    const dirtyState: MealDraftState = {
      mealType: 'dinner',
      items: [{ key: 'item-1', food_id: 1, food_name: 'Cơm', estimated_gram: 200, source: 'ai' }],
      deletedItem: null,
    };

    const resetState = mealDraftReducer(dirtyState, { type: 'RESET' });
    expect(resetState.items).toHaveLength(0);
    expect(resetState.mealType).toBe('lunch');
  });

  it('16. isDraftSavable kiểm tra chính xác điều kiện lưu', () => {
    // 0 món -> false
    expect(isDraftSavable([])).toBe(false);

    // Món chưa khớp CSDL (food_id = null) -> false
    const unlinkedItem: DraftMealItem = {
      key: '1',
      food_id: null,
      food_name: 'Món lạ',
      estimated_gram: 100,
      source: 'ai',
    };
    expect(isDraftSavable([unlinkedItem])).toBe(false);

    // Món có gam = 0 -> false
    const zeroGramItem: DraftMealItem = {
      key: '2',
      food_id: 1,
      food_name: 'Phở',
      estimated_gram: 0,
      source: 'ai',
    };
    expect(isDraftSavable([zeroGramItem])).toBe(false);

    // Hợp lệ -> true
    const validItem: DraftMealItem = {
      key: '3',
      food_id: 1,
      food_name: 'Phở',
      estimated_gram: 400,
      source: 'ai',
    };
    expect(isDraftSavable([validItem])).toBe(true);
  });

  it('17. getDraftUnsavableReasons thông báo rõ ràng các nguyên nhân chưa thể lưu', () => {
    expect(getDraftUnsavableReasons([])).toContain('Chưa có món ăn nào trong bữa.');

    const invalidItems: DraftMealItem[] = [
      { key: '1', food_id: null, food_name: 'Món chưa khớp', estimated_gram: 100, source: 'ai' },
      { key: '2', food_id: 2, food_name: 'Cơm', estimated_gram: 0, source: 'ai' },
    ];

    const reasons = getDraftUnsavableReasons(invalidItems);
    expect(reasons.some((r) => r.includes('chưa khớp CSDL'))).toBe(true);
    expect(reasons.some((r) => r.includes('khối lượng không hợp lệ'))).toBe(true);
  });
});
