import { describe, it, expect } from 'vitest';
import { safeRedirect } from '../utils/safeRedirect';

describe('safeRedirect', () => {
  it('1. Chấp nhận đường dẫn nội bộ hợp lệ', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard');
    expect(safeRedirect('/goal-setup?step=2')).toBe('/goal-setup?step=2');
  });

  it('2. Chặn URL giao thức tuyệt đối (https://x)', () => {
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('http://attacker.org/steal')).toBe('/');
  });

  it('3. Chặn protocol-relative URL (//evil.com)', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('//attacker.org/login')).toBe('/');
  });

  it('4. Chặn đường dẫn chứa dấu gạch chéo ngược (/\\evil)', () => {
    expect(safeRedirect('/\\evil.com')).toBe('/');
    expect(safeRedirect('\\malicious')).toBe('/');
  });

  it('5. Chặn đường dẫn có sơ đồ nhúng (javascript:, data:)', () => {
    expect(safeRedirect('javascript://test')).toBe('/');
    expect(safeRedirect('data:text/html,evil')).toBe('/');
  });

  it('6. Trả về fallback khi đầu vào là null, undefined, số hoặc chuỗi rỗng', () => {
    expect(safeRedirect(null, '/login')).toBe('/login');
    expect(safeRedirect(undefined, '/home')).toBe('/home');
    expect(safeRedirect(12345, '/default')).toBe('/default');
    expect(safeRedirect('', '/fallback')).toBe('/fallback');
  });
});
