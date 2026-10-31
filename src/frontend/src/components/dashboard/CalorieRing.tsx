import React from 'react';
import { formatKcal } from '../../utils/format';

interface CalorieRingProps {
  consumed: number;
  target: number;
  remaining: number;
  progressPercent: number;
  className?: string;
  personalized?: boolean;
  dateLabel?: string;
}

const R = 54;
const CIRCUMFERENCE = 2 * Math.PI * R; // ~339.292

export const CalorieRing: React.FC<CalorieRingProps> = ({
  consumed,
  target,
  remaining,
  progressPercent,
  className = '',
  personalized = true,
  dateLabel = 'Hôm nay',
}) => {
  const isOver = remaining < 0;
  // Kẹp tỷ lệ hiển thị cung từ 0 đến 1 cho nét vẽ SVG
  const normalizedRatio = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - normalizedRatio);

  // Nhãn truy cập cho trợ năng (WCAG AA)
  const ariaLabel = isOver
    ? `Đã nạp ${formatKcal(consumed)} trên ${formatKcal(target)} kilocalo (${Math.round(progressPercent)}%), vượt hạn mức ${formatKcal(Math.abs(remaining))} kilocalo.`
    : `Đã nạp ${formatKcal(consumed)} trên ${formatKcal(target)} kilocalo (${Math.round(progressPercent)}%), còn lại ${formatKcal(remaining)} kilocalo.`;

  // Màu sắc: Khi vượt hạn mức dùng màu trung tính (hổ phách/xám xanh), tuyệt đối không dùng màu đỏ báo động (ADR-002, N6)
  const strokeColor = isOver ? '#D97706' : '#EA580C';

  return (
    <div
      className={`calorie-summary flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-slate-200/80 shadow-sm relative ${className}`}
      role="img"
      aria-label={personalized ? ariaLabel : `Đã nạp ${formatKcal(consumed)} kilocalo. Mức tham khảo ${formatKcal(target)} kilocalo, chưa phải mục tiêu cá nhân.`}
    >
      <div className="calorie-total hidden">
        <span className="text-base font-medium">Tổng calo đã nạp</span>
        <div className="flex flex-wrap items-baseline gap-2"><strong>{formatKcal(consumed)}</strong><span className="text-sm">kcal</span></div>
      </div>
      <div className="calorie-ring flex flex-col items-center gap-2">
        <span className="calorie-ring-label text-sm font-semibold text-nutri-muted text-center">
          {!personalized ? 'Mức tham khảo' : isOver ? 'Vượt hạn mức' : 'Calo còn lại'}
        </span>
        <div className="calorie-ring-face relative grid aspect-square w-max min-w-32 max-w-full place-items-center">
        <svg aria-hidden="true" className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 128 128">
          {/* Vòng nền mờ */}
          <circle
            cx="64"
            cy="64"
            r={R}
            stroke="#F1F5F9"
            strokeWidth="10"
            fill="transparent"
          />
          {/* Vòng tiến trình calo */}
          <circle
            cx="64"
            cy="64"
            r={R}
            stroke={strokeColor}
            strokeWidth="10"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          />
        </svg>

        {/* Nội dung số ở tâm vòng tròn */}
        <div className="calorie-ring-reading relative flex max-w-full flex-col items-center justify-center p-12 text-center break-words">
          <span className="calorie-ring-value text-2xl tabular-nums font-extrabold tracking-tight text-slate-900">
            {!personalized ? formatKcal(target) : isOver ? `+${formatKcal(Math.abs(remaining))}` : formatKcal(remaining)}
          </span>
          <span className="text-sm text-nutri-muted font-medium">kcal</span>
        </div>
        </div>
      </div>

      {/* Dòng tóm tắt bên dưới */}
      <div className="calorie-caption mt-4 flex items-center gap-2 text-sm text-slate-600 font-medium">
        <span>
          {personalized ? 'Mục tiêu ngày' : 'Mức tham khảo'}: {formatKcal(target)} kcal
        </span>
      </div>

      {/* Thông điệp tích cực, không phán xét khi vượt hạn mức (N6) */}
      {personalized && isOver && (
        <div className="mt-3 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-800 text-center max-w-xs">
          {dateLabel} bạn đã nạp vượt mục tiêu khoảng {formatKcal(Math.abs(remaining))} kcal (ước tính). Không sao cả — hạn mức các ngày sau vẫn giữ nguyên theo kế hoạch.
        </div>
      )}
    </div>
  );
};
