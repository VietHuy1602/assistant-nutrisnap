/**
 * src/frontend/src/__tests__/w3_utils.test.ts
 * Comprehensive unit test suite for W3 utils (date, image, format, mealEvents).
 * Adheres to ADR-W3-05 (Image privacy & validation), ADR-W3-08 (UTC+7 dates).
 */

import { describe, it, expect } from 'vitest';
import { toLocalISODate, formatVNDate, getDefaultMealTypeByHour } from '../utils/date';
import {
  validateImageFile,
  calculateDownscaledDimensions,
  prepareImageForUpload,
  MAX_RAW_IMAGE_SIZE_BYTES,
} from '../utils/image';
import { formatKcal, formatGram, formatVND, formatPercent } from '../utils/format';
import { emitMealLogged, onMealLogged } from '../utils/mealEvents';

describe('W3 Utils — date.ts (ADR-W3-08 Vietnam UTC+7 date handling)', () => {
  it('1. toLocalISODate trả về định dạng chuẩn YYYY-MM-DD theo giờ địa phương', () => {
    const d = new Date(2026, 9, 23, 14, 30); // 23/10/2026 14:30
    expect(toLocalISODate(d)).toBe('2026-10-23');
  });

  it('2. toLocalISODate xử lý chính xác biên nửa đêm 00:00:00', () => {
    const d = new Date(2026, 9, 23, 0, 0, 0, 0);
    expect(toLocalISODate(d)).toBe('2026-10-23');
  });

  it('3. toLocalISODate xử lý chính xác khung giờ 00:00–07:00 (tránh lỗi lệch ngày UTC)', () => {
    const dEarly = new Date(2026, 9, 23, 4, 15, 0); // 04:15 AM
    expect(toLocalISODate(dEarly)).toBe('2026-10-23');

    const dLate = new Date(2026, 9, 23, 23, 59, 59);
    expect(toLocalISODate(dLate)).toBe('2026-10-23');
  });

  it('4. formatVNDate chuyển đổi YYYY-MM-DD string sang DD/MM/YYYY chuẩn VN', () => {
    expect(formatVNDate('2026-10-23')).toBe('23/10/2026');
    expect(formatVNDate('2026-01-05')).toBe('05/01/2026');
  });

  it('5. formatVNDate định dạng chính xác đối tượng Date', () => {
    const d = new Date(2026, 0, 15);
    expect(formatVNDate(d)).toBe('15/01/2026');
  });

  it('6. formatVNDate xử lý an toàn giá trị rỗng hoặc không hợp lệ', () => {
    expect(formatVNDate('')).toBe('');
    expect(formatVNDate('chuỗi-không-hợp-lệ')).toBe('chuỗi-không-hợp-lệ');
  });

  it('7. getDefaultMealTypeByHour phân loại chính xác các khung giờ bữa ăn', () => {
    // Sáng: 05:00 - 09:59
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 6, 0))).toBe('breakfast');
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 9, 59))).toBe('breakfast');

    // Trưa: 10:00 - 13:59
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 10, 0))).toBe('lunch');
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 12, 30))).toBe('lunch');

    // Tối: 17:00 - 20:59
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 18, 0))).toBe('dinner');
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 20, 30))).toBe('dinner');

    // Phụ: các khung giờ còn lại
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 15, 0))).toBe('snack');
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 23, 0))).toBe('snack');
    expect(getDefaultMealTypeByHour(new Date(2026, 9, 23, 2, 0))).toBe('snack');
  });
});

describe('W3 Utils — image.ts (ADR-W3-05 Image privacy & validation)', () => {
  it('8. validateImageFile chấp nhận ảnh JPEG, PNG, WebP hợp lệ', () => {
    const jpeg = new File(['dummy'], 'meal.jpg', { type: 'image/jpeg' });
    const png = new File(['dummy'], 'meal.png', { type: 'image/png' });
    const webp = new File(['dummy'], 'meal.webp', { type: 'image/webp' });

    expect(validateImageFile(jpeg).valid).toBe(true);
    expect(validateImageFile(png).valid).toBe(true);
    expect(validateImageFile(webp).valid).toBe(true);
  });

  it('9. validateImageFile từ chối định dạng không được hỗ trợ (GIF, PDF, v.v.)', () => {
    const gif = new File(['dummy'], 'anim.gif', { type: 'image/gif' });
    const pdf = new File(['dummy'], 'doc.pdf', { type: 'application/pdf' });

    const resGif = validateImageFile(gif);
    expect(resGif.valid).toBe(false);
    expect(resGif.error).toContain('Định dạng ảnh không được hỗ trợ');

    const resPdf = validateImageFile(pdf);
    expect(resPdf.valid).toBe(false);
  });

  it('10. validateImageFile từ chối tệp vượt quá 10MB', () => {
    const oversizedBlob = new Blob([new Uint8Array(MAX_RAW_IMAGE_SIZE_BYTES + 1024)], {
      type: 'image/jpeg',
    });
    const oversizedFile = new File([oversizedBlob], 'huge.jpg', { type: 'image/jpeg' });

    const res = validateImageFile(oversizedFile);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('vượt quá 10MB');
  });

  it('11. calculateDownscaledDimensions giữ nguyên ảnh nếu đã nhỏ hơn 1280px', () => {
    const dims = calculateDownscaledDimensions(800, 600, 1280);
    expect(dims).toEqual({ width: 800, height: 600 });
  });

  it('12. calculateDownscaledDimensions thu nhỏ ảnh ngang (landscape) về max 1280px đúng tỷ lệ', () => {
    // 2560 x 1440 -> 1280 x 720
    const dims = calculateDownscaledDimensions(2560, 1440, 1280);
    expect(dims).toEqual({ width: 1280, height: 720 });
  });

  it('13. calculateDownscaledDimensions thu nhỏ ảnh dọc (portrait) về max 1280px đúng tỷ lệ', () => {
    // 1440 x 2560 -> 720 x 1280
    const dims = calculateDownscaledDimensions(1440, 2560, 1280);
    expect(dims).toEqual({ width: 720, height: 1280 });
  });

  it('14. calculateDownscaledDimensions xử lý ảnh vuông hoặc kích thước không hợp lệ', () => {
    const square = calculateDownscaledDimensions(2000, 2000, 1280);
    expect(square).toEqual({ width: 1280, height: 1280 });

    const zero = calculateDownscaledDimensions(0, 0, 1280);
    expect(zero.width).toBe(1280);
    expect(zero.height).toBe(1280);
  });

  it('15. prepareImageForUpload xử lý Blob an toàn trong môi trường jsdom', async () => {
    const blob = new Blob(['sample-image-data'], { type: 'image/jpeg' });
    const result = await prepareImageForUpload(blob);
    expect(result.blob).toBeDefined();
    expect(result.sizeBytes).toBeGreaterThanOrEqual(0);
  });
});

describe('W3 Utils — format.ts (Formatters for Vietnamese Locale)', () => {
  it('16. formatKcal định dạng năng lượng chuẩn VN có dấu chấm phân cách hàng nghìn', () => {
    expect(formatKcal(1250)).toBe('1.250');
    expect(formatKcal(0)).toBe('0');
    expect(formatKcal(null)).toBe('0');
    expect(formatKcal(undefined)).toBe('0');
    expect(formatKcal(NaN)).toBe('0');
  });

  it('17. formatGram định dạng khối lượng với hậu tố g và làm tròn 1 chữ số thập phân', () => {
    expect(formatGram(150)).toBe('150g');
    expect(formatGram(12.34)).toBe('12,3g');
    expect(formatGram(0)).toBe('0g');
    expect(formatGram(null)).toBe('0g');
  });

  it('18. formatVND định dạng tiền tệ Việt Nam Đồng', () => {
    expect(formatVND(45000)).toBe('45.000 đ');
    expect(formatVND(0)).toBe('0 đ');
    expect(formatVND(null)).toBe('0 đ');
  });

  it('19. formatPercent định dạng phần trăm nguyên', () => {
    expect(formatPercent(75.4)).toBe('75%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('0%');
  });
});

describe('W3 Utils — mealEvents.ts (Cross-component custom event bus)', () => {
  it('20. emitMealLogged phát đi sự kiện nutrisnap:meal-logged và onMealLogged bắt được sự kiện', () => {
    const handler = vi.fn();
    const cleanup = onMealLogged(handler);

    emitMealLogged({ mealId: 101, calories: 500 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ mealId: 101, calories: 500 });

    // Hủy lắng nghe
    cleanup();
    emitMealLogged({ mealId: 102 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
