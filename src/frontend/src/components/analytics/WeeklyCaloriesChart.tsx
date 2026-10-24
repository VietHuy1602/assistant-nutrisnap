/**
 * src/frontend/src/components/analytics/WeeklyCaloriesChart.tsx
 * Bar chart for weekly / daily fallback calories with target calorie reference line.
 * ADR-W5-03, ASC-5 of NS-FE-W5-001.
 */

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NormalizedCalorieBars } from '../../api/progressContract';
import { formatKcal } from '../../utils/chartFormat';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface WeeklyCaloriesChartProps {
  data: NormalizedCalorieBars;
}

export const WeeklyCaloriesChart: React.FC<WeeklyCaloriesChartProps> = ({ data }) => {
  const reducedMotion = useReducedMotion();
  const { bars, targetCalories, mode } = data;

  if (bars.length === 0) {
    return (
      <div
        role="status"
        aria-label="Chưa có dữ liệu calo"
        className="w-full h-72 flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl"
      >
        <p className="text-sm font-medium">Chưa có dữ liệu nhật ký trong khoảng này.</p>
        <p className="text-xs">Hãy ghi nhận các bữa ăn để theo dõi năng lượng.</p>
      </div>
    );
  }

  const ariaDescription =
    mode === 'weekly'
      ? `Biểu đồ cột calo trung bình theo tuần cho ${bars.length} tuần.`
      : `Biểu đồ cột calo từng ngày cho ${bars.length} ngày (chưa có số liệu tổng hợp theo tuần).`;

  return (
    <div className="w-full space-y-2">
      {mode === 'dailyFallback' && (
        <p className="text-xs text-slate-500 italic">
          Chưa có số liệu tổng hợp theo tuần. Hiển thị năng lượng từng ngày.
        </p>
      )}

      <div role="img" aria-label={ariaDescription} className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bars}
            accessibilityLayer
            margin={{ top: 12, right: 16, bottom: 4, left: -10 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickMargin={8}
              axisLine={{ stroke: '#CBD5E1' }}
            />
            {/* zero-math-ok: padding trục do Recharts */}
            <YAxis
              domain={[0, 'dataMax + 200']}
              width={48}
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickFormatter={(v: number) => String(v)}
              axisLine={{ stroke: '#CBD5E1' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                borderRadius: '0.75rem',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '12px',
              }}
              formatter={(value: number) => [formatKcal(value), 'Nạp vào']}
              labelFormatter={(label: string) => `Kỳ: ${label}`}
            />
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
            />
            {/* Đường hạn mức calo mục tiêu (từ backend, nét đứt slate) */}
            {typeof targetCalories === 'number' && targetCalories > 0 && (
              <ReferenceLine
                y={targetCalories}
                stroke="#475569"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Mục tiêu: ${targetCalories} kcal`,
                  fill: '#475569',
                  fontSize: 10,
                  position: 'top',
                }}
              />
            )}
            {/* Cột Calo: màu cam ấm #EA580C, tuyệt đối KHÔNG dùng màu đỏ */}
            <Bar
              dataKey="calories"
              name="Năng lượng nạp (kcal)"
              fill="#EA580C"
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
              isAnimationActive={!reducedMotion}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
