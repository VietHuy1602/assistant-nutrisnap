import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderReportCanvas } from '../export/renderReportCanvas';
import { exportCanvasAsPng } from '../export/exportPng';
import { printReport } from '../export/printReport';
import { normalizeMonthlyReport, type MonthlyReport } from '../api/reportContract';

const mockReport: MonthlyReport = normalizeMonthlyReport({
  month: '2026-10',
  insufficient: false,
  logging_summary: {
    total_logged_days: 18,
    period_days: 31,
    consistency_rate_pct: 58,
    total_meals_logged: 42,
  },
  weight_summary: {
    start_weight_kg: 65.0,
    end_weight_kg: 64.2,
    raw_weight_change_kg: -0.8,
    trend_direction: 'decreasing',
    records_count: 5,
  },
  nutrition_summary: {
    avg_daily_calories: 1850,
    target_tdee_calories: 2000,
  },
  strengths: [
    'Uống đủ nước liên tục 5 ngày qua',
    'Duy trì lượng chất xơ trên 25g/ngày',
  ],
  habit_summary: {
    streak: {
      current_streak: 6,
      longest_streak: 14,
      total_logged_days: 18,
    },
    seven_day_challenge: {
      completed_days: 5,
      target_days: 7,
      progress_pct: 71,
      is_completed: false,
      badge_name: 'Bền bỉ 7 ngày',
    },
    back_on_track: {
      active: false,
    },
  },
});

describe('Step 6: Report Export without 3rd-party libs (renderReportCanvas, exportPng, printReport)', () => {
  let filledTexts: string[] = [];
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    filledTexts = [];
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    // Canvas 2D Context Mock recording operations
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
      if (contextId === '2d') {
        return {
          scale: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          fillText: vi.fn((text: string) => {
            filledTexts.push(text);
          }),
          set strokeStyle(_val: any) {},
          set fillStyle(_val: any) {},
          set lineWidth(_val: any) {},
          set font(_val: any) {},
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  describe('renderReportCanvas', () => {
    it('1. creates high-DPI 2x canvas (1600x2000) with proper aspect ratio', () => {
      const canvas = renderReportCanvas(mockReport, '2026-10-25');
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(canvas.width).toBe(1600); // 800 * 2
      expect(canvas.height).toBe(2000); // 1000 * 2
      expect(canvas.style.width).toBe('800px');
      expect(canvas.style.height).toBe('1000px');
    });

    it('2. embeds brand, month title, and logging summary into canvas text', () => {
      renderReportCanvas(mockReport, '2026-10-25');
      expect(filledTexts).toContain('NUTRISNAP · VIRTUAL AI NUTRITION ASSISTANT');
      expect(filledTexts.some((t) => t.includes('Báo cáo Dinh dưỡng & Thói quen — Tháng 10/2026'))).toBe(true);
      expect(filledTexts).toContain('18 ngày');
      expect(filledTexts).toContain('58%');
      expect(filledTexts).toContain('1850 kcal');
      expect(filledTexts).toContain('-0.8 kg');
    });

    it('3. MANDATORY (M4, ISC-9): embeds all 3 medical disclaimer lines directly inside the image', () => {
      renderReportCanvas(mockReport, '2026-10-25');
      expect(filledTexts).toContain('LƯU Ý MINH BẠCH VỀ DỮ LIỆU SỨC KHỎE:');
      expect(
        filledTexts.some((t) => t.includes('Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo'))
      ).toBe(true);
      expect(
        filledTexts.some((t) => t.includes('Cân nặng hằng ngày dao động theo lượng nước, muối'))
      ).toBe(true);
      expect(
        filledTexts.some((t) => t.includes('Báo cáo không thay thế tư vấn y khoa'))
      ).toBe(true);
    });

    it('4. embeds habit challenge and positive strengths without punitive language', () => {
      renderReportCanvas(mockReport, '2026-10-25');
      expect(filledTexts).toContain('Uống đủ nước liên tục 5 ngày qua');
      expect(filledTexts).toContain('Duy trì lượng chất xơ trên 25g/ngày');
      expect(filledTexts.some((t) => t.includes('Hoàn thành: 5/7 ngày'))).toBe(true);
      // Verify no failure/blame words
      for (const t of filledTexts) {
        expect(t.toLowerCase()).not.toContain('thất bại');
        expect(t.toLowerCase()).not.toContain('bỏ cuộc');
      }
    });
  });

  describe('exportCanvasAsPng', () => {
    it('5. triggers client-side download without any network requests (0 fetch calls)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const fakeBlob = new Blob(['fake-png-bytes'], { type: 'image/png' });

      const canvas = document.createElement('canvas');
      canvas.toBlob = vi.fn().mockImplementation((callback: BlobCallback) => {
        callback(fakeBlob);
      });

      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      await exportCanvasAsPng(canvas, 'TestReport.png');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(createObjectURLMock).toHaveBeenCalledWith(fakeBlob);
      expect(clickSpy).toHaveBeenCalled();
    });

    it('6. rejects with informative error when canvas toBlob returns null', async () => {
      const canvas = document.createElement('canvas');
      canvas.toBlob = vi.fn().mockImplementation((callback: BlobCallback) => {
        callback(null);
      });

      await expect(exportCanvasAsPng(canvas, 'Fail.png')).rejects.toThrow(
        'Không thể tạo file ảnh PNG từ Canvas.'
      );
    });
  });

  describe('printReport', () => {
    it('7. calls window.print and returns true when available', () => {
      const printSpy = vi.fn();
      vi.stubGlobal('print', printSpy);

      const result = printReport();
      expect(result).toBe(true);
      expect(printSpy).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('8. returns false gracefully if window.print throws or is unavailable', () => {
      const printSpy = vi.fn().mockImplementation(() => {
        throw new Error('Print dialog blocked');
      });
      vi.stubGlobal('print', printSpy);

      const result = printReport();
      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });
  });
});
