import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Edit2, ShieldAlert } from 'lucide-react';
import { GoalFormValues } from '../../schemas/goalSchemas';
import { ACTIVITY_LEVEL_LABELS, GOAL_TYPE_LABELS, DISCLAIMER_WIZARD } from '../../constants/copy';

interface StepReviewProps {
  form: UseFormReturn<GoalFormValues>;
  onEditStep: (step: number) => void;
}

export const StepReview: React.FC<StepReviewProps> = ({ form, onEditStep }) => {
  const values = form.getValues();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const genderLabels: Record<string, string> = {
    male: 'Nam',
    female: 'Nữ',
    other: 'Khác',
  };

  const activityInfo = ACTIVITY_LEVEL_LABELS[values.activity_level] || { label: values.activity_level };
  const goalInfo = GOAL_TYPE_LABELS[values.goal_type] || { label: values.goal_type };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Xác nhận thông tin mục tiêu</h2>
        <p className="text-xs text-slate-500 mt-1">
          Kiểm tra lại toàn bộ thông tin trước khi hệ thống tính toán lộ trình dinh dưỡng và hạn mức calo.
        </p>
      </div>

      <div className="space-y-3.5">
        {/* Phần 1: Thông số cơ thể */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              1. Thông số cơ thể
            </span>
            <button
              type="button"
              onClick={() => onEditStep(1)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-nutri-primary hover:underline"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Sửa
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400">Giới tính</p>
              <p className="font-semibold text-slate-800 mt-0.5">{genderLabels[values.gender] || values.gender}</p>
            </div>
            <div>
              <p className="text-slate-400">Tuổi</p>
              <p className="font-semibold text-slate-800 mt-0.5">{values.age} tuổi</p>
            </div>
            <div>
              <p className="text-slate-400">Chiều cao</p>
              <p className="font-semibold text-slate-800 mt-0.5">{values.height_cm} cm</p>
            </div>
            <div>
              <p className="text-slate-400">Cân nặng hiện tại</p>
              <p className="font-semibold text-slate-800 mt-0.5">{values.current_weight_kg} kg</p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-50 text-xs">
            <p className="text-slate-400">Mức độ vận động</p>
            <p className="font-semibold text-slate-800 mt-0.5">{activityInfo.label}</p>
          </div>
        </div>

        {/* Phần 2: Mục tiêu */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              2. Mục tiêu vóc dáng
            </span>
            <button
              type="button"
              onClick={() => onEditStep(2)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-nutri-primary hover:underline"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Sửa
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400">Định hướng mục tiêu</p>
              <p className="font-semibold text-nutri-primary mt-0.5 text-sm">{goalInfo.label}</p>
            </div>
            <div>
              <p className="text-slate-400">Cân nặng mục tiêu</p>
              <p className="font-semibold text-slate-800 mt-0.5 text-sm">
                {values.target_weight_kg} kg
                <span className="text-xs text-slate-400 ml-1.5 font-normal">
                  ({values.target_weight_kg > values.current_weight_kg ? '+' : ''}
                  {(values.target_weight_kg - values.current_weight_kg).toFixed(1)} kg)
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Phần 3: Kế hoạch & Ngân sách */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              3. Lộ trình & Ngân sách
            </span>
            <button
              type="button"
              onClick={() => onEditStep(3)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-nutri-primary hover:underline"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Sửa
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400">Tốc độ thay đổi dự kiến</p>
              <p className="font-semibold text-slate-800 mt-0.5">
                {values.weekly_pace_kg === 0 ? '0 kg/tuần (Duy trì)' : `${values.weekly_pace_kg} kg/tuần`}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Ngân sách dinh dưỡng</p>
              <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(values.daily_budget_vnd)}/ngày</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cam kết an toàn & miễn trừ y khoa */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 flex items-start gap-2.5 text-xs text-slate-600">
        <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p>{DISCLAIMER_WIZARD}</p>
      </div>
    </div>
  );
};
