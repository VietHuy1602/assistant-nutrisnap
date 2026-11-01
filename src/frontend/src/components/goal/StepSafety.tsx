import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ShieldCheck } from 'lucide-react';
import { GoalFormValues, maxSafeLosePace } from '../../schemas/goalSchemas';
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
  const currentWeight = Number(watch('current_weight_kg')) || 0;
  const targetWeight = Number(watch('target_weight_kg')) || 0;
  const weeklyPace = watch('weekly_pace_kg') || 0;
  const budget = watch('daily_budget_vnd') || 60000;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const getPaceConfig = () => {
    if (goalType === 'lose_weight') {
      const max = maxSafeLosePace(currentWeight);
      return { min: 0.25, max, step: 0.05, label: `Giảm an toàn: 0,25 – ${max.toFixed(2).replace('.', ',')} kg/tuần (~1% cân nặng)` };
    }
    if (goalType === 'gain_muscle') {
      return { min: 0.1, max: 0.5, step: 0.05, label: 'Tăng an toàn: 0,10 – 0,50 kg/tuần' };
    }
    return { min: 0, max: 0, step: 0, label: 'Duy trì vóc dáng: 0 kg/tuần' };
  };

  const paceConfig = getPaceConfig();

  // Lộ trình: số kg cần thay đổi, tốc độ đề xuất (đạt mục tiêu trong ~16 tuần nếu an toàn) và thời gian dự kiến
  const deltaKg = Math.abs(currentWeight - targetWeight);
  const roundStep = (v: number) => Math.round(v / 0.05) * 0.05;
  const suggestedPace =
    goalType === 'maintain' || deltaKg === 0
      ? 0
      : Math.round(Math.min(paceConfig.max, Math.max(paceConfig.min, roundStep(deltaKg / 16))) * 100) / 100;
  const weeksNeeded = weeklyPace > 0 && deltaKg > 0 ? Math.ceil(deltaKg / weeklyPace) : 0;
  const etaDate = weeksNeeded > 0 ? new Date(Date.now() + weeksNeeded * 7 * 86_400_000) : null;

  // Đổi mục tiêu/cân nặng làm tốc độ cũ vượt khoảng an toàn mới: tự đưa về mức gần nhất
  React.useEffect(() => {
    if (goalType === 'maintain' || paceConfig.max === 0) return;
    if (weeklyPace > paceConfig.max) setValue('weekly_pace_kg', paceConfig.max, { shouldValidate: true });
    else if (weeklyPace < paceConfig.min) setValue('weekly_pace_kg', paceConfig.min, { shouldValidate: true });
  }, [goalType, paceConfig.max, paceConfig.min, weeklyPace, setValue]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Kiểm tra an toàn & Ngân sách</h2>
        <p className="text-xs text-slate-500 mt-1">
          Thiết lập tốc độ thay đổi cân nặng trong khoảng an toàn y khoa và ngân sách ăn uống phù hợp.
        </p>
      </div>

      {/* Tốc độ thay đổi cân nặng */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50 border border-slate-200/80 shadow-sm space-y-4">
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
              className="w-full h-2 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-emerald-100 via-teal-300 to-emerald-600 accent-teal-500"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
              <span>{paceConfig.min} kg/tuần (chậm)</span>
              <span>{paceConfig.max} kg/tuần (tối đa an toàn)</span>
            </div>
          </div>
        )}

        {goalType !== 'maintain' && deltaKg > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 text-xs text-slate-700 space-y-1.5">
            <p>
              Cần {goalType === 'lose_weight' ? 'giảm' : 'tăng'} <strong>{deltaKg.toLocaleString('vi-VN')} kg</strong>
              {' '}({currentWeight.toLocaleString('vi-VN')} → {targetWeight.toLocaleString('vi-VN')} kg).
              {weeksNeeded > 0 && etaDate && (
                <>
                  {' '}Với tốc độ hiện tại: khoảng <strong>{weeksNeeded} tuần</strong>, dự kiến đạt vào{' '}
                  <strong>{etaDate.toLocaleDateString('vi-VN')}</strong>.
                </>
              )}
            </p>
            {suggestedPace > 0 && Math.abs(suggestedPace - weeklyPace) >= 0.05 && (
              <button
                type="button"
                onClick={() => setValue('weekly_pace_kg', suggestedPace, { shouldValidate: true })}
                className="min-h-9 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Dùng mức đề xuất {suggestedPace.toFixed(2).replace('.', ',')} kg/tuần
              </button>
            )}
            {deltaKg / paceConfig.max > 52 && (
              <p className="text-amber-700">
                Mục tiêu này cần hơn 1 năm ở tốc độ an toàn tối đa. Bạn có thể đặt mốc trung gian gần hơn để dễ duy trì.
              </p>
            )}
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
            className={`w-full min-h-12 px-3.5 py-2.5 rounded-xl border bg-white text-base shadow-sm focus:outline-none focus:ring-2 ${
              errors.daily_budget_vnd
                ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-200 focus:ring-nutri-primary'
            }`}
          />
          <div className="flex justify-between items-center text-xs text-slate-500 px-1">
            <span>Định dạng:</span>
            <span className="font-bold text-emerald-700">{formatCurrency(budget)}</span>
          </div>
        </div>
      </FormField>

      {/* Cảnh báo y khoa bắt buộc theo M5 */}
      <div role="note" className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 shadow-sm flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-semibold text-amber-950 mb-0.5">Khuyến cáo an toàn dinh dưỡng</p>
          <p>{DISCLAIMER_WIZARD}</p>
        </div>
      </div>
    </div>
  );
};
