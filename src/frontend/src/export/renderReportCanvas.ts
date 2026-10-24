/**
 * src/frontend/src/export/renderReportCanvas.ts
 * Vẽ dữ liệu Báo cáo Tháng trực tiếp lên HTML5 Canvas (ADR-W6-05, ADR-W6-06).
 * RÀNG BUỘC BẢO MẬT & MINH BẠCH (M4, ISC-9):
 * - BẮT BUỘC có dòng chú thích ước tính y khoa NẰM TRONG ẢNH.
 * - Độ phân giải x2 cho nét chữ sắc nét trên màn hình Retina/High-DPI.
 * - Không gửi canvas/ảnh đi bất kỳ đâu (0 network requests).
 */

import type { MonthlyReport } from '../api/reportContract';
import { formatMonthDisplay } from '../utils/month';

export function renderReportCanvas(
  report: MonthlyReport,
  exportDateStr: string = new Date().toISOString().slice(0, 10)
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const width = 800;
  const height = 1000;
  const scale = 2; // Độ phân giải Retina 2x

  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context không khả dụng.');
  }

  ctx.scale(scale, scale);

  // 1. Nền trắng sạch sẽ (Pure White)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 2. Viền khung trang nhã
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // 3. Header thương hiệu
  ctx.fillStyle = '#107c41'; // NutriSnap green
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('NUTRISNAP · VIRTUAL AI NUTRITION ASSISTANT', 40, 55);

  // 4. Tiêu đề báo cáo
  ctx.fillStyle = '#0f172a'; // Slate 900
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`Báo cáo Dinh dưỡng & Thói quen — ${formatMonthDisplay(report.month)}`, 40, 90);

  // Ngày xuất bản
  ctx.fillStyle = '#64748b'; // Slate 500
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`Ngày xuất báo cáo: ${exportDateStr} · Chuẩn múi giờ Asia/Ho_Chi_Minh`, 40, 115);

  // Đường phân cách
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(40, 130);
  ctx.lineTo(width - 40, 130);
  ctx.stroke();

  // 5. Thẻ tóm tắt 4 chỉ số (Grid 2x2)
  const drawCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    val: string,
    sub: string
  ) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(title.toUpperCase(), x + 16, y + 26);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(val, x + 16, y + 58);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(sub, x + 16, y + 82);
  };

  const cardW = (width - 80 - 20) / 2;
  const cardH = 98;

  // Card 1: Số ngày có nhật ký
  drawCard(
    40,
    150,
    cardW,
    cardH,
    'Số ngày ghi nhật ký',
    `${report.loggingSummary.totalLoggedDays} ngày`,
    `Tổng số ${report.loggingSummary.totalMealsLogged} bữa ăn đã ghi nhận`
  );

  // Card 2: Biến động cân nặng
  const weightChangeStr =
    typeof report.weightSummary.rawWeightChangeKg === 'number'
      ? `${report.weightSummary.rawWeightChangeKg > 0 ? '+' : ''}${report.weightSummary.rawWeightChangeKg} kg`
      : 'Chưa có dữ liệu';
  const weightRangeStr =
    typeof report.weightSummary.startWeightKg === 'number' &&
    typeof report.weightSummary.endWeightKg === 'number'
      ? `${report.weightSummary.startWeightKg} kg → ${report.weightSummary.endWeightKg} kg`
      : 'Cần ghi nhận thêm';
  drawCard(
    40 + cardW + 20,
    150,
    cardW,
    cardH,
    'Biến động cân nặng',
    weightChangeStr,
    weightRangeStr
  );

  // Card 3: Năng lượng trung bình
  const calStr =
    typeof report.nutritionSummary.avgDailyCalories === 'number'
      ? `${report.nutritionSummary.avgDailyCalories} kcal`
      : 'Chưa có';
  const tdeeStr = `Mục tiêu khuyến nghị: ${report.nutritionSummary.targetTdeeCalories || 2000} kcal`;
  drawCard(40, 265, cardW, cardH, 'Năng lượng trung bình/ngày (Ước tính)', calStr, tdeeStr);

  // Card 4: Tỷ lệ kiên trì
  drawCard(
    40 + cardW + 20,
    265,
    cardW,
    cardH,
    'Tỷ lệ kiên trì thói quen',
    `${report.loggingSummary.consistencyRatePct}%`,
    `Trong chu kỳ theo dõi ${report.loggingSummary.periodDays} ngày`
  );

  // 6. Điểm mạnh tích cực
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('ĐIỂM MẠNH TÍCH CỰC ĐÃ GHI NHẬN TRONG THÁNG', 40, 400);

  let curY = 430;
  const strengthsToRender =
    report.strengths.length > 0
      ? report.strengths.slice(0, 4)
      : ['Đã chủ động bắt đầu theo dõi dinh dưỡng và duy trì thói quen lành mạnh.'];

  for (const s of strengthsToRender) {
    ctx.fillStyle = '#107c41';
    ctx.beginPath();
    ctx.arc(48, curY - 4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(s, 64, curY);
    curY += 28;
  }

  // 7. Chuỗi thói quen & Huy hiệu
  if (report.habitSummary) {
    curY += 10;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(40, curY, width - 80, 75);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(40, curY, width - 80, 75);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('TIẾN ĐỘ THỬ THÁCH 7 NGÀY & HUY HIỆU', 56, curY + 26);

    ctx.fillStyle = '#475569';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(
      `Hoàn thành: ${report.habitSummary.sevenDayChallenge.completedDays}/7 ngày · Huy hiệu: 🏆 ${report.habitSummary.sevenDayChallenge.badgeName}`,
      56,
      curY + 50
    );
    curY += 95;
  } else {
    curY += 25;
  }

  // 8. BẮT BUỘC: KHUNG CHÚ THÍCH MINH BẠCH Y KHOA NẰM TRONG ẢNH (M4, ISC-9)
  const noticeY = Math.max(curY + 20, height - 190);
  ctx.fillStyle = '#fefce8'; // Amber-50
  ctx.fillRect(40, noticeY, width - 80, 130);
  ctx.strokeStyle = '#fef08a'; // Amber-200
  ctx.lineWidth = 1;
  ctx.strokeRect(40, noticeY, width - 80, 130);

  ctx.fillStyle = '#854d0e'; // Amber-800
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('LƯU Ý MINH BẠCH VỀ DỮ LIỆU SỨC KHỎE:', 56, noticeY + 28);

  ctx.fillStyle = '#713f12'; // Amber-900
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const notices = [
    '• Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.',
    '• Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo.',
    '• Báo cáo không thay thế tư vấn y khoa.',
  ];

  let lineY = noticeY + 54;
  for (const n of notices) {
    ctx.fillText(n, 56, lineY);
    lineY += 22;
  }

  // 9. Dòng bản quyền & bảo mật dưới cùng
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    'NutriSnap — Không lưu trữ bản sao ảnh trên máy chủ · Bảo mật dữ liệu người dùng',
    40,
    height - 35
  );

  return canvas;
}
