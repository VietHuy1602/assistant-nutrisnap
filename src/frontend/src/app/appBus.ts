/**
 * src/frontend/src/app/appBus.ts
 * Strongly typed application event bus (ADR-W6-07).
 * TUÂN THỦ NGHIÊM NGẶT (S6, M12):
 * Tuyệt đối cấm mang dữ liệu sức khỏe (calo, gram, cân nặng, tên món ăn) qua bus.
 */

export type AppEventType =
  | 'meal-logged'
  | 'habit-updated'
  | 'offline-draft-synced'
  | 'connectivity-changed'
  | 'session-expired';

export interface AppEvent {
  type: AppEventType;
  at: number; // timestamp ms
  source: string; // e.g. 'capture', 'chat', 'offline-sync', 'auth'
  date?: string; // YYYY-MM-DD optional context date
}

type EventCallback = (event: AppEvent) => void;

// Các từ khóa nhạy cảm về dữ liệu sức khỏe bị cấm tuyệt đối trên event bus
const FORBIDDEN_HEALTH_KEYS = [
  'calorie',
  'calories',
  'kcal',
  'gram',
  'grams',
  'weight',
  'weight_kg',
  'food',
  'foods',
  'meal_items',
  'items',
  'protein',
  'carb',
  'carbs',
  'fat',
  'note',
  'notes',
  'voice',
  'audio',
];

class ApplicationBus {
  private listeners: Map<AppEventType, Set<EventCallback>> = new Map();
  private timers: Map<AppEventType, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Đăng ký lắng nghe sự kiện. Trả về hàm hủy đăng ký (unsubscribe).
   */
  public on(type: AppEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const set = this.listeners.get(type)!;
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  /**
   * Phát sự kiện ngay lập tức.
   * Kiểm tra an toàn: ném lỗi nếu phát hiện bất kỳ trường dữ liệu sức khỏe nhạy cảm nào.
   */
  public emit(event: AppEvent): void {
    this.assertNoHealthData(event);

    const callbacks = this.listeners.get(event.type);
    if (!callbacks || callbacks.size === 0) return;

    callbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        // Cô lập lỗi callback, không làm đứt mạch bus
        if (typeof console !== 'undefined' && console.error) {
          console.error(`[appBus] Error handling event ${event.type}:`, err);
        }
      }
    });
  }

  /**
   * Phát sự kiện có gom nhóm (Coalesce / Debounce 300 ms mặc định)
   * Giúp tránh spam gọi API khi nhiều component cùng lắng nghe làm mới.
   */
  public emitCoalesced(
    type: AppEventType,
    delayMs = 300,
    source = 'coalesced',
    date?: string
  ): void {
    const existingTimer = this.timers.get(type);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(type);
      this.emit({
        type,
        at: Date.now(),
        source,
        date,
      });
    }, delayMs);

    this.timers.set(type, timer);
  }

  /**
   * Xóa toàn bộ listeners và timers (hữu ích cho testing và reset session).
   */
  public clear(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.listeners.clear();
  }

  /**
   * Kiểm tra nghiêm ngặt không cho phép mang payload dữ liệu sức khỏe.
   */
  private assertNoHealthData(event: AppEvent): void {
    const raw = event as unknown as Record<string, unknown>;
    for (const key of Object.keys(raw)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_HEALTH_KEYS.some((forbidden) => lower.includes(forbidden))) {
        throw new Error(
          `[appBus Security Breach] Cấm truyền dữ liệu sức khỏe qua event bus (key: "${key}"). ADR-W6-07.`
        );
      }
    }
  }
}

export const appBus = new ApplicationBus();
