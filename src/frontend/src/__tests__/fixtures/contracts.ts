/**
 * src/frontend/src/__tests__/fixtures/contracts.ts
 * Test fixtures mirroring JSON examples from docs/02_api_contract_and_screen_flows.md §4.1–§4.2,
 * including edge cases for Tolerant Reader testing (missing optional fields, extra fields, invalid types).
 */

// docs/02 §4.1: POST /api/v1/auth/register response (201 Created)
// Lưu ý: Response này có created_at nhưng KHÔNG có has_goal
export const validRegisterFixture = {
  success: true,
  message: 'Đăng ký tài khoản thành công.',
  user: {
    id: 1,
    username: 'thanhdat',
    email: 'dat@example.com',
    created_at: '2026-10-20T21:45:00Z',
  },
};

// docs/02 §4.1: POST /api/v1/auth/login response (200 OK)
// Lưu ý: Response này có has_goal nhưng KHÔNG có created_at
export const validLoginFixture = {
  success: true,
  message: 'Đăng nhập thành công.',
  has_goal: true,
  user: {
    id: 1,
    username: 'thanhdat',
    email: 'dat@example.com',
  },
};

// docs/02 §4.2: POST/GET /api/v1/goals response (200 OK)
export const validGoalFixture = {
  id: 1,
  user_id: 1,
  target_weight: 67.0,
  bmr_calories: 1690.0,
  tdee_calories: 2150.0,
  target_calories: 1650.0,
  target_protein_g: 125.0,
  target_carbs_g: 185.0,
  target_fat_g: 45.0,
  daily_budget_vnd: 60000,
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.',
};

// Base response fixture
export const validBaseResponseFixture = {
  success: true,
  message: 'Thao tác thành công.',
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.',
};

// Biến thể: Auth thiếu created_at
export const authWithoutCreatedAtFixture = {
  success: true,
  message: 'OK',
  has_goal: false,
  user: {
    id: 2,
    username: 'nguyenkhoi',
    email: 'khoi@example.com',
  },
};

// Biến thể: Auth thiếu has_goal
export const authWithoutHasGoalFixture = {
  success: true,
  message: 'OK',
  user: {
    id: 3,
    username: 'minhduc',
    email: 'duc@example.com',
    created_at: '2026-10-22T08:00:00Z',
  },
};

// Biến thể: Auth có field thừa (Tolerant Reader: bỏ qua không báo lỗi)
export const authWithExtraFieldsFixture = {
  success: true,
  message: 'OK',
  has_goal: true,
  user: {
    id: 4,
    username: 'viethuy',
    email: 'huy@example.com',
    role: 'superadmin',
    avatar_url: 'https://example.com/avatar.png',
  },
  server_load_ms: 42,
  trace_id: 'trace-123456',
};

// Biến thể: Goal có field thừa
export const goalWithExtraFieldsFixture = {
  ...validGoalFixture,
  recommendation_notes: 'Nên uống đủ 2 lít nước',
  extra_metric: 42,
};

// Biến thể sai: Goal thiếu tdee_calories (trường UI bắt buộc)
export const invalidGoalMissingTdeeFixture = {
  id: 1,
  user_id: 1,
  target_weight: 67.0,
  bmr_calories: 1690.0,
  // tdee_calories bị thiếu
  target_calories: 1650.0,
  target_protein_g: 125.0,
  target_carbs_g: 185.0,
  target_fat_g: 45.0,
  daily_budget_vnd: 60000,
  disclaimer: 'Ước tính',
};

// Biến thể sai: Goal sai kiểu target_protein_g (chuỗi thay vì số)
export const invalidGoalWrongMacroTypeFixture = {
  ...validGoalFixture,
  target_protein_g: 'khong_hop_le_string',
};

// Biến thể sai: User thiếu username
export const invalidUserMissingUsernameFixture = {
  success: true,
  message: 'OK',
  has_goal: false,
  user: {
    id: 5,
    email: 'missing_username@example.com',
  },
};
