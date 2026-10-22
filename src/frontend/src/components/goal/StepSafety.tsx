import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ShieldCheck } from 'lucide-react';
import { GoalFormValues } from '../../schemas/goalSchemas';
import { FormField } from '../FormField';
import { DISCLAIMER_WIZARD } from '../../constants/copy';

interface StepSafetyProps {
  form: UseFormReturn<GoalFormValues>;
}

export const StepSafety: React.FC<StepSafetyProps> = ({ form }) => {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const goalType = watch('goal_type');
  const weeklyPace = watch('weekly_pace_kg') || 0;
  const budget = watch('daily_budget_vnd') || 60000;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const getPaceConfig = () => {
    if (goalType === 'lose_weight') {
      return { min: 0.25, max: 0.75, step: 0.05, label: 'Giảm an toàn: 0,25 – 0,75 kg/tuần' };
    }
    if (goalType === 'gain_muscle') {
      return { min: 0.1, max: 0.5, step: 0.05, label: 'Tăng an toàn: 0,10 – 0,50 kg/tuần' };
    }
    return { min: 0, max: 0, step: 0, label: 'Duy trì vóc dáng: 0 kg/tuần' };
  };

  const paceConfig = getPaceConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Kiểm tra an toàn & Ngân sách</h2>
        <p className="text-xs text-slate-500 mt-1">
          Thiết lập tốc độ thay đổi cân nặng trong khoảng an toàn y khoa và ngân sách ăn uống phù hợp.
        </p>
      </div>

      {/* Tốc độ thay đổi cân nặng */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="weekly_pace_kg" className="text-xs font-semibold uppercase tracking-wider text-slate-700 block">
              Tốc độ thay đổi theo tuần
            </label>
            <p className="text-xs text-slate-500 mt-0.5">{paceConfig.label}</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-nutri-primary">
              {weeklyPace.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 ml-1">kg/tuần</span>
          </div>
        </div>

        {goalType === 'maintain' ? (
          <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
            Mục tiêu Duy trì không thay đổi tốc độ cân nặng (cố định ở mức 0 kg/tuần).
          </p>
        ) : (
          <div>
            <input
              id="weekly_pace_kg"
              type="range"
              min={paceConfig.min}
              max={paceConfig.max}
              step={paceConfig.step}
              value={weeklyPace}
              onChange={(e) => {
                const val = Math.round(parseFloat(e.target.value) * 100) / 100;
                setValue('weekly_pace_kg', val, { shouldValidate: true });
              }}
              className="w-full accent-nutri-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
              <span>{paceConfig.min} kg/tuần (chậm)</span>
              <span>{paceConfig.max} kg/tuần (tối đa an toàn)</span>
            </div>
          </div>
        )}

        {errors.weekly_pace_kg?.message && (
          <p role="alert" className="text-xs text-red-600 font-medium">
            {errors.weekly_pace_kg.message}
          </p>
        )}
      </div>

      {/* Ngân sách ăn uống hằng ngày */}
      <FormField
        id="daily_budget_vnd"
        label="Ngân sách dự kiến mỗi ngày (VNĐ)"
        error={errors.daily_budget_vnd?.message}
        helperText="Gợi ý thực đơn và định lượng dinh dưỡng sẽ bám sát hạn mức tài chính của bạn."
        required
      >
        <div className="space-y-2">
          <input
            id="daily_budget_vnd"
            type="number"
            min={10000}
            step={5000}
            placeholder="60000"
            aria-invalid={!!errors.daily_budget_vnd}
            {...register('daily_budget_vnd', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
              errors.daily_budget_vnd
                ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-200 focus:ring-nutri-primary'
            }`}
          />
          <div className="flex justify-between items-center text-xs text-slate-500 px-1">
            <span>Định dạng:</span>
            <span className="font-semibold text-slate-700">{formatCurrency(budget)}</span>
          </div>
        </div>
      </FormField>

      {/* Cảnh báo y khoa bắt buộc theo M5 */}
      <div role="note" className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-semibold text-amber-950 mb-0.5">Khuyến cáo an toàn dinh dưỡng</p>
          <p>{DISCLAIMER_WIZARD}</p>
        </div>
      </div>
    </div>
  );
};
