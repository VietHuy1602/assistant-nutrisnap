import React, { useState, useEffect } from 'react';
import { Camera, Flame, Plus, CheckCircle2 } from 'lucide-react';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { apiClient } from '../api/client';
import { DailyDashboardData } from '../types/api';

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DailyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Gọi API lấy dữ liệu Dashboard theo chuẩn API Contract
    apiClient
      .get<DailyDashboardData>('/dashboard/daily')
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error('Lỗi tải dữ liệu dashboard:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500 text-sm">Đang tải dữ liệu dinh dưỡng hôm nay...</div>
      </div>
    );
  }

  const targetCalo = data?.target_calories || 1800;
  const consumedCalo = data?.consumed_calories || 1250;
  const remainingCalo = data?.remaining_calories || 550;
  const percent = Math.min(Math.round((consumedCalo / targetCalo) * 100), 100);

  const protein = data?.macros.protein || { consumed: 85, target: 120, unit: 'g' };
  const carbs = data?.macros.carbs || { consumed: 145, target: 200, unit: 'g' };
  const fat = data?.macros.fat || { consumed: 40, target: 55, unit: 'g' };

  return (
    <div className="space-y-6">
      {/* Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tổng quan Dinh dưỡng Hôm nay
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ghi chép món ăn và theo dõi hạn mức năng lượng khoa học, không phán xét.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#107C41] hover:bg-[#0B522B] text-white font-medium text-sm transition-all shadow-sm active:scale-95">
            <Camera className="w-4 h-4" />
            <span>Chụp ảnh món ăn</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm transition-all">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Thêm thủ công</span>
          </button>
        </div>
      </div>

      {/* Grid: Calorie Ring & Macro Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Calorie Progress */}
        <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center text-center">
          <div className="relative w-44 h-44 flex items-center justify-center">
            {/* SVG Donut / Ring */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                className="text-slate-100"
                strokeWidth="10"
                stroke="currentColor"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                className="text-[#107C41] transition-all duration-1000 ease-out"
                strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - percent / 100)}`}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <Flame className="w-6 h-6 text-orange-500 mb-1" />
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {remainingCalo}
              </span>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                kcal còn lại
              </span>
            </div>
          </div>

          <div className="w-full mt-4 pt-4 border-t border-slate-100 flex justify-around text-center text-sm">
            <div>
              <span className="block text-xs text-slate-400">Đã nạp</span>
              <span className="font-semibold text-slate-800">{consumedCalo} kcal</span>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div>
              <span className="block text-xs text-slate-400">Hạn mức</span>
              <span className="font-semibold text-slate-800">{targetCalo} kcal</span>
            </div>
          </div>
        </div>

        {/* Card Macro Progress (Protein, Carbs, Fat) */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Chất đa lượng (Macronutrients)
            </h2>
            <div className="space-y-4">
              {/* Protein */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-slate-700">Đạm (Protein)</span>
                  <span className="text-slate-500">
                    <strong className="text-blue-600">{protein.consumed}</strong> / {protein.target} {protein.unit}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((protein.consumed / protein.target) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Carbs */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-slate-700">Tinh bột (Carbohydrates)</span>
                  <span className="text-slate-500">
                    <strong className="text-amber-600">{carbs.consumed}</strong> / {carbs.target} {carbs.unit}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-amber-500 h-3 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((carbs.consumed / carbs.target) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Fat */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-slate-700">Chất béo (Lipid / Fat)</span>
                  <span className="text-slate-500">
                    <strong className="text-purple-600">{fat.consumed}</strong> / {fat.target} {fat.unit}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-purple-500 h-3 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((fat.consumed / fat.target) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/60 p-2.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#107C41]" />
            <span>Bạn đang duy trì lượng đạm rất tốt để bảo vệ cơ bắp trong quá trình giảm mỡ!</span>
          </div>
        </div>
      </div>

      {/* Responsible Nutrition Disclaimer */}
      <DisclaimerBadge />
    </div>
  );
};
