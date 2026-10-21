import React, { useState } from 'react';
import { Target, Sparkles } from 'lucide-react';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { apiClient } from '../api/client';
import { GoalData } from '../types/api';

export const GoalPlannerPage: React.FC = () => {
  const [formData, setFormData] = useState({
    gender: 'male',
    age: 21,
    height_cm: 172,
    current_weight_kg: 68,
    target_weight_kg: 65,
    activity_level: 'moderate',
    goal_type: 'lose_weight',
    weekly_pace_kg: 0.5,
    daily_budget_vnd: 60000,
  });

  const [result, setResult] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await apiClient.post<GoalData>('/goals', formData);
      setResult(res.data);
      setMessage('Đã lưu và tính toán mục tiêu dinh dưỡng thành công!');
    } catch (err) {
      console.error(err);
      setMessage('Có lỗi xảy ra khi lưu mục tiêu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#107C41] flex items-center justify-center">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Thiết lập Mục tiêu Dinh dưỡng Thông minh</h1>
            <p className="text-sm text-slate-500">
              Công thức BMR Mifflin-St Jeor và kiểm soát tốc độ thay đổi cân nặng an toàn y khoa.
            </p>
          </div>
        </div>

        {message && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 text-[#107C41] text-sm border border-emerald-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Giới tính sinh học
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              >
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">Tuổi</label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
                min={10}
                max={100}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Chiều cao (cm)
              </label>
              <input
                type="number"
                value={formData.height_cm}
                onChange={(e) => setFormData({ ...formData, height_cm: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
                min={100}
                max={250}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Cân nặng hiện tại (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.current_weight_kg}
                onChange={(e) => setFormData({ ...formData, current_weight_kg: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Cân nặng mục tiêu (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.target_weight_kg}
                onChange={(e) => setFormData({ ...formData, target_weight_kg: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Mục tiêu vóc dáng
              </label>
              <select
                value={formData.goal_type}
                onChange={(e) => {
                  const newType = e.target.value;
                  let newPace = formData.weekly_pace_kg;
                  if (newType === 'maintain') {
                    newPace = 0.0;
                  } else if (newType === 'gain_muscle' && (newPace < 0.1 || newPace > 0.5)) {
                    newPace = 0.25;
                  } else if (newType === 'lose_weight' && (newPace < 0.25 || newPace > 0.75)) {
                    newPace = 0.5;
                  }
                  setFormData({ ...formData, goal_type: newType, weekly_pace_kg: newPace });
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              >
                <option value="lose_weight">Giảm cân / Giảm mỡ an toàn</option>
                <option value="maintain">Duy trì vóc dáng</option>
                <option value="gain_muscle">Tăng cơ nạc</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Tốc độ điều chỉnh: {formData.weekly_pace_kg} kg/tuần
              </label>
              {formData.goal_type === 'maintain' ? (
                <div className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 mt-2">
                  Mục tiêu giữ cân: Tốc độ thay đổi là 0.0 kg/tuần.
                </div>
              ) : (
                <>
                  <input
                    type="range"
                    min={formData.goal_type === 'gain_muscle' ? '0.1' : '0.25'}
                    max={formData.goal_type === 'gain_muscle' ? '0.5' : '0.75'}
                    step="0.05"
                    value={formData.weekly_pace_kg}
                    onChange={(e) => setFormData({ ...formData, weekly_pace_kg: Number(e.target.value) })}
                    className="w-full accent-[#107C41] mt-2"
                  />
                  <span className="text-xs text-slate-400">
                    {formData.goal_type === 'gain_muscle'
                      ? '(Khuyến nghị tăng cơ an toàn: 0.1 - 0.5 kg/tuần)'
                      : '(Khuyến nghị giảm mỡ an toàn: 0.25 - 0.75 kg/tuần)'}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#107C41] hover:bg-[#0B522B] text-white font-medium transition-all shadow-sm active:scale-98"
          >
            {loading ? 'Đang tính toán...' : 'Lưu Mục tiêu & Tính Hạn mức Calo'}
          </button>
        </form>

        {result && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Kết quả Phân tích Nhu cầu Năng lượng</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="block text-xs text-slate-400">BMR Cơ bản</span>
                <span className="text-lg font-bold text-slate-800">{result.bmr_calories} kcal</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="block text-xs text-slate-400">TDEE Tiêu thụ</span>
                <span className="text-lg font-bold text-slate-800">{result.tdee_calories} kcal</span>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <span className="block text-xs text-emerald-600 font-medium">Hạn mức Calo/ngày</span>
                <span className="text-xl font-extrabold text-[#107C41]">{result.target_calories} kcal</span>
              </div>
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <span className="block text-xs text-blue-600 font-medium">Mục tiêu Đạm</span>
                <span className="text-xl font-extrabold text-blue-700">{result.target_protein_g}g</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <DisclaimerBadge />
    </div>
  );
};
