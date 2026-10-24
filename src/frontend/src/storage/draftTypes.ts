/**
 * src/frontend/src/storage/draftTypes.ts
 * Types for offline meal drafts & AES-GCM encrypted records (ADR-W6-02).
 * TUÂN THỦ BẢO MẬT (S6, N4):
 * Tuyệt đối không lưu ảnh, âm thanh, cân nặng hoặc token trong draft payload.
 */

export interface MealDraftItem {
  foodId?: number | null;
  name: string;
  grams: number;
}

export interface MealDraftPayload {
  mealType: string; // 'Sáng' | 'Trưa' | 'Tối' | 'Phụ'
  items: MealDraftItem[];
  note?: string;
  capturedAt?: string; // ISO string
}

export interface EncryptedDraftRecord {
  id: string; // client_request_id (UUID v4)
  createdAt: number; // timestamp ms
  expiresAt: number; // timestamp ms (createdAt + 7 days TTL)
  iv: string; // Base64 encoded 12-byte initialization vector
  cipher: string; // Base64 encoded ciphertext
}

export interface DecryptedDraft {
  id: string;
  createdAt: number;
  expiresAt: number;
  payload: MealDraftPayload;
}
