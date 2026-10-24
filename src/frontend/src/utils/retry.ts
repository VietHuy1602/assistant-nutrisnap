/**
 * src/frontend/src/utils/retry.ts
 * Hàng đợi thân thiện cho HTTP 429 & Retry Policy (ADR-W6-09).
 * RÀNG BUỘC NGHIÊM NGẶT (S9):
 * Tối đa 3 lần tự động thử lại (attempt 1, 2). Sau đó dừng để người dùng bấm thủ công.
 */

export const MAX_RETRY_ATTEMPTS = 3;
export const MAX_RETRY_AFTER_CAP_SEC = 60;

export interface RetryPlan {
  waitSec: number;
}

/**
 * Lập kế hoạch thử lại cho yêu cầu bị giới hạn tốc độ (HTTP 429) hoặc tạm thời gián đoạn.
 * @param attempt Số lần đã thử (1-indexed: 1 = lần thất bại đầu tiên, chuẩn bị thử lại lần 1)
 * @param retryAfterSec Giá trị header Retry-After (giây) nếu có từ máy chủ
 * @returns { waitSec } hoặc null nếu đã hết lượt tự động thử lại
 */
export function planRetry(attempt: number, retryAfterSec?: number): RetryPlan | null {
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    return null;
  }

  // 1. Nếu có Retry-After từ header máy chủ
  if (typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    const clamped = Math.min(Math.max(1, Math.round(retryAfterSec)), MAX_RETRY_AFTER_CAP_SEC);
    return { waitSec: clamped };
  }

  // 2. Backoff mặc định an toàn: lần 1 = 2s, lần 2 = 4s
  if (attempt === 1) {
    return { waitSec: 2 };
  }
  if (attempt === 2) {
    return { waitSec: 4 };
  }

  return null;
}

/**
 * Trích xuất an toàn số giây từ header Retry-After của HTTP response.
 */
export function parseRetryAfterHeader(headerValue?: string | null): number | null {
  if (!headerValue || typeof headerValue !== 'string') return null;

  const trimmed = headerValue.trim();
  // Trường hợp 1: Số giây dạng chuỗi nguyên
  const parsedSeconds = parseInt(trimmed, 10);
  if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
    return Math.min(parsedSeconds, MAX_RETRY_AFTER_CAP_SEC);
  }

  // Trường hợp 2: Định dạng HTTP Date (RFC 7231)
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    const diffSec = Math.round((parsedDate - Date.now()) / 1000);
    if (diffSec > 0) {
      return Math.min(diffSec, MAX_RETRY_AFTER_CAP_SEC);
    }
  }

  return null;
}
