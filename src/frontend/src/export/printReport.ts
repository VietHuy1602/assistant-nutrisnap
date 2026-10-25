/**
 * src/frontend/src/export/printReport.ts
 * Kích hoạt hộp thoại in của trình duyệt (Window.print) cho Báo cáo Tháng (ADR-W6-05).
 */

export function printReport(): boolean {
  if (typeof window === 'undefined' || typeof window.print !== 'function') {
    return false;
  }
  try {
    window.print();
    return true;
  } catch {
    return false;
  }
}
