/**
 * src/frontend/src/utils/safeRedirect.ts
 * Phòng chống lỗ hổng Open Redirect (ADR/Guardrail M8 & §15.4)
 */

export function safeRedirect(from: unknown, fallback = '/'): string {
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    !from.includes('://')
  ) {
    return from;
  }
  return fallback;
}
