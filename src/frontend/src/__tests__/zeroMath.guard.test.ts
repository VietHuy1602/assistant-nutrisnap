/**
 * src/frontend/src/__tests__/zeroMath.guard.test.ts
 * Architectural guard scanner: verifies that no file in Zero-Math Zone computes health metrics,
 * uses alarm colors, accesses audio recording hardware, injects HTML, or uses client storage.
 * ADR-W5-01 / Section 10.3 & 16.5 of NS-FE-W5-001.
 */

import { describe, it, expect } from 'vitest';

const files = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ZONES = [
  /components\/analytics\//,
  /components\/swap\//,
  /components\/voice\//,
  /pages\/ProgressAnalyticsPage/,
  /api\/(progress|swap|voice)/,
  /hooks\/(useProgress|useFoodSwap|useSpeech|useVoice)/,
];

const FORBIDDEN: Array<[string, RegExp]> = [
  ['reduce', /\.reduce\(/],
  ['ema-constant', /0\.[19]\s*\*/],
  ['stat-words', /\b(average|mean|median|stddev|smoothing)\b/i],
  ['alarm-colors', /\b(text|bg|border|ring|stroke|fill)-(red|rose)-|#(dc2626|ef4444|b91c1c)/i],
  ['audio-capture', /MediaRecorder/],
  ['html-injection', /dangerouslySetInnerHTML/],
  ['storage', /localStorage|sessionStorage|indexedDB|document\.cookie/],
];

describe('Zero-Math Zone Architectural Guard', () => {
  const matchingFiles = Object.entries(files).filter(([path]) => {
    if (path.includes('__tests__')) return false;
    return ZONES.some((zone) => zone.test(path));
  });

  it('scans at least one file in Zero-Math Zone', () => {
    expect(matchingFiles.length).toBeGreaterThan(0);
  });

  for (const [path, src] of matchingFiles) {
    const lines = src.split('\n');
    // Allow intentional, reviewed exceptions flagged with // zero-math-ok: <reason>
    const clean = lines.filter((l) => !l.includes('zero-math-ok')).join('\n');

    for (const [ruleName, regex] of FORBIDDEN) {
      it(`[${ruleName}] ${path} không vi phạm mẫu cấm`, () => {
        const match = clean.match(regex);
        if (match) {
          throw new Error(
            `Vi phạm quy tắc Zero-Math "${ruleName}" tại ${path}: tìm thấy "${match[0]}". ` +
              `Nếu đây là trường hợp ngoại lệ hợp lệ, hãy thêm comment // zero-math-ok: <lý do>`,
          );
        }
        expect(match).toBeNull();
      });
    }
  }
});
