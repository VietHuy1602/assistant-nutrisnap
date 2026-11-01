/**
 * src/frontend/src/components/common/Mascot.tsx
 * Mascot máy ảnh NutriSnap (sticker nền trong suốt) cho các trạng thái giao diện.
 * Chỉ để trang trí: luôn đi kèm văn bản mô tả trạng thái, nên ẩn khỏi trình đọc màn hình.
 */

export type MascotPose =
  | 'wave' // Xin chào
  | 'running' // Chạy bộ / Đang đến
  | 'snap' // Snap! – đang chụp / nhận diện
  | 'thinking' // Suy nghĩ / Tìm kiếm
  | 'eating' // Ăn ngon / Thưởng thức
  | 'workout' // Tập luyện / Cố lên
  | 'celebrate' // Ăn mừng / Thắng lợi
  | 'tired'; // Mệt mỏi / Nghỉ ngơi

interface MascotProps {
  pose: MascotPose;
  /** Kích thước cạnh (px) */
  size?: number;
  className?: string;
}

export function Mascot({ pose, size = 96, className = '' }: MascotProps) {
  return (
    <img
      src={`/branding/mascots/mascot-${pose}.webp`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className={`pointer-events-none select-none object-contain drop-shadow-md ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
