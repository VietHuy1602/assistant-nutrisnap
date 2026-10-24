/**
 * src/frontend/src/components/analytics/WeightTrendChart.tsx
 * Dual Line Chart: Actual recorded weight + EMA trend line (when available).
 * Zero-Math: Does not compute health metrics; line 2 is omitted when EMA is unavailable.
 * ADR-W5-01, ADR-W5-02, ASC-2, ASC-3 of NS-FE-W5-001.
 */

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeightPoint } from '../../api/progressContract';
import type { TrendStatus } from '../../utils/trendStatus';
import { formatDayMonth, formatKg } from '../../utils/chartFormat';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface WeightTrendChartProps {
  points: readonly WeightPoint[];
  status: TrendStatus;
  masked?: boolean;
}

export const WeightTrendChart: React.FC<WeightTrendChartProps> = ({
  points,
  status,
  masked = false,
}) => {
  const reducedMotion = useReducedMotion();

  // Pure mapping for chart display without mutating or computing numbers
  const chartData = useMemo(() => {
    return points.map((p) => ({
      ...p,
      displayDate: formatDayMonth(p.date),
    }));
  }, [points]);

  const firstDate = points.length > 0 ? formatDayMonth(points[0].date) : '';
  const lastDate = points.length > 0 ? formatDayMonth(points[points.length - 1].date) : '';

  const ariaDescription =
    points.length === 0
      ? 'Biểu đồ đường cân nặng: chưa có dữ liệu trong khoảng này.'
      : `Biểu đồ đường cân nặng ghi nhận từ ngày ${firstDate} đến ${lastDate}.${
          status === 'unavailable'
            ? ' Đường xu hướng EMA đang chờ hệ thống tính.'
            : ' Đường xu hướng EMA hiển thị nét đứt.'
        }`;

  if (points.length === 0) {
    return (
      <div
        role="status"
        aria-label="Chưa có dữ liệu cân nặng"
        className="w-full h-72 flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl"
      >
        <p className="text-sm font-medium">Chưa có dữ liệu cân nặng trong khoảng này.</p>
        <p className="text-xs">Hãy ghi nhận cân nặng để theo dõi tiến trình.</p>
      </div>
    );
  }

  return (
    <div role="img" aria-label={ariaDescription} className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          accessibilityLayer
          margin={{ top: 12, right: 16, bottom: 4, left: -10 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="displayDate"
            interval="preserveStartEnd"
            tick={{ fontSize: 11, fill: '#64748B' }}
            tickMargin={8}
            axisLine={{ stroke: '#CBD5E1' }}
          />
          {/* zero-math-ok: padding trục do Recharts xử lý, không phải phép tính dữ liệu sức khỏe */}
          <YAxis
            domain={['dataMin - 1', 'dataMax + 1']}
            width={44}
            tick={{ fontSize: 11, fill: '#64748B' }}
            tickFormatter={(v: number) => (masked ? '•••' : String(v))}
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
            formatter={(value: number, name: string) => {
              if (masked) return ['•••', name];
              return [formatKg(value), name];
            }}
            labelFormatter={(label: string) => `Ngày ${label}`}
          />
          <Legend
            verticalAlign="top"
            height={36}
            wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
          />
          {/* Đường 1: Cân nặng ghi nhận thực tế (nét liền, có điểm, màu xanh thương hiệu #107C41) */}
          <Line
            type="monotone"
            dataKey="weight_kg"
            name="Cân nặng ghi nhận"
            stroke="#107C41"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: '#107C41', strokeWidth: 1, stroke: '#FFFFFF' }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={!reducedMotion}
          />
          {/* Đường 2: Xu hướng EMA làm mịn (nét đứt, không điểm, màu slate #475569) - CHỈ hiển thị khi có EMA */}
          {status !== 'unavailable' && (
            <Line
              type="monotone"
              dataKey="ema_weight"
              name="Xu hướng EMA (tham khảo)"
              stroke="#475569"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
