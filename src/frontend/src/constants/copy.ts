/**
 * src/frontend/src/constants/copy.ts
 * Hằng số văn bản, disclaimer y khoa và nhãn dùng chung trong toàn ứng dụng NutriSnap.
 */

export const DISCLAIMER_ESTIMATE =
  'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.';

export const DISCLAIMER_TEXT = 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.';

export const DISCLAIMER_WIZARD =
  'Đây là công cụ ước tính lộ trình tham khảo, không thay thế chỉ định y khoa.';

export const DISCLAIMER_RECOGNITION =
  'Kết quả nhận diện món ăn và định lượng calo là giá trị ước tính dựa trên hình ảnh và cơ sở dữ liệu tham chiếu.';

export const DISCLAIMER_CHECK_PROMPT =
  'AI có thể nhận diện sai — hãy kiểm tra lại tên món và khối lượng.';

export const ACTIVITY_LEVEL_LABELS: Record<string, { label: string; desc: string }> = {
  sedentary: {
    label: 'Ít vận động',
    desc: 'Làm việc văn phòng, ít hoặc không tập thể dục',
  },
  light: {
    label: 'Vận động nhẹ',
    desc: 'Tập thể dục nhẹ nhàng 1–3 ngày/tuần',
  },
  moderate: {
    label: 'Vận động vừa phải',
    desc: 'Tập thể dục đều đặn 3–5 ngày/tuần',
  },
  active: {
    label: 'Vận động nhiều',
    desc: 'Tập luyện cường độ cao 6–7 ngày/tuần',
  },
  very_active: {
    label: 'Vận động rất nhiều',
    desc: 'Vận động viên hoặc công việc thể lực nặng',
  },
};

export const GOAL_TYPE_LABELS: Record<string, { label: string; desc: string }> = {
  lose_weight: {
    label: 'Giảm cân',
    desc: 'Thâm hụt calo lành mạnh, bảo toàn khối cơ',
  },
  maintain: {
    label: 'Duy trì vóc dáng',
    desc: 'Cân bằng năng lượng nạp vào và tiêu hao',
  },
  gain_muscle: {
    label: 'Tăng cơ',
    desc: 'Dư thừa calo nhẹ kết hợp lượng đạm tối ưu',
  },
};

export const MEAL_TYPES = [
  { id: 'breakfast', label: 'Bữa Sáng', icon: '🌅' },
  { id: 'lunch', label: 'Bữa Trưa', icon: '☀️' },
  { id: 'dinner', label: 'Bữa Tối', icon: '🌙' },
  { id: 'snack', label: 'Bữa Phụ', icon: '🍎' },
] as const;

export type MealTypeId = (typeof MEAL_TYPES)[number]['id'];

export function getMealTypeLabel(type: string): string {
  const normalized = type.toLowerCase().trim();
  if (normalized.includes('sáng') || normalized === 'breakfast') return 'Bữa Sáng';
  if (normalized.includes('trưa') || normalized === 'lunch') return 'Bữa Trưa';
  if (normalized.includes('tối') || normalized === 'dinner') return 'Bữa Tối';
  if (normalized.includes('phụ') || normalized === 'snack') return 'Bữa Phụ';
  return type;
}
