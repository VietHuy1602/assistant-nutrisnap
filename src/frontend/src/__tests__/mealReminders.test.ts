import { describe, expect, it } from 'vitest';
import { buildReminderSchedule, reminderId } from '../notifications/mealReminders';

const slotsFor = (list: ReturnType<typeof buildReminderSchedule>, date: string) =>
  list.filter((n) => (n.extra as { date: string }).date === date).map((n) => (n.extra as { slot: string }).slot);

describe('buildReminderSchedule', () => {
  it('chỉ nhắc các bữa hôm nay chưa ghi và chưa qua giờ', () => {
    const now = new Date(2026, 10, 1, 12, 0); // 12:00, đã qua giờ nhắc bữa sáng
    const list = buildReminderSchedule(now, new Set(['lunch']));
    expect(slotsFor(list, '2026-11-01')).toEqual(['dinner']); // trưa đã ghi; đã có bữa nên không nhắc chuỗi
  });

  it('nhắc giữ chuỗi khi hôm nay chưa có bữa nào', () => {
    const now = new Date(2026, 10, 1, 20, 0);
    expect(slotsFor(buildReminderSchedule(now, new Set()), '2026-11-01')).toEqual(['streak']);
  });

  it('lên lịch đủ 4 nhắc cho các ngày tiếp theo, kèm mascot', () => {
    const list = buildReminderSchedule(new Date(2026, 10, 1, 23, 0), new Set());
    expect(slotsFor(list, '2026-11-02')).toEqual(['breakfast', 'lunch', 'dinner', 'streak']);
    expect(list).toHaveLength(24); // 6 ngày tới × 4
    expect(list.every((n) => typeof n.largeIcon === 'string' && n.largeIcon.startsWith('notif_mascot_'))).toBe(true);
    expect(list[0].body).toContain('Bạn chưa chụp bữa sáng');
  });

  it('ID không trùng nhau', () => {
    const list = buildReminderSchedule(new Date(2026, 11, 28, 6, 0), new Set());
    expect(new Set(list.map((n) => n.id)).size).toBe(list.length);
    expect(reminderId(new Date(2026, 10, 3), 1)).toBe(11032);
  });
});
