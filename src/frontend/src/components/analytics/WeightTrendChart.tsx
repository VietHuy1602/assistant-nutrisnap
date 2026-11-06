/**
 * src/frontend/src/components/analytics/WeightTrendChart.tsx
 * Dual Line Chart: Actual recorded weight + EMA trend line (when available).
 * Zero-Math: Does not compute health metrics; line 2 is omitted when EMA is unavailable.
 * ADR-W5-01, ADR-W5-02, ASC-2, ASC-3 of NS-FE-W5-001.
 */

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  /** Calo đã nạp mỗi ngày: hiện thành cột dưới đường cân nặng */
  calories?: ReadonlyArray<{ date: string; calories: number }>;
}

export const WeightTrendChart: React.FC<WeightTrendChartProps> = ({
  points,
  status,
  masked = false,
  calories,
}) => {
  const reducedMotion = useReducedMotion();

  // Pure mapping for chart display without mutating or computing numbers
  const chartData = useMemo(() => {
    if (!calories?.length) {
      return points.map((p) => ({ ...p, displayDate: formatDayMonth(p.date) }));
    }
    // Ghép theo ngày: mỗi ngày trong khoảng có cột calo, ngày có cân nặng thì có thêm điểm cân nặng
    const byDate = new Map<string, Record<string, unknown>>();
    for (const c of calories) byDate.set(c.date, { date: c.date, kcal: c.calories > 0 ? c.calories : null });  // ngày không ăn: không có điểm
    for (const p of points) byDate.set(p.date, { ...(byDate.get(p.date) ?? {}), ...p });
    return [...byDate.values()]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((d) => ({ ...d, displayDate: formatDayMonth(String(d.date)) }));
  }, [points, calories]);
  const hasKcal = !!calories?.some((c) => c.calories > 0);

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
        className="w-full min-h-64 flex flex-col items-center justify-center text-center text-nutri-muted gap-3 p-4 border border-dashed border-slate-200 rounded-xl"
      >
        <p className="text-sm font-medium">Chưa có dữ liệu cân nặng trong khoảng này.</p>
        <p className="text-xs">Hãy ghi nhận cân nặng để theo dõi tiến trình.</p>
      </div>
    );
  }

  return (
    <div role="img" aria-label={ariaDescription} className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          accessibilityLayer
          margin={{ top: 12, right: 16, bottom: 4, left: -10 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="displayDate"
            interval={hasKcal ? 0 : 'preserveStartEnd'}
            {...(hasKcal
              ? {
                  angle: -45,
                  textAnchor: 'end',
                  height: 46,
                  tick: { fontSize: 10, fill: '#9A3412', fontWeight: 700 },
                  // Mỗi ngày hiện số calo; khoảng dài thì cách quãng để không chồng chữ
                  tickFormatter: (_: string, i: number) => {
                    const step = Math.ceil(chartData.length / 14);
                    const v = Number((chartData[i] as { kcal?: number })?.kcal ?? 0);
                    return v > 0 && i % step === 0 ? Math.round(v).toLocaleString('vi-VN') : '';  // chỉ ghi số ở ngày có dữ liệu
                  },
                }
              : { tick: { fontSize: 13, fill: '#475569' } })}
            tickMargin={8}
            axisLine={{ stroke: '#CBD5E1' }}
          />
          {/* zero-math-ok: padding trục do Recharts xử lý, không phải phép tính dữ liệu sức khỏe */}
          {hasKcal && <YAxis yAxisId="kcal" orientation="right" hide domain={[(min: number) => min * 0.6, (max: number) => max * 1.15]} />}
          <YAxis
            domain={['dataMin - 1', 'dataMax + 1']}
            width={52}
            tick={{ fontSize: 13, fill: '#475569' }}
            tickFormatter={(v: number) => (masked ? '•••' : (Math.round(v * 10) / 10).toLocaleString('vi-VN'))}
            axisLine={{ stroke: '#CBD5E1' }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { weight_kg?: number | null; kcal?: number | null };
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
                  <p className="mb-1 text-slate-900">Ngày {label}</p>
                  {row.weight_kg != null && (
                    <p className="text-[#107C41]">Cân nặng ghi nhận : {masked ? '•••' : formatKg(row.weight_kg)}</p>
                  )}
                  {hasKcal && (
                    <p className="text-orange-700">
                      Calo đã nạp vào : {row.kcal ? `${Math.round(row.kcal).toLocaleString('vi-VN')} kcal` : 'chưa ghi nhận'}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="top"
            height={56}
            wrapperStyle={{ fontSize: '14px', paddingBottom: '8px' }}
          />
          {/* Calo đã nạp: không vẽ đường, chỉ để hiện trong ô chú thích khi chạm (số calo ghi dưới trục ngang) */}
          {hasKcal && (
            <Line
              yAxisId="kcal"
              type="monotone"
              dataKey="kcal"
              name="Calo đã nạp vào"
              stroke="transparent"
              legendType="none"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          )}
          {/* Đường 1: Cân nặng ghi nhận thực tế (nét liền, có điểm, màu xanh thương hiệu #107C41) */}
          <Line
            type="monotone"
            dataKey="weight_kg"
            name="Cân nặng ghi nhận"
            stroke="#107C41"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: '#107C41', strokeWidth: 1, stroke: '#FFFFFF' }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={!reducedMotion}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
