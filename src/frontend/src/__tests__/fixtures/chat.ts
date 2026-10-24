/**
 * src/frontend/src/__tests__/fixtures/chat.ts
 * Bộ dữ liệu mẫu ẩn danh phục vụ kiểm thử đơn vị và tích hợp cho phân hệ Chat (W4).
 */

export const mockChatTurnStandard = {
  session_id: 1,
  reply: 'Mình đã ước tính xong bữa ăn của bạn! Vui lòng kiểm tra lại số liệu bên dưới và nhấn Xác nhận để lưu nhé.',
  reply_text: 'Mình đã ước tính xong bữa ăn của bạn! Vui lòng kiểm tra lại số liệu bên dưới và nhấn Xác nhận để lưu nhé.',
  pending_confirmation: true,
  action_card: {
    type: 'confirm_log_meal',
    status: 'pending_user_action',
    data: {
      meal_type: 'Trưa',
      items: [
        {
          food_id: 4,
          food_name: 'Phở bò tái',
          estimated_gram: 400.0,
          calories: 460.0,
          protein_g: 34.0,
          carbs_g: 56.8,
          fat_g: 11.2,
        },
      ],
      total_calories: 460.0,
    },
  },
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
};

export const mockChatTurnAliases = {
  sessionId: 'sess-abc-123',
  content: 'Gợi ý món ăn tối nay của bạn.',
  pending_confirmation_data: {
    mealType: 'dinner',
    foods: [
      {
        foodId: 10,
        name: 'Cơm tấm sườn nướng',
        grams: 300,
        calories: 550,
      },
    ],
    totalCalories: 550,
  },
};

export const mockChatTurnNoCard = {
  session_id: 2,
  reply: 'Hôm nay bạn đã nạp 500 kcal / mục tiêu 2000 kcal. Còn lại 1500 kcal.',
  pending_confirmation: false,
};

export const mockChatTurnInvalidCardNoFoodId = {
  session_id: 3,
  reply: 'Có vẻ bạn muốn ghi bữa ăn nhưng chưa khớp được mã món ăn.',
  action_card: {
    data: {
      meal_type: 'breakfast',
      items: [
        {
          food_name: 'Bánh mì lạ',
          estimated_gram: 150,
        },
      ],
    },
  },
};

export const mockChatTurnInvalidGram = {
  session_id: 4,
  reply: 'Khẩu phần không hợp lệ.',
  action_card: {
    data: {
      meal_type: 'lunch',
      items: [
        {
          food_id: 4,
          food_name: 'Phở',
          estimated_gram: -50,
        },
      ],
    },
  },
};

export const mockChatTurnWithExpiryAndActionId = {
  session_id: 5,
  reply: 'Xác nhận trước khi hết hạn.',
  action_card: {
    action_id: 'act-999',
    status: 'pending',
    expires_at: '2026-10-24T12:00:00Z',
    data: {
      meal_type: 'snack',
      items: [
        {
          food_id: 12,
          food_name: 'Táo tươi',
          estimated_gram: 120,
          calories: 60,
        },
      ],
      total_calories: 60,
    },
  },
};
