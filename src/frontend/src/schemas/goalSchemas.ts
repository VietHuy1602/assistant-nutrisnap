/**
 * src/frontend/src/schemas/goalSchemas.ts
 * Zod validation schema for Goal Planner Wizard.
 * Khung tham chiếu theo Snippet 15.3 và Hợp đồng API (§6.3).
 */

import { z } from 'zod';

const num = (label: string) =>
  z.number({
    message: `Vui lòng nhập ${label}`,
  });

export const goalSchema = z
  .object({
    gender: z.enum(['male', 'female', 'other'], {
      message: 'Vui lòng chọn giới tính',
    }),
    age: num('tuổi')
      .int('Tuổi phải là số nguyên')
      .min(10, 'Tuổi tối thiểu là 10')
      .max(120, 'Tuổi tối đa là 120'),
    height_cm: num('chiều cao')
      .min(80, 'Chiều cao tối thiểu là 80 cm')
      .max(250, 'Chiều cao tối đa là 250 cm'),
    current_weight_kg: num('cân nặng hiện tại')
      .min(25, 'Cân nặng hiện tại tối thiểu là 25 kg')
      .max(300, 'Cân nặng hiện tại tối đa là 300 kg'),
    target_weight_kg: num('cân nặng mục tiêu')
      .min(25, 'Cân nặng mục tiêu tối thiểu là 25 kg')
      .max(300, 'Cân nặng mục tiêu tối đa là 300 kg'),
    activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active'], {
      message: 'Vui lòng chọn mức độ vận động',
    }),
    goal_type: z.enum(['lose_weight', 'maintain', 'gain_muscle'], {
      message: 'Vui lòng chọn loại mục tiêu',
    }),
    weekly_pace_kg: num('tốc độ thay đổi'),
    daily_budget_vnd: num('ngân sách')
      .int('Ngân sách phải là số nguyên')
      .min(10_000, 'Ngân sách tối thiểu là 10.000 VNĐ/ngày'),
  })
  .superRefine((v, ctx) => {
    const add = (path: keyof typeof v, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    // Làm tròn 2 chữ số thập phân để tránh sai số dấu phẩy động JavaScript (theo 15.3)
    const pace = Math.round(v.weekly_pace_kg * 100) / 100;

    if (v.goal_type === 'lose_weight') {
      if (pace < 0.25 || pace > 0.75) {
        add('weekly_pace_kg', 'Giảm cân an toàn: 0,25–0,75 kg/tuần');
      }
      if (v.target_weight_kg >= v.current_weight_kg) {
        add('target_weight_kg', 'Cân nặng mục tiêu phải thấp hơn cân nặng hiện tại');
      }
    } else if (v.goal_type === 'gain_muscle') {
      if (pace < 0.1 || pace > 0.5) {
        add('weekly_pace_kg', 'Tăng cơ an toàn: 0,1–0,5 kg/tuần');
      }
      if (v.target_weight_kg <= v.current_weight_kg) {
        add('target_weight_kg', 'Cân nặng mục tiêu phải cao hơn cân nặng hiện tại');
      }
    } else if (pace !== 0) {
      add('weekly_pace_kg', 'Duy trì cân nặng: tốc độ thay đổi phải bằng 0');
    }
  });

export type GoalFormValues = z.infer<typeof goalSchema>;

export const STEP_FIELDS: Record<number, Array<keyof GoalFormValues>> = {
  1: ['gender', 'age', 'height_cm', 'current_weight_kg', 'activity_level'],
  2: ['goal_type', 'target_weight_kg'],
  3: ['weekly_pace_kg', 'daily_budget_vnd'],
  4: [],
};
