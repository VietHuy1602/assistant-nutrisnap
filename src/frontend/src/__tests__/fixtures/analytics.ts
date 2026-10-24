/**
 * src/frontend/src/__tests__/fixtures/analytics.ts
 * Sanitized test fixtures for Progress Analytics, Food Swap, and Voice flow.
 * Section 8 Step 2 of NS-FE-W5-001.
 */

export const mockWeightSeriesWithEma = {
  user_id: 1,
  days_range: 14,
  alpha: 0.1,
  points_count: 5,
  series: [
    { date: '2026-10-10', weight_kg: 68.5, ema_weight_kg: 68.5 },
    { date: '2026-10-12', weight_kg: 68.2, ema_weight_kg: 68.47 },
    { date: '2026-10-15', weight_kg: 67.9, ema_weight_kg: 68.41 },
    { date: '2026-10-18', weight_kg: 68.0, ema_weight_kg: 68.37 },
    { date: '2026-10-24', weight_kg: 67.5, ema_weight_kg: 68.28 },
  ],
  start_weight_kg: 68.5,
  latest_weight_kg: 67.5,
  latest_ema_kg: 68.28,
  raw_change_kg: -1.0,
  ema_change_kg: -0.22,
  disclaimer: 'Số liệu cân nặng và xu hướng EMA chỉ mang tính chất theo dõi tham khảo.',
};

export const mockWeightSeriesWithoutEma = {
  user_id: 1,
  days_range: 14,
  alpha: 0.1,
  points_count: 4,
  series: [
    { date: '2026-10-10', weight_kg: 68.5, ema_weight_kg: null },
    { date: '2026-10-14', weight_kg: 68.2, ema_weight_kg: null },
    { date: '2026-10-18', weight_kg: 67.8, ema_weight_kg: null },
    { date: '2026-10-24', weight_kg: 67.5, ema_weight_kg: null },
  ],
  start_weight_kg: 68.5,
  latest_weight_kg: 67.5,
  latest_ema_kg: null,
  raw_change_kg: -1.0,
  ema_change_kg: 0.0,
  disclaimer: 'Số liệu cân nặng và xu hướng EMA chỉ mang tính chất theo dõi tham khảo.',
};

export const mockWeightSeriesPartialEma = {
  user_id: 1,
  days_range: 14,
  alpha: 0.1,
  points_count: 4,
  series: [
    { date: '2026-10-10', weight_kg: 68.5, ema_weight_kg: null },
    { date: '2026-10-14', weight_kg: 68.2, ema_weight_kg: null },
    { date: '2026-10-18', weight_kg: 67.8, ema_weight_kg: 68.0 },
    { date: '2026-10-24', weight_kg: 67.5, ema_weight_kg: 67.95 },
  ],
  start_weight_kg: 68.5,
  latest_weight_kg: 67.5,
  latest_ema_kg: 67.95,
  raw_change_kg: -1.0,
  ema_change_kg: -0.05,
  disclaimer: 'Số liệu cân nặng và xu hướng EMA chỉ mang tính chất theo dõi tham khảo.',
};

export const mockPatternInsightsAnalyzed = {
  status: 'analyzed',
  is_sufficient_data: true,
  user_id: 1,
  days_range: 14,
  logged_days_count: 8,
  summary_metrics: {
    avg_daily_calories: 1850.5,
    avg_daily_protein_g: 85.0,
    breakfast_days_count: 3,
    late_night_days_count: 3,
    breakfast_rate: 0.38,
    late_night_rate: 0.38,
  },
  patterns: [
    {
      pattern_code: 'skipping_breakfast',
      title: 'Thói quen bỏ bữa sáng',
      severity: 'gentle_reminder',
      metrics: { breakfast_days: 3, logged_days: 8, breakfast_rate: 0.38 },
      recommendation:
        'Bạn mới ghi nhận bữa sáng trong 3/8 ngày gần đây. Một bữa sáng gọn nhẹ giàu đạm sẽ giúp duy trì năng lượng ổn định.',
    },
    {
      pattern_code: 'low_protein',
      title: 'Lượng đạm (Protein) trung bình chưa đạt mục tiêu',
      severity: 'nutrition_balance',
      metrics: { avg_daily_protein_g: 85.0, target_protein_g: 120.0 },
      recommendation:
        'Lượng đạm ước tính trung bình đạt khoảng 85g/ngày (mục tiêu tham khảo 120g). Bạn có thể bổ sung thêm ức gà, cá, đậu hũ hoặc trứng.',
    },
    {
      pattern_code: 'late_night_eating',
      title: 'Thói quen ăn muộn sau 21:00',
      severity: 'habit_observation',
      metrics: { late_night_days: 3, logged_days: 8, late_night_rate: 0.38 },
      recommendation:
        'Hệ thống ghi nhận bạn có 3 ngày dùng bữa sau 21:00. Bạn có thể ưu tiên các món nhẹ dễ tiêu hóa như sữa hạt không đường hoặc súp rau củ.',
    },
  ],
  locked_daily_target_calories: 2000.0,
  disclaimer:
    'Số liệu phân tích thói quen dinh dưỡng mang tính chất tham khảo, không thay thế chẩn đoán y khoa chuyên nghiệp.',
};

export const mockPatternInsightsInsufficient = {
  status: 'insufficient_data',
  is_sufficient_data: false,
  user_id: 1,
  days_range: 14,
  logged_days_count: 2,
  minimum_required_days: 5,
  patterns: [],
  locked_daily_target_calories: 2000.0,
  message: 'Cần tối thiểu 5 ngày ghi nhận nhật ký ăn uống để hệ thống phân tích mẫu thói quen chính xác.',
  disclaimer: 'Cần tối thiểu 5 ngày ghi nhận nhật ký ăn uống để hệ thống phân tích mẫu thói quen chính xác.',
};

export const mockFoodSwapResponse = {
  status: 'success',
  source_food: {
    food_id: 1,
    food_name: 'Cơm tấm sườn nướng',
    category: 'rice_dish',
    portion_gram: 250.0,
    calories: 612.5,
    protein_g: 36.25,
    carbs_g: 62.5,
    fat_g: 24.5,
    estimated_price_vnd: 40000,
  },
  swap_goal: 'reduce_calories',
  alternatives: [
    {
      food_id: 5,
      food_name: 'Phở gà xé',
      category: 'noodle_soup',
      portion_gram: 250.0,
      calories: 270.0,
      protein_g: 22.5,
      carbs_g: 33.75,
      fat_g: 5.25,
      estimated_price_vnd: 35000,
      delta_calories: -342.5,
      calories_saved: 342.5,
      delta_protein_g: -13.75,
      delta_price_vnd: -5000,
      calories_diff: -342.5,
      protein_diff_g: -13.75,
      price_diff_vnd: -5000,
    },
    {
      food_id: 10,
      food_name: 'Bún riêu cua',
      category: 'noodle_soup',
      portion_gram: 250.0,
      calories: 262.5,
      protein_g: 16.25,
      carbs_g: 30.0,
      fat_g: 8.75,
      estimated_price_vnd: 35000,
      delta_calories: -350.0,
      calories_saved: 350.0,
      delta_protein_g: -20.0,
      delta_price_vnd: -5000,
      calories_diff: -350.0,
      protein_diff_g: -20.0,
      price_diff_vnd: -5000,
    },
  ],
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
};
