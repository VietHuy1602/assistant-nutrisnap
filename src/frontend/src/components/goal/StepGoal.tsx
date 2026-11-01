import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { TrendingDown, Minus, TrendingUp, Info } from 'lucide-react';
import { GoalFormValues } from '../../schemas/goalSchemas';
import { FormField } from '../FormField';
import { GOAL_TYPE_LABELS } from '../../constants/copy';
import { GoalType } from '../../types/api';

interface StepGoalProps {
  form: UseFormReturn<GoalFormValues>;
}

// Nền pastel & ô biểu tượng màu cho từng loại mục tiêu (chỉ trang trí)
const GOAL_TONES: Record<GoalType, { card: string; chip: string }> = {
  lose_weight: { card: 'from-emerald-50 to-teal-50', chip: 'bg-orange-100' },
  maintain: { card: 'from-sky-50 to-rose-50', chip: 'bg-emerald-100' },
  gain_muscle: { card: 'from-rose-50 to-amber-50', chip: 'bg-blue-100' },
};

export const StepGoal: React.FC<StepGoalProps> = ({ form }) => {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const currentGoalType = watch('goal_type');
  const currentWeight = watch('current_weight_kg') || 0;

  const handleSelectGoalType = (type: GoalType) => {
    setValue('goal_type', type, { shouldValidate: true });

    if (type === 'maintain') {
      setValue('target_weight_kg', currentWeight, { shouldValidate: true });
      setValue('weekly_pace_kg', 0, { shouldValidate: true });
    } else if (type === 'lose_weight') {
      setValue('weekly_pace_kg', 0.5, { shouldValidate: true });
      // Nếu mục tiêu cũ >= cân nặng hiện tại, gợi ý giảm 2kg
      const currentTarget = watch('target_weight_kg');
      if (currentTarget >= currentWeight && currentWeight > 27) {
        setValue('target_weight_kg', currentWeight - 2, { shouldValidate: true });
      }
    } else if (type === 'gain_muscle') {
      setValue('weekly_pace_kg', 0.25, { shouldValidate: true });
      const currentTarget = watch('target_weight_kg');
      if (currentTarget <= currentWeight) {
        setValue('target_weight_kg', currentWeight + 2, { shouldValidate: true });
      }
    }
  };

  const goalOptions: Array<{
    type: GoalType;
    icon: React.ReactNode;
    label: string;
    desc: string;
  }> = [
    {
      type: 'lose_weight',
      icon: <TrendingDown className="w-5 h-5 text-orange-500" />,
      ...GOAL_TYPE_LABELS.lose_weight,
    },
    {
      type: 'maintain',
      icon: <Minus className="w-5 h-5 text-emerald-500" />,
      ...GOAL_TYPE_LABELS.maintain,
    },
    {
      type: 'gain_muscle',
      icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
      ...GOAL_TYPE_LABELS.gain_muscle,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Mục tiêu vóc dáng & Sức khỏe</h2>
        <p className="text-xs text-slate-500 mt-1">
          Chọn định hướng thay đổi thể trạng phù hợp với thể trạng cá nhân và phong cách sống.
        </p>
      </div>

      {/* Thẻ chọn loại mục tiêu */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
          Loại mục tiêu <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 gap-3.5">
          {goalOptions.map((opt) => {
            const isSelected = currentGoalType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => handleSelectGoalType(opt.type)}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between shadow-sm bg-gradient-to-r ${GOAL_TONES[opt.type].card} ${
                  isSelected
                    ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/15 shadow-md'
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div>
                  <div className={`p-2 rounded-xl w-fit mb-3 ${GOAL_TONES[opt.type].chip}`}>{opt.icon}</div>
                  <p className={`text-base font-bold ${isSelected ? 'text-emerald-800' : 'text-slate-900'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
        {errors.goal_type?.message && (
          <p role="alert" className="text-xs text-red-600 font-medium">
            {errors.goal_type.message}
          </p>
        )}
      </div>

      {/* Cân nặng mục tiêu */}
      {currentGoalType === 'maintain' ? (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
          <Info className="w-5 h-5 text-nutri-primary shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Duy trì cân nặng hiện tại</p>
            <p>
              Hệ thống tự động đồng bộ cân nặng mục tiêu bằng cân nặng hiện tại (
              <strong>{currentWeight} kg</strong>) và thiết lập tốc độ thay đổi bằng 0.
            </p>
          </div>
        </div>
      ) : (
        <FormField
          id="target_weight_kg"
          label="Cân nặng mục tiêu (kg)"
          error={errors.target_weight_kg?.message}
          helperText={
            currentGoalType === 'lose_weight'
              ? `Cần nhỏ hơn cân nặng hiện tại (${currentWeight} kg)`
              : `Cần lớn hơn cân nặng hiện tại (${currentWeight} kg)`
          }
          required
        >
          <input
            id="target_weight_kg"
            type="number"
            step="0.1"
            min={25}
            max={300}
            placeholder="Ví dụ: 65.0"
            aria-invalid={!!errors.target_weight_kg}
            {...register('target_weight_kg', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
              errors.target_weight_kg
                ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-200 focus:ring-nutri-primary'
            }`}
          />
        </FormField>
      )}
    </div>
  );
};
