/**
 * src/frontend/src/storage/draftCrypto.ts
 * AES-GCM 256-bit Web Crypto layer for offline meal drafts (ADR-W6-02).
 * RÀNG BUỘC BẢO MẬT (M5, N12):
 * - Khóa sinh ra bắt buộc là non-extractable (extractable: false).
 * - exportKey('raw') bắt buộc bị trình duyệt từ chối.
 * - Mỗi lần mã hóa sử dụng một IV 12-byte ngẫu nhiên mới.
 */

import type { MealDraftPayload } from './draftTypes';

// Helpers chuyển đổi Buffer <-> Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Kiểm tra xem môi trường hiện tại có hỗ trợ Web Crypto API và SubtleCrypto hay không.
 */
export function isCryptoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle !== 'undefined'
  );
}

/**
 * Sinh khóa AES-GCM 256-bit non-extractable.
 */
export async function generateDraftKey(): Promise<CryptoKey> {
  if (!isCryptoAvailable()) {
    throw new Error('[draftCrypto] Web Crypto API không khả dụng trong môi trường này.');
  }

  return window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // NON-EXTRACTABLE (M5)
    ['encrypt', 'decrypt']
  );
}

/**
 * Mã hóa payload bản nháp bằng AES-GCM với IV 12-byte ngẫu nhiên.
 */
export async function encryptPayload(
  key: CryptoKey,
  payload: MealDraftPayload
): Promise<{ iv: string; cipher: string }> {
  if (!isCryptoAvailable()) {
    throw new Error('[draftCrypto] Web Crypto API không khả dụng.');
  }

  const jsonStr = JSON.stringify(payload);
  const encoded = new TextEncoder().encode(jsonStr);

  // Sinh IV 12 byte ngẫu nhiên mỗi lần mã hóa
  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));

  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes,
    },
    key,
    encoded
  );

  return {
    iv: arrayBufferToBase64(ivBytes.buffer),
    cipher: arrayBufferToBase64(cipherBuffer),
  };
}

/**
 * Giải mã chuỗi cipher và trả về MealDraftPayload.
 */
export async function decryptPayload(
  key: CryptoKey,
  ivBase64: string,
  cipherBase64: string
): Promise<MealDraftPayload> {
  if (!isCryptoAvailable()) {
    throw new Error('[draftCrypto] Web Crypto API không khả dụng.');
  }

  const ivBuffer = base64ToArrayBuffer(ivBase64);
  const cipherBuffer = base64ToArrayBuffer(cipherBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(ivBuffer),
    },
    key,
    cipherBuffer
  );

  const decodedStr = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(decodedStr) as MealDraftPayload;
}
