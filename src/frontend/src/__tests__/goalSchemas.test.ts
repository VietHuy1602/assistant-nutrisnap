import { describe, it, expect } from 'vitest';
import { goalSchema, GoalFormValues } from '../schemas/goalSchemas';

const validBaseGoal: GoalFormValues = {
  gender: 'male',
  age: 25,
  height_cm: 175,
  current_weight_kg: 70,
  target_weight_kg: 65,
  activity_level: 'moderate',
  goal_type: 'lose_weight',
  weekly_pace_kg: 0.5,
  daily_budget_vnd: 60000,
};

describe('goalSchema validation', () => {
  it('1. Hợp lệ với dữ liệu giảm cân chuẩn', () => {
    const result = goalSchema.safeParse(validBaseGoal);
    expect(result.success).toBe(true);
  });

  it('2. Biên tốc độ giảm cân: 0.25 kg/tuần (hợp lệ) và 0.75 kg/tuần (hợp lệ)', () => {
    const p1 = goalSchema.safeParse({ ...validBaseGoal, weekly_pace_kg: 0.25 });
    const p2 = goalSchema.safeParse({ ...validBaseGoal, weekly_pace_kg: 0.75 });
    expect(p1.success).toBe(true);
    expect(p2.success).toBe(true);
  });

  it('3. Ngoài biên giảm cân: 0.24 kg/tuần hoặc 0.76 kg/tuần bị từ chối', () => {
    const pLow = goalSchema.safeParse({ ...validBaseGoal, weekly_pace_kg: 0.24 });
    const pHigh = goalSchema.safeParse({ ...validBaseGoal, weekly_pace_kg: 0.76 });
    expect(pLow.success).toBe(false);
    expect(pHigh.success).toBe(false);
  });

  it('4. Biên tốc độ tăng cơ: 0.10 kg/tuần (hợp lệ) và 0.50 kg/tuần (hợp lệ)', () => {
    const baseGain: GoalFormValues = {
      ...validBaseGoal,
      goal_type: 'gain_muscle',
      target_weight_kg: 75,
      weekly_pace_kg: 0.1,
    };
    const p1 = goalSchema.safeParse(baseGain);
    const p2 = goalSchema.safeParse({ ...baseGain, weekly_pace_kg: 0.5 });
    expect(p1.success).toBe(true);
    expect(p2.success).toBe(true);
  });

  it('5. Ngoài biên tăng cơ: 0.09 kg/tuần hoặc 0.51 kg/tuần bị từ chối', () => {
    const baseGain: GoalFormValues = {
      ...validBaseGoal,
      goal_type: 'gain_muscle',
      target_weight_kg: 75,
    };
    const pLow = goalSchema.safeParse({ ...baseGain, weekly_pace_kg: 0.09 });
    const pHigh = goalSchema.safeParse({ ...baseGain, weekly_pace_kg: 0.51 });
    expect(pLow.success).toBe(false);
    expect(pHigh.success).toBe(false);
  });

  it('6. Duy trì cân nặng: weekly_pace_kg phải đúng bằng 0', () => {
    const baseMaintain: GoalFormValues = {
      ...validBaseGoal,
      goal_type: 'maintain',
      target_weight_kg: 70,
      weekly_pace_kg: 0,
    };
    expect(goalSchema.safeParse(baseMaintain).success).toBe(true);

    const invalidMaintain = goalSchema.safeParse({ ...baseMaintain, weekly_pace_kg: 0.2 });
    expect(invalidMaintain.success).toBe(false);
  });

  it('7. Luật chéo target/current: lose_weight yêu cầu target < current, gain_muscle yêu cầu target > current', () => {
    // Giảm cân nhưng target >= current
    const badLose = goalSchema.safeParse({
      ...validBaseGoal,
      goal_type: 'lose_weight',
      current_weight_kg: 70,
      target_weight_kg: 70,
    });
    expect(badLose.success).toBe(false);

    // Tăng cơ nhưng target <= current
    const badGain = goalSchema.safeParse({
      ...validBaseGoal,
      goal_type: 'gain_muscle',
      current_weight_kg: 70,
      target_weight_kg: 68,
      weekly_pace_kg: 0.25,
    });
    expect(badGain.success).toBe(false);
  });

  it('8. Giới hạn tuổi: 9 bị từ chối, 10 và 120 hợp lệ, 121 bị từ chối', () => {
    expect(goalSchema.safeParse({ ...validBaseGoal, age: 9 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...validBaseGoal, age: 10 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...validBaseGoal, age: 120 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...validBaseGoal, age: 121 }).success).toBe(false);
  });

  it('9. Giới hạn chiều cao: 79 bị từ chối, 80 và 250 hợp lệ, 251 bị từ chối', () => {
    expect(goalSchema.safeParse({ ...validBaseGoal, height_cm: 79 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...validBaseGoal, height_cm: 80 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...validBaseGoal, height_cm: 250 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...validBaseGoal, height_cm: 251 }).success).toBe(false);
  });

  it('10. Giới hạn cân nặng: 24.9 bị từ chối, 25 và 300 hợp lệ, 300.1 bị từ chối', () => {
    expect(goalSchema.safeParse({ ...validBaseGoal, current_weight_kg: 24.9 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...validBaseGoal, current_weight_kg: 25, target_weight_kg: 25, goal_type: 'maintain', weekly_pace_kg: 0 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...validBaseGoal, current_weight_kg: 300, target_weight_kg: 300, goal_type: 'maintain', weekly_pace_kg: 0 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...validBaseGoal, current_weight_kg: 300.1 }).success).toBe(false);
  });

  it('11. Ngân sách hằng ngày: tối thiểu 10.000 VNĐ', () => {
    expect(goalSchema.safeParse({ ...validBaseGoal, daily_budget_vnd: 9999 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...validBaseGoal, daily_budget_vnd: 10000 }).success).toBe(true);
  });
});
