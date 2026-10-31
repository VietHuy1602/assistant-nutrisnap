/**
 * src/frontend/src/components/analytics/WeeklyCaloriesChart.tsx
 * Biểu đồ tròn (donut) năng lượng nạp vào theo tuần / từng ngày: mỗi kỳ một lát màu riêng,
 * chú thích kèm số kcal từ backend và hạn mức mục tiêu. ADR-W5-03, ASC-5 of NS-FE-W5-001.
 * Zero-Math: chỉ hiển thị số liệu backend trả về; tỷ lệ lát do Recharts tự vẽ.
 */

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { NormalizedCalorieBars } from '../../api/progressContract';
import { formatKcal } from '../../utils/chartFormat';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface WeeklyCaloriesChartProps {
  data: NormalizedCalorieBars;
}

// Bảng màu tươi, dễ phân biệt; không dùng đỏ/hồng (màu báo động, xem zeroMath.guard)
export const CALORIE_SLICE_COLORS = [
  '#EA580C', // cam
  '#0EA5E9', // xanh trời
  '#10B981', // xanh ngọc
  '#8B5CF6', // tím
  '#F59E0B', // hổ phách
  '#14B8A6', // xanh mòng két
  '#6366F1', // chàm
  '#84CC16', // xanh chanh
  '#0891B2', // xanh lam đậm
  '#A855F7', // tím nhạt
  '#CA8A04', // vàng đất
  '#059669', // lục bảo
];

export const WeeklyCaloriesChart: React.FC<WeeklyCaloriesChartProps> = ({ data }) => {
  const reducedMotion = useReducedMotion();
  const { bars, targetCalories, mode } = data;

  if (bars.length === 0) {
    return (
      <div
        role="status"
        aria-label="Chưa có dữ liệu calo"
        className="w-full min-h-64 flex flex-col items-center justify-center text-center text-nutri-muted gap-3 p-4 border border-dashed border-slate-200 rounded-xl"
      >
        <p className="text-sm font-medium">Chưa có dữ liệu nhật ký trong khoảng này.</p>
        <p className="text-xs">Hãy ghi nhận các bữa ăn để theo dõi năng lượng.</p>
      </div>
    );
  }

  const ariaDescription =
    mode === 'weekly'
      ? `Biểu đồ tròn calo theo tuần cho ${bars.length} tuần.`
      : `Biểu đồ tròn calo từng ngày cho ${bars.length} ngày (chưa có số liệu tổng hợp theo tuần).`;
  const colorAt = (index: number) => CALORIE_SLICE_COLORS[index % CALORIE_SLICE_COLORS.length];

  return (
    <div className="w-full space-y-3">
      {mode === 'dailyFallback' && (
        <p className="text-xs text-slate-500 italic">
          Chưa có số liệu tổng hợp theo tuần. Hiển thị năng lượng từng ngày.
        </p>
      )}

      <div role="img" aria-label={ariaDescription} className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={bars}
              dataKey="calories"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="88%"
              paddingAngle={1.5}
              stroke="#FFFFFF"
              strokeWidth={2}
              isAnimationActive={!reducedMotion}
            >
              {bars.map((bar, index) => (
                <Cell key={bar.label} fill={colorAt(index)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                borderRadius: '0.75rem',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '14px',
              }}
              formatter={(value: number, name: string) => [formatKcal(value), `Kỳ ${name}`]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Chú thích: màu – kỳ – số kcal (giá trị backend, không tính toán ở client) */}
      <ul aria-label="Chú thích năng lượng theo kỳ" className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
        {bars.map((bar, index) => (
          <li key={bar.label} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: colorAt(index) }}
            />
            <span className="text-slate-600">{bar.label}</span>
            <span className="ml-auto font-semibold text-slate-800">{formatKcal(bar.calories)}</span>
          </li>
        ))}
      </ul>

      {typeof targetCalories === 'number' && targetCalories > 0 && (
        <p className="text-xs text-slate-600">
          Hạn mức mục tiêu: <span className="font-semibold text-slate-800">{formatKcal(targetCalories)}</span> / ngày
        </p>
      )}
    </div>
  );
};
