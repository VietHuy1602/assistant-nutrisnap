/**
 * src/frontend/src/utils/date.ts
 * Date manipulation utilities adhering to ADR-W3-08 (Vietnam UTC+7 local date formatting).
 * CẤM dùng `toISOString().slice(0, 10)` vì sẽ bị lệch ngày trong khung giờ 00:00–07:00 sáng tại Việt Nam.
 */

/**
 * Lấy chuỗi ngày YYYY-MM-DD theo giờ địa phương của người dùng (mặc định trình duyệt chạy tại VN UTC+7).
 */
export function toLocalISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Định dạng ngày theo chuẩn Việt Nam DD/MM/YYYY.
 */
export function formatVNDate(dateInput: Date | string): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    // Nếu là chuỗi YYYY-MM-DD
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [y, m, day] = dateInput.split('-');
      return `${day}/${m}/${y}`;
    }
    return String(dateInput);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Tự động gợi ý loại bữa ăn theo giờ địa phương:
 * - 05:00 - 09:59: breakfast (Sáng)
 * - 10:00 - 13:59: lunch (Trưa)
 * - 17:00 - 20:59: dinner (Tối)
 * - Còn lại: snack (Phụ)
 */
export function getDefaultMealTypeByHour(d: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = d.getHours();
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 21) return 'dinner';
  return 'snack';
}
