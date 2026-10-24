/**
 * src/frontend/src/storage/draftStore.ts
 * IndexedDB storage engine for encrypted meal drafts (ADR-W6-02).
 * QUY TẮC AN TOÀN (S6, M5, N3):
 * - Dữ liệu nháp lưu trong IndexedDB ở dạng MÃ HÓA AES-GCM; không lưu text thuần.
 * - Khóa AES non-extractable được lưu structured-clone trong store 'keys'.
 * - TTL 7 ngày (7 * 24 * 3600 * 1000 ms), tự động dọn dẹp (purgeExpired).
 * - clearAll() xóa sạch toàn bộ bản nháp và khóa khi đăng xuất.
 */

import { generateDraftKey, encryptPayload, decryptPayload, isCryptoAvailable } from './draftCrypto';
import type { MealDraftPayload, EncryptedDraftRecord, DecryptedDraft } from './draftTypes';

const DB_NAME = 'nutrisnap-drafts';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';
const KEYS_STORE = 'keys';
const MASTER_KEY_ID = 'master-key';

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class DraftStoreEngine {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;

  /**
   * Kiểm tra khả năng hoạt động của IndexedDB và Web Crypto trong môi trường hiện tại.
   */
  public async isAvailable(): Promise<boolean> {
    if (!isCryptoAvailable()) return false;
    if (typeof window === 'undefined' || !window.indexedDB) return false;
    try {
      const db = await this.getDB();
      return !!db;
    } catch {
      return false;
    }
  }

  /**
   * Mở hoặc tạo IndexedDB instance.
   */
  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB không khả dụng.'));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
          const store = db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(KEYS_STORE)) {
          db.createObjectStore(KEYS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  /**
   * Lấy hoặc sinh mới khóa CryptoKey non-extractable từ store 'keys'.
   */
  private async getMasterKey(): Promise<CryptoKey> {
    if (this.keyPromise) return this.keyPromise;

    this.keyPromise = (async () => {
      const db = await this.getDB();

      // 1. Kiểm tra xem đã có khóa lưu sẵn chưa
      const existingKey = await new Promise<CryptoKey | undefined>((resolve, reject) => {
        const tx = db.transaction(KEYS_STORE, 'readonly');
        const store = tx.objectStore(KEYS_STORE);
        const req = store.get(MASTER_KEY_ID);
        req.onsuccess = () => resolve(req.result?.key as CryptoKey | undefined);
        req.onerror = () => reject(req.error);
      });

      if (existingKey) {
        return existingKey;
      }

      // 2. Chưa có -> Sinh khóa mới và lưu vào IndexedDB
      const newKey = await generateDraftKey();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KEYS_STORE, 'readwrite');
        const store = tx.objectStore(KEYS_STORE);
        const req = store.put({ id: MASTER_KEY_ID, key: newKey });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      return newKey;
    })();

    return this.keyPromise;
  }

  /**
   * Lưu bản nháp (mã hóa hoàn toàn payload trước khi ghi IndexedDB).
   */
  public async saveDraft(payload: MealDraftPayload, existingId?: string): Promise<string> {
    const id = existingId || generateUUID();
    const now = Date.now();
    const expiresAt = now + DRAFT_TTL_MS;

    const key = await this.getMasterKey();
    const { iv, cipher } = await encryptPayload(key, payload);

    const record: EncryptedDraftRecord = {
      id,
      createdAt: now,
      expiresAt,
      iv,
      cipher,
    };

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    return id;
  }

  /**
   * Lấy và giải mã một bản nháp theo id.
   */
  public async getDraft(id: string): Promise<DecryptedDraft | null> {
    const db = await this.getDB();
    const record = await new Promise<EncryptedDraftRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as EncryptedDraftRecord | undefined);
      req.onerror = () => reject(req.error);
    });

    if (!record) return null;

    // Kiểm tra TTL 7 ngày
    if (record.expiresAt <= Date.now()) {
      await this.deleteDraft(id);
      return null;
    }

    const key = await this.getMasterKey();
    const payload = await decryptPayload(key, record.iv, record.cipher);

    return {
      id: record.id,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      payload,
    };
  }

  /**
   * Lấy danh sách toàn bộ các bản nháp còn hạn và giải mã.
   */
  public async listDrafts(): Promise<DecryptedDraft[]> {
    const db = await this.getDB();
    const records = await new Promise<EncryptedDraftRecord[]>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as EncryptedDraftRecord[]);
      req.onerror = () => reject(req.error);
    });

    const now = Date.now();
    const validRecords: EncryptedDraftRecord[] = [];
    const expiredIds: string[] = [];

    for (const r of records) {
      if (r.expiresAt <= now) {
        expiredIds.push(r.id);
      } else {
        validRecords.push(r);
      }
    }

    // Dọn dẹp các bản ghi hết hạn ngầm
    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        this.deleteDraft(id).catch(() => {});
      }
    }

    if (validRecords.length === 0) return [];

    const key = await this.getMasterKey();
    const decryptedList: DecryptedDraft[] = [];

    for (const r of validRecords) {
      try {
        const payload = await decryptPayload(key, r.iv, r.cipher);
        decryptedList.push({
          id: r.id,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          payload,
        });
      } catch (err) {
        // Bỏ qua bản ghi hỏng/không giải mã được
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[draftStore] Không giải mã được draft ${r.id}`, err);
        }
      }
    }

    return decryptedList.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Xóa một bản nháp theo id.
   */
  public async deleteDraft(id: string): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Dọn dẹp toàn bộ bản nháp quá hạn TTL 7 ngày.
   */
  public async purgeExpired(now = Date.now()): Promise<number> {
    const db = await this.getDB();
    const records = await new Promise<EncryptedDraftRecord[]>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as EncryptedDraftRecord[]);
      req.onerror = () => reject(req.error);
    });

    let purgedCount = 0;
    for (const r of records) {
      if (r.expiresAt <= now) {
        await this.deleteDraft(r.id);
        purgedCount++;
      }
    }

    return purgedCount;
  }

  /**
   * Xóa sạch toàn bộ bản nháp và khóa mã hóa khi người dùng đăng xuất (S6, M5).
   */
  public async clearAll(): Promise<void> {
    if (!this.dbPromise) return;
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([DRAFTS_STORE, KEYS_STORE], 'readwrite');
        tx.objectStore(DRAFTS_STORE).clear();
        tx.objectStore(KEYS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      this.keyPromise = null;
    } catch {
      // Bỏ qua lỗi nếu db đã đóng
    }
  }

  /**
   * Đóng kết nối DB (dùng trong test harness).
   */
  public close(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
      this.keyPromise = null;
    }
  }
}

export const draftStore = new DraftStoreEngine();
