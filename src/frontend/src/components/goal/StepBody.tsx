import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { GoalFormValues } from '../../schemas/goalSchemas';
import { FormField } from '../FormField';
import { ACTIVITY_LEVEL_LABELS } from '../../constants/copy';
import { ActivityLevel, Gender } from '../../types/api';

interface StepBodyProps {
  form: UseFormReturn<GoalFormValues>;
}

export const StepBody: React.FC<StepBodyProps> = ({ form }) => {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const currentGender = watch('gender');
  const currentActivity = watch('activity_level');

  const genders: Array<{ value: Gender; label: string }> = [
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other', label: 'Khác' },
  ];

  const activityOptions: Array<{ value: ActivityLevel; label: string; desc: string }> = [
    { value: 'sedentary', ...ACTIVITY_LEVEL_LABELS.sedentary },
    { value: 'light', ...ACTIVITY_LEVEL_LABELS.light },
    { value: 'moderate', ...ACTIVITY_LEVEL_LABELS.moderate },
    { value: 'active', ...ACTIVITY_LEVEL_LABELS.active },
    { value: 'very_active', ...ACTIVITY_LEVEL_LABELS.very_active },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Thông số cơ thể cơ bản</h2>
        <p className="text-xs text-slate-500 mt-1">
          Các chỉ số nhân trắc học giúp xác định chính xác nhu cầu năng lượng và tỷ lệ trao đổi chất.
        </p>
      </div>

      {/* Giới tính */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
          Giới tính sinh học <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {genders.map((item) => {
            const isSelected = currentGender === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setValue('gender', item.value, { shouldValidate: true })}
                className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all text-center ${
                  isSelected
                    ? 'border-nutri-primary bg-emerald-50 text-nutri-primary ring-2 ring-nutri-primary/20 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {errors.gender?.message && (
          <p role="alert" className="text-xs text-red-600 font-medium">
            {errors.gender.message}
          </p>
        )}
      </div>

      {/* Tuổi, Chiều cao, Cân nặng */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          id="age"
          label="Tuổi (năm)"
          error={errors.age?.message}
          required
        >
          <input
            id="age"
            type="number"
            min={10}
            max={120}
            placeholder="Ví dụ: 25"
            aria-invalid={!!errors.age}
            {...register('age', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
              errors.age
                ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-200 focus:ring-nutri-primary'
            }`}
          />
        </FormField>

        <FormField
          id="height_cm"
          label="Chiều cao (cm)"
          error={errors.height_cm?.message}
          required
        >
          <input
            id="height_cm"
            type="number"
            step="0.5"
            min={80}
            max={250}
            placeholder="Ví dụ: 172"
            aria-invalid={!!errors.height_cm}
            {...register('height_cm', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
              errors.height_cm
                ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-200 focus:ring-nutri-primary'
            }`}
          />
        </FormField>

        <FormField
          id="current_weight_kg"
          label="Cân nặng hiện tại (kg)"
          error={errors.current_weight_kg?.message}
          required
        >
          <input
            id="current_weight_kg"
            type="number"
            step="0.1"
            min={25}
            max={300}
            placeholder="Ví dụ: 68.5"
            aria-invalid={!!errors.current_weight_kg}
            {...register('current_weight_kg', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
              errors.current_weight_kg
                ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                : 'border-slate-200 focus:ring-nutri-primary'
            }`}
          />
        </FormField>
      </div>

      {/* Mức độ vận động */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
          Mức độ vận động hàng ngày <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2.5">
          {activityOptions.map((opt) => {
            const isSelected = currentActivity === opt.value;
            return (
              <label
                key={opt.value}
                onClick={() => setValue('activity_level', opt.value, { shouldValidate: true })}
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-nutri-primary bg-emerald-50/50 ring-2 ring-nutri-primary/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="activity_level"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => setValue('activity_level', opt.value, { shouldValidate: true })}
                  className="mt-0.5 text-nutri-primary focus:ring-nutri-primary"
                />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isSelected ? 'text-nutri-primary' : 'text-slate-800'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
        {errors.activity_level?.message && (
          <p role="alert" className="text-xs text-red-600 font-medium">
            {errors.activity_level.message}
          </p>
        )}
      </div>
    </div>
  );
};
