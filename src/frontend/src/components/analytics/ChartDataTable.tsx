/**
 * src/frontend/src/components/analytics/ChartDataTable.tsx
 * Accessible raw data table alternative for charts (WCAG 2.2 AA).
 * ADR-W5-08 & ASC-6 of NS-FE-W5-001.
 */

import React from 'react';
import type { WeightPoint } from '../../api/progressContract';
import type { CalorieBarPoint } from '../../api/progressContract';
import { formatDayMonth, formatKg, formatKcal } from '../../utils/chartFormat';

interface WeightTableProps {
  type: 'weight';
  points: readonly WeightPoint[];
  masked?: boolean;
}

interface CaloriesTableProps {
  type: 'calories';
  bars: readonly CalorieBarPoint[];
}

type ChartDataTableProps = WeightTableProps | CaloriesTableProps;

export const ChartDataTable: React.FC<ChartDataTableProps> = (props) => {
  if (props.type === 'weight') {
    const { points, masked = false } = props;
    return (
      <div tabIndex={0} role="region" aria-label="Bảng cân nặng, có thể cuộn ngang" className="max-w-full overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[28rem] text-left text-sm tabular-nums border-collapse">
          <caption className="sr-only">Bảng số liệu cân nặng và xu hướng EMA</caption>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <th scope="col" className="px-4 py-2.5 font-semibold">Ngày</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Cân nặng ghi nhận</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Xu hướng EMA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {points.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-center text-slate-400">
                  Chưa có dữ liệu trong khoảng này
                </td>
              </tr>
            ) : (
              points.map((p) => (
                <tr key={p.date} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 text-slate-600">{formatDayMonth(p.date)}</td>
                  <td className="px-4 py-2 font-medium text-emerald-800">
                    {masked ? '•••' : formatKg(p.weight_kg)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {masked ? '•••' : (p.ema_weight != null ? formatKg(p.ema_weight) : '—')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const { bars } = props;
  return (
    <div tabIndex={0} role="region" aria-label="Bảng năng lượng, có thể cuộn ngang" className="max-w-full overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[28rem] text-left text-sm tabular-nums border-collapse">
        <caption className="sr-only">Bảng số liệu năng lượng calo theo kỳ</caption>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
            <th scope="col" className="px-4 py-2.5 font-semibold">Kỳ / Ngày</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Năng lượng nạp</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Số ngày ghi chép</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bars.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-3 text-center text-slate-400">
                Chưa có dữ liệu trong khoảng này
              </td>
            </tr>
          ) : (
            bars.map((b) => (
              <tr key={b.dateKey} className="hover:bg-slate-50/50">
                <td className="px-4 py-2 text-slate-600">{b.label}</td>
                <td className="px-4 py-2 font-medium text-orange-700">{formatKcal(b.calories)}</td>
                <td className="px-4 py-2 text-slate-600">{b.daysLogged} ngày</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
