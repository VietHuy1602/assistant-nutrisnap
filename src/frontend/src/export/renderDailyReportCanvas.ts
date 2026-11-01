/**
 * src/frontend/src/export/renderDailyReportCanvas.ts
 * Vẽ bảng "Dinh dưỡng từng ngày" của Báo cáo tháng lên <canvas> để xuất PDF trong app Android/iOS
 * (WebView không hỗ trợ window.print). Chỉ hiển thị số liệu đã có; ngày thiếu dữ liệu ghi rõ "Chưa có dữ liệu".
 * Không dùng thư viện bên thứ ba (ADR-W6-05).
 */

import type { ReportRow } from '../utils/monthlyReport';

const WIDTH = 820;
const PAD = 32;
const ROW_H = 30;
const COLS = [
  { title: 'Ngày', x: PAD },
  { title: 'Năng lượng (kcal)', x: 170 },
  { title: 'Đạm (g)', x: 360 },
  { title: 'Tinh bột (g)', x: 490 },
  { title: 'Chất béo (g)', x: 640 },
];
const STATE_LABEL: Record<ReportRow['state'], string> = {
  available: '',
  unavailable: 'Chưa có dữ liệu',
  error: 'Lỗi dữ liệu',
  future: 'Ngày tương lai',
  invalid: 'Dữ liệu không hợp lệ',
};

const fmt = (v: number | null) =>
  v === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v);

export function renderDailyReportCanvas(
  title: string,
  rows: ReportRow[],
  summary?: { totalCalories?: number | null; averageDailyCalories?: number | null },
): HTMLCanvasElement {
  const headerH = 150;
  const footerH = 90;
  const height = headerH + ROW_H * (rows.length + 1) + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được ảnh báo cáo.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#047857';
  ctx.font = 'bold 13px Inter, system-ui, sans-serif';
  ctx.fillText('NUTRISNAP · BÁO CÁO DINH DƯỠNG', PAD, 36);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px Inter, system-ui, sans-serif';
  ctx.fillText(title, PAD, 70);
  ctx.fillStyle = '#475569';
  ctx.font = '14px Inter, system-ui, sans-serif';
  const summaryText = [
    typeof summary?.totalCalories === 'number' ? `Tổng: ${fmt(summary.totalCalories)} kcal` : null,
    typeof summary?.averageDailyCalories === 'number' ? `Trung bình/ngày: ${fmt(summary.averageDailyCalories)} kcal` : null,
  ].filter(Boolean).join(' · ');
  ctx.fillText(summaryText || 'Số liệu do nguồn dữ liệu cung cấp.', PAD, 102);

  // Header row
  let y = headerH;
  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(PAD - 8, y - ROW_H / 2, WIDTH - 2 * PAD + 16, ROW_H);
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 13px Inter, system-ui, sans-serif';
  for (const col of COLS) ctx.fillText(col.title, col.x, y);

  ctx.font = '13px Inter, system-ui, sans-serif';
  rows.forEach((row, index) => {
    y += ROW_H;
    if (index % 2 === 1) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(PAD - 8, y - ROW_H / 2, WIDTH - 2 * PAD + 16, ROW_H);
    }
    ctx.fillStyle = '#0f172a';
    ctx.fillText(row.date.split('-').reverse().join('/'), COLS[0].x, y);
    const label = STATE_LABEL[row.state];
    if (row.state !== 'available' && row.calories === null) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(label, COLS[1].x, y);
      return;
    }
    ctx.fillStyle = '#0f172a';
    ctx.fillText(fmt(row.calories), COLS[1].x, y);
    ctx.fillText(fmt(row.proteinG), COLS[2].x, y);
    ctx.fillText(fmt(row.carbsG), COLS[3].x, y);
    ctx.fillText(fmt(row.fatG), COLS[4].x, y);
  });

  ctx.fillStyle = '#92400e';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.fillText('Số liệu dinh dưỡng chỉ mang tính ước tính tham khảo, không thay thế tư vấn y khoa.', PAD, height - 50);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Xuất ngày ${new Date().toLocaleDateString('vi-VN')} · Giờ Việt Nam`, PAD, height - 26);
  return canvas;
}
