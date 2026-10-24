/**
 * src/frontend/src/utils/month.ts
 * Pure Gregorian & Asia/Ho_Chi_Minh month date utilities.
 * Tuyệt đối không dùng thư viện ngoài (moment, date-fns).
 * Tránh lỗi lệch ngày khi dùng toISOString() vào đầu sáng sớm (AS-10).
 */

const MONTH_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Trích xuất chuỗi YYYY-MM hiện tại theo múi giờ địa phương (Asia/Ho_Chi_Minh, UTC+7).
 */
export function currentMonthKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  // en-CA produces YYYY-MM
  return parts.slice(0, 7);
}

/**
 * Trích xuất chuỗi YYYY-MM-DD hôm nay theo múi giờ địa phương (Asia/Ho_Chi_Minh).
 */
export function todayDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts.slice(0, 10);
}

/**
 * Phân tích cú pháp YYYY-MM thành { year, month } (1-indexed).
 */
export function parseMonthKey(key: string): { year: number; month: number } | null {
  if (typeof key !== 'string') return null;
  const match = MONTH_KEY_REGEX.exec(key.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (year < 1970 || year > 2100) return null;
  return { year, month };
}

/**
 * Định dạng { year, month } thành chuỗi YYYY-MM.
 */
export function formatMonthKey(year: number, month: number): string {
  const safeYear = Math.max(1970, Math.min(2100, Math.floor(year)));
  const safeMonth = Math.max(1, Math.min(12, Math.floor(month)));
  return `${safeYear.toString().padStart(4, '0')}-${safeMonth.toString().padStart(2, '0')}`;
}

/**
 * Dịch chuyển tháng tiến hoặc lùi (+1, -1, hoặc n tháng) mà không dùng Date().
 */
export function shiftMonthKey(key: string, offset: number): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;

  const totalMonths = parsed.year * 12 + (parsed.month - 1) + offset;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;

  return formatMonthKey(newYear, newMonth);
}

/**
 * Kiểm tra xem tháng có thuộc về tương lai so với tháng tham chiếu hay không.
 */
export function isFutureMonth(key: string, referenceMonthKey = currentMonthKey()): boolean {
  return key > referenceMonthKey;
}

/**
 * Hiển thị nhãn thân thiện cho người dùng tiếng Việt ("Tháng MM/YYYY").
 */
export function formatMonthDisplay(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return `Tháng ${parsed.month}/${parsed.year}`;
}

/**
 * Kiểm tra tính hợp lệ của chuỗi ngày YYYY-MM-DD.
 */
export function isValidDateKey(dateStr: string): boolean {
  return DATE_KEY_REGEX.test(dateStr);
}
