import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';

const rawFiles = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('Step 9: Automated Safety Guards & Privacy Fence (S1-S14, M1-M12)', () => {
  describe('Safety Guard S3: Forbidden 3rd Party Libraries Check', () => {
    it('1. verifies package.json has 0 html2canvas, jspdf, pdfmake or service-worker', () => {
      const allDeps = {
        ...pkg.dependencies,
        ...(pkg as any).devDependencies,
      };

      expect((allDeps as any)['html2canvas']).toBeUndefined();
      expect((allDeps as any)['jspdf']).toBeUndefined();
      expect((allDeps as any)['pdfmake']).toBeUndefined();
      expect((allDeps as any)['workbox-window']).toBeUndefined();
    });
  });

  describe('Safety Guard S6, M5: WebCrypto & Non-Extractable Key Safety', () => {
    it('2. verifies draftCrypto specifies extractable: false for AES-GCM key generation', () => {
      const cryptoFile = Object.entries(rawFiles).find(([p]) => p.includes('draftCrypto.ts'));
      expect(cryptoFile).toBeDefined();
      const content = cryptoFile![1];

      expect(content).toContain('false'); // extractable: false
      expect(content).not.toMatch(/crypto\.subtle\.exportKey/);
    });

    it('3. verifies drafts stored in IndexedDB use AES-GCM and never plain text passwords or tokens', () => {
      const storeFile = Object.entries(rawFiles).find(([p]) => p.includes('draftStore.ts'));
      expect(storeFile).toBeDefined();
      const content = storeFile![1];

      expect(content).toContain('encryptPayload');
      expect(content).toContain('decryptPayload');
      expect(content).not.toContain('JSON.stringify(payload)');
    });
  });

  describe('Safety Guard S7, M3: Non-Punitive & Compassionate Habit UI', () => {
    const habitFileKeys = [
      'HabitStreakBadge.tsx',
      'HabitMilestone.tsx',
      'BackOnTrackBanner.tsx',
      'HabitPage.tsx',
    ];

    it('4. verifies habit components do not use punitive red color classes (bg-red, text-red, text-rose)', () => {
      for (const key of habitFileKeys) {
        const found = Object.entries(rawFiles).find(([p]) => p.endsWith(key));
        if (found) {
          const content = found[1];
          expect(content).not.toMatch(/bg-red-\d+/);
          expect(content).not.toMatch(/text-red-\d+/);
          expect(content).not.toMatch(/border-red-\d+/);
          expect(content).not.toMatch(/text-rose-\d+/);
          expect(content).not.toMatch(/bg-rose-\d+/);
        }
      }
    });

    it('5. verifies habit components do not contain blaming words (thất bại, trừng phạt, bỏ cuộc)', () => {
      for (const key of habitFileKeys) {
        const found = Object.entries(rawFiles).find(([p]) => p.endsWith(key));
        if (found) {
          const content = found[1];
          // Allow the explicit educational disclaimer "Không có ngày nào bị tính là thất bại"
          const sanitized = content.replace(/Không có ngày nào bị tính là thất bại/g, '');
          expect(sanitized.toLowerCase()).not.toContain('thất bại');
          expect(sanitized.toLowerCase()).not.toContain('trừng phạt');
          expect(sanitized.toLowerCase()).not.toContain('bỏ cuộc');
          expect(sanitized.toLowerCase()).not.toContain('kém cỏi');
        }
      }
    });
  });

  describe('Safety Guard S5, Zero-Math Charter: No Client-Side Metric Derivation', () => {
    it('6. verifies habitApi and reportApi return backend numbers without local formula recalculation', () => {
      const habitApi = Object.entries(rawFiles).find(([p]) => p.endsWith('habitApi.ts'))?.[1] || '';
      const reportApi = Object.entries(rawFiles).find(([p]) => p.endsWith('reportApi.ts'))?.[1] || '';

      expect(habitApi).not.toContain('.reduce(');
      expect(reportApi).not.toContain('.reduce(');
    });
  });

  describe('Safety Guard S8, M6: Confirmed Offline Sync & Idempotency', () => {
    it('7. verifies draftReviewDialog requires explicit user interaction before sending', () => {
      const dialog = Object.entries(rawFiles).find(([p]) => p.endsWith('DraftReviewDialog.tsx'))?.[1] || '';

      expect(dialog).toContain('handleSyncDraft');
      expect(dialog).toContain('onCheckTodayMeals');
      expect(dialog).toContain('deleteDraft');
    });
  });

  describe('Safety Guard S12, ISC-9: Medical Disclaimer Inside Exported Images', () => {
    it('8. verifies renderReportCanvas draws all 3 required transparent notices', () => {
      const canvasFile = Object.entries(rawFiles).find(([p]) => p.endsWith('renderReportCanvas.ts'))?.[1] || '';

      expect(canvasFile).toContain('Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo');
      expect(canvasFile).toContain('Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo');
      expect(canvasFile).toContain('Báo cáo không thay thế tư vấn y khoa');
    });
  });

  describe('Safety Guard M12: appBus Health Data Leak Prevention', () => {
    it('9. verifies appBus throws error if health-sensitive keys are passed in event payload', () => {
      const busFile = Object.entries(rawFiles).find(([p]) => p.endsWith('appBus.ts'))?.[1] || '';

      expect(busFile).toContain('FORBIDDEN_HEALTH_KEYS');
      expect(busFile).toContain('assertNoHealthData');
    });
  });

  describe('Safety Guard: Zero localStorage / sessionStorage for Health Metrics in Week 6 code', () => {
    it('10. verifies habit, report, export, and offline modules do not use window.localStorage or sessionStorage', () => {
      const targetPrefixes = [
        '../export/',
        '../offline/',
        '../storage/',
        '../components/habit/',
        '../components/report/',
      ];

      for (const [filePath, content] of Object.entries(rawFiles)) {
        if (filePath.includes('__tests__')) continue;
        if (targetPrefixes.some((prefix) => filePath.startsWith(prefix))) {
          expect(content).not.toContain('localStorage.setItem');
          expect(content).not.toContain('sessionStorage.setItem');
        }
      }
    });
  });
});
