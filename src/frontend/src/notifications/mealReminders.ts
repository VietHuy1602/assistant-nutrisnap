/**
 * src/frontend/src/notifications/mealReminders.ts
 * Thông báo nhắc chụp bữa ăn trên màn hình khoá (Android/iOS), kèm mascot.
 *
 * Cách hoạt động (không cần server push):
 * - Lên lịch sẵn nhắc Sáng / Trưa / Tối và nhắc giữ chuỗi cho 7 ngày tới (thông báo cục bộ).
 * - Mỗi khi mở app hoặc vừa lưu bữa ăn: bỏ nhắc của các bữa HÔM NAY đã ghi, nên người dùng chỉ
 *   nhận thông báo cho bữa còn thiếu.
 * - Chỉ chạy trên app native; trên web không làm gì.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

export type ReminderSlot = 'breakfast' | 'lunch' | 'dinner' | 'streak';

const CHANNEL_ID = 'meal-reminders';
const DAYS_AHEAD = 7;
const KIND = 'nutrisnap-meal-reminder';

interface SlotConfig {
  slot: ReminderSlot;
  hour: number;
  minute: number;
  mascot: string; // tên ảnh trong res/drawable-nodpi
  messages: Array<{ title: string; body: string }>;
}

export const REMINDER_SLOTS: SlotConfig[] = [
  {
    slot: 'breakfast',
    hour: 9,
    minute: 30,
    mascot: 'notif_mascot_tired',
    messages: [
      { title: 'Ơ kìa, quên bữa sáng rồi! 🥺', body: 'Bạn chưa chụp bữa sáng hôm nay. Snap một tấm thôi, chỉ mất 3 giây! 📸' },
      { title: 'Mascot đói bụng nè 🍳', body: 'Bữa sáng của bạn đâu rồi? Chụp lại để giữ chuỗi thói quen nhé!' },
      { title: 'Chào buổi sáng! ☀️', body: 'Bạn chưa chụp bữa sáng. Ghi ngay để NutriSnap tính calo chuẩn cho cả ngày.' },
    ],
  },
  {
    slot: 'lunch',
    hour: 13,
    minute: 30,
    mascot: 'notif_mascot_snap',
    messages: [
      { title: 'Bữa trưa chưa được “Snap!” 📸', body: 'Bạn chưa chụp bữa trưa. Đừng để lỡ nhé, mascot đang đợi đó!' },
      { title: 'Trưa rồi, ăn gì thế? 🍜', body: 'Bạn chưa chụp bữa trưa. Chụp món để xem mình đã nạp bao nhiêu calo nào.' },
      { title: 'Thiếu chút nữa là trọn ngày! 🌱', body: 'Bữa trưa còn trống. Chụp ngay để giữ phong độ!' },
    ],
  },
  {
    slot: 'dinner',
    hour: 19,
    minute: 30,
    mascot: 'notif_mascot_eating',
    messages: [
      { title: 'Bữa tối thế nào rồi? 🍲', body: 'Bạn chưa chụp bữa tối. Snap một tấm để khép lại ngày thật đẹp!' },
      { title: 'Ơ kìa, bữa tối đâu? 🥺', body: 'Mascot chưa thấy bữa tối của bạn. Chỉ mất 3 giây thôi!' },
      { title: 'Sắp hết ngày rồi ⏰', body: 'Bạn chưa chụp bữa tối. Ghi ngay để báo cáo hôm nay đầy đủ nhé.' },
    ],
  },
  {
    slot: 'streak',
    hour: 21,
    minute: 0,
    mascot: 'notif_mascot_running',
    messages: [
      { title: 'Chuỗi thói quen sắp đứt! 🔥', body: 'Hôm nay bạn chưa ghi bữa ăn nào để hoàn thành nhiệm vụ. Vào app quay lại đường đua nào! 🚀' },
      { title: 'Nhiệm vụ hôm nay chưa xong 🎯', body: 'Ghi ít nhất 1 bữa ăn trước khi ngày kết thúc để giữ chuỗi nhé!' },
    ],
  },
];

export const isRemindersSupported = (): boolean => Capacitor.isNativePlatform();

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** ID cố định theo ngày + bữa để huỷ/lên lịch lại không bị trùng (vd 3/11 bữa trưa → 11032). */
export function reminderId(date: Date, slotIndex: number): number {
  return Number(`${date.getMonth() + 1}${pad(date.getDate())}${slotIndex + 1}`);
}

/**
 * Tạo danh sách thông báo cần lên lịch.
 * loggedToday: các meal_type đã ghi trong hôm nay (breakfast/lunch/dinner/snack).
 */
export function buildReminderSchedule(now: Date, loggedToday: Set<string>): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    REMINDER_SLOTS.forEach((cfg, index) => {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), cfg.hour, cfg.minute);
      if (at.getTime() <= now.getTime()) return;
      if (offset === 0) {
        if (cfg.slot === 'streak' && loggedToday.size > 0) return;
        if (cfg.slot !== 'streak' && loggedToday.has(cfg.slot)) return;
      }
      const msg = cfg.messages[(day.getDate() + index) % cfg.messages.length];
      out.push({
        id: reminderId(day, index),
        title: msg.title,
        body: msg.body,
        largeBody: msg.body,
        summaryText: 'NutriSnap',
        largeIcon: cfg.mascot,
        smallIcon: 'ic_stat_nutrisnap',
        iconColor: '#EC4899',
        channelId: CHANNEL_ID,
        schedule: { at, allowWhileIdle: true },
        // Nhắc nhở không cần đúng từng giây: dùng báo thức thường, không bắt người dùng bật quyền "Báo thức chính xác"
        isExactNotification: false,
        extra: { kind: KIND, slot: cfg.slot, date: dayKey(day) },
      });
    });
  }
  return out;
}

let channelReady = false;

async function ensurePermissionAndChannel(): Promise<boolean> {
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
    perm = await LocalNotifications.requestPermissions();
  }
  if (perm.display !== 'granted') return false;
  if (!channelReady && Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Nhắc chụp bữa ăn',
      description: 'Nhắc khi bạn quên chụp bữa sáng, trưa, tối hoặc sắp mất chuỗi thói quen',
      importance: 4,
      visibility: 1, // hiện đầy đủ nội dung trên màn hình khoá
      vibration: true,
    });
    channelReady = true;
  }
  return true;
}

async function cancelOurPending(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter((n) => (n.extra as { kind?: string } | undefined)?.kind === KIND);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
}

/** Lên lịch lại toàn bộ nhắc nhở theo các bữa đã ghi hôm nay. */
export async function syncMealReminders(loggedToday: Iterable<string>, now: Date = new Date()): Promise<void> {
  if (!isRemindersSupported()) return;
  try {
    if (!(await ensurePermissionAndChannel())) return;
    await cancelOurPending();
    const schedule = buildReminderSchedule(now, new Set(loggedToday));
    if (schedule.length) await LocalNotifications.schedule({ notifications: schedule });
  } catch (err) {
    console.warn('[mealReminders] Không lên lịch được thông báo', err);
  }
}

/** Huỷ mọi nhắc nhở (khi đăng xuất). */
export async function cancelMealReminders(): Promise<void> {
  if (!isRemindersSupported()) return;
  try {
    await cancelOurPending();
  } catch {
    // bỏ qua: không có nhắc nào để huỷ
  }
}

/** Bấm vào thông báo → mở màn hình chụp món. Trả về hàm huỷ đăng ký. */
export function onReminderTapped(handler: (slot: ReminderSlot) => void): () => void {
  if (!isRemindersSupported()) return () => {};
  const sub = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event.notification.extra as { kind?: string; slot?: ReminderSlot } | undefined;
    if (extra?.kind === KIND) handler(extra.slot ?? 'lunch');
  });
  return () => {
    void sub.then((s) => s.remove());
  };
}
