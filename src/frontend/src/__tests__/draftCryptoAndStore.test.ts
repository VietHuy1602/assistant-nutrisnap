import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupMockIndexedDB } from './mockIndexedDB';
import {
  generateDraftKey,
  encryptPayload,
  decryptPayload,
  isCryptoAvailable,
} from '../storage/draftCrypto';
import { draftStore, DRAFT_TTL_MS } from '../storage/draftStore';
import type { MealDraftPayload } from '../storage/draftTypes';

describe('Step 3: Encrypted Draft Storage & AES-GCM (ADR-W6-02)', () => {
  beforeEach(() => {
    setupMockIndexedDB();
    draftStore.close();
  });

  afterEach(async () => {
    await draftStore.clearAll().catch(() => {});
    draftStore.close();
  });

  describe('draftCrypto (AES-GCM 256-bit non-extractable)', () => {
    it('1. generates an AES-GCM 256-bit key', async () => {
      const key = await generateDraftKey();
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('2. STRICT SECURITY: key is non-extractable (extractable: false)', async () => {
      const key = await generateDraftKey();
      expect(key.extractable).toBe(false);

      // WebCrypto exportKey MUST reject
      await expect(window.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    });

    it('3. encryptPayload and decryptPayload round-trip preserves meal data', async () => {
      const key = await generateDraftKey();
      const mockPayload: MealDraftPayload = {
        mealType: 'Trưa',
        items: [
          { foodId: 101, name: 'Phở bò tái', grams: 350 },
          { foodId: null, name: 'Quẩy giòn', grams: 50 },
        ],
        note: 'Ít bánh phở, nhiều hành',
        capturedAt: '2026-10-24T12:00:00Z',
      };

      const encrypted = await encryptPayload(key, mockPayload);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.cipher).toBeDefined();

      const decrypted = await decryptPayload(key, encrypted.iv, encrypted.cipher);
      expect(decrypted.mealType).toBe('Trưa');
      expect(decrypted.items.length).toBe(2);
      expect(decrypted.items[0].name).toBe('Phở bò tái');
      expect(decrypted.items[0].grams).toBe(350);
      expect(decrypted.note).toBe('Ít bánh phở, nhiều hành');
    });

    it('4. encrypting the same payload twice produces different IVs and ciphers (semantic security)', async () => {
      const key = await generateDraftKey();
      const payload: MealDraftPayload = {
        mealType: 'Tối',
        items: [{ name: 'Cơm tấm sườn bì', grams: 400 }],
      };

      const enc1 = await encryptPayload(key, payload);
      const enc2 = await encryptPayload(key, payload);

      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.cipher).not.toBe(enc2.cipher);
    });

    it('5. STRICT PRIVACY: ciphertext and IV do NOT contain plaintext food names or grams', async () => {
      const key = await generateDraftKey();
      const payload: MealDraftPayload = {
        mealType: 'Sáng',
        items: [{ name: 'Bánh mì chả lụa đặc biệt', grams: 250 }],
        note: 'Bí mật sức khỏe không được lộ',
      };

      const encrypted = await encryptPayload(key, payload);
      const rawText = encrypted.iv + encrypted.cipher;

      expect(rawText).not.toContain('Bánh mì chả lụa');
      expect(rawText).not.toContain('250');
      expect(rawText).not.toContain('Bí mật sức khỏe');
    });

    it('6. decryption with tampered ciphertext or wrong IV rejects', async () => {
      const key = await generateDraftKey();
      const payload: MealDraftPayload = {
        mealType: 'Phụ',
        items: [{ name: 'Sữa chua không đường', grams: 100 }],
      };

      const encrypted = await encryptPayload(key, payload);
      // Tamper cipher
      const tamperedCipher = btoa('corrupted-data-content');

      await expect(decryptPayload(key, encrypted.iv, tamperedCipher)).rejects.toThrow();
    });

    it('7. isCryptoAvailable reflects presence of window.crypto.subtle', () => {
      expect(isCryptoAvailable()).toBe(true);
    });
  });

  describe('draftStore (IndexedDB with TTL 7 days)', () => {
    it('8. isAvailable returns true when IDB & Crypto are supported', async () => {
      const available = await draftStore.isAvailable();
      expect(available).toBe(true);
    });

    it('9. saveDraft encrypts and persists draft, returning UUID', async () => {
      const payload: MealDraftPayload = {
        mealType: 'Trưa',
        items: [{ name: 'Bún chả Hà Nội', grams: 300 }],
      };

      const draftId = await draftStore.saveDraft(payload);
      expect(draftId).toBeDefined();
      expect(draftId.length).toBeGreaterThan(10);

      const retrieved = await draftStore.getDraft(draftId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(draftId);
      expect(retrieved?.payload.items[0].name).toBe('Bún chả Hà Nội');
    });

    it('10. enforces TTL 7 days (expiresAt = createdAt + 7 days)', async () => {
      const before = Date.now();
      const draftId = await draftStore.saveDraft({
        mealType: 'Sáng',
        items: [{ name: 'Xôi bắp', grams: 150 }],
      });
      const after = Date.now();

      const retrieved = await draftStore.getDraft(draftId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.createdAt).toBeGreaterThanOrEqual(before);
      expect(retrieved!.createdAt).toBeLessThanOrEqual(after);
      expect(retrieved!.expiresAt).toBe(retrieved!.createdAt + DRAFT_TTL_MS);
    });

    it('11. listDrafts returns all valid drafts sorted newest first', async () => {
      const id1 = await draftStore.saveDraft({
        mealType: 'Sáng',
        items: [{ name: 'Món 1', grams: 100 }],
      });

      // Advance clock slightly
      await new Promise((r) => setTimeout(r, 10));

      const id2 = await draftStore.saveDraft({
        mealType: 'Trưa',
        items: [{ name: 'Món 2', grams: 200 }],
      });

      const list = await draftStore.listDrafts();
      expect(list.length).toBe(2);
      expect(list[0].id).toBe(id2);
      expect(list[1].id).toBe(id1);
    });

    it('12. deleteDraft removes single draft by id', async () => {
      const draftId = await draftStore.saveDraft({
        mealType: 'Phụ',
        items: [{ name: 'Táo Mỹ', grams: 120 }],
      });

      expect(await draftStore.getDraft(draftId)).not.toBeNull();

      await draftStore.deleteDraft(draftId);
      expect(await draftStore.getDraft(draftId)).toBeNull();
    });

    it('13. purgeExpired deletes drafts older than 7 days', async () => {
      const draftId = await draftStore.saveDraft({
        mealType: 'Tối',
        items: [{ name: 'Canh bí đỏ', grams: 200 }],
      });

      // Purge with simulated future timestamp > 7 days
      const futureTime = Date.now() + DRAFT_TTL_MS + 1000;
      const purgedCount = await draftStore.purgeExpired(futureTime);

      expect(purgedCount).toBe(1);
      expect(await draftStore.getDraft(draftId)).toBeNull();
    });

    it('14. clearAll wipes all drafts and keys on logout (S6, M5)', async () => {
      await draftStore.saveDraft({
        mealType: 'Sáng',
        items: [{ name: 'Cháo gà', grams: 250 }],
      });
      await draftStore.saveDraft({
        mealType: 'Trưa',
        items: [{ name: 'Cơm cá hồi', grams: 300 }],
      });

      expect((await draftStore.listDrafts()).length).toBe(2);

      await draftStore.clearAll();

      expect((await draftStore.listDrafts()).length).toBe(0);
    });

    it('15. allows updating existing draft when passing existingId', async () => {
      const customId = 'fixed-draft-uuid-001';
      await draftStore.saveDraft(
        {
          mealType: 'Sáng',
          items: [{ name: 'Bánh cuốn', grams: 180 }],
        },
        customId
      );

      const draft = await draftStore.getDraft(customId);
      expect(draft?.id).toBe(customId);
      expect(draft?.payload.items[0].name).toBe('Bánh cuốn');

      // Update same draft
      await draftStore.saveDraft(
        {
          mealType: 'Sáng',
          items: [{ name: 'Bánh cuốn chả quế', grams: 220 }],
        },
        customId
      );

      const updated = await draftStore.getDraft(customId);
      expect(updated?.id).toBe(customId);
      expect(updated?.payload.items[0].name).toBe('Bánh cuốn chả quế');
      expect(updated?.payload.items[0].grams).toBe(220);
    });
  });
});
