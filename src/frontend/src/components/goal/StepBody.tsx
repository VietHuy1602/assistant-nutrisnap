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
    <div className="space-y-8 text-nutri-ink">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-nutri-ink">Thông số cơ thể cơ bản</h2>
        <p className="mt-2 text-sm leading-6 text-nutri-muted">
          Nhập thông tin hiện tại để ước tính nhu cầu năng lượng của bạn.
        </p>
      </div>

      {/* Giới tính */}
      <fieldset className="min-w-0 space-y-3" aria-describedby={errors.gender ? 'gender-error' : undefined}>
        <legend className="text-sm font-semibold text-nutri-ink">
          Giới tính sinh học <span className="text-nutri-error" aria-hidden="true">*</span>
        </legend>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
          {genders.map((item) => {
            const isSelected = currentGender === item.value;
            return (
              <label
                key={item.value}
                className="nutri-choice"
                data-selected={isSelected}
              >
                <input
                  type="radio"
                  name="gender"
                  value={item.value}
                  checked={isSelected}
                  onChange={() => setValue('gender', item.value, { shouldValidate: true })}
                  aria-invalid={!!errors.gender}
                  aria-describedby={errors.gender ? 'gender-error' : undefined}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-nutri-primary"
                />
                <span className="text-sm font-semibold">{item.label}</span>
              </label>
            );
          })}
        </div>
        {errors.gender?.message && (
          <p id="gender-error" role="alert" className="text-sm text-nutri-error">
            {errors.gender.message}
          </p>
        )}
      </fieldset>

      {/* Tuổi, Chiều cao, Cân nặng */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 [&>*:last-child]:sm:col-span-2">
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
            aria-describedby={errors.age ? 'age-error' : undefined}
            {...register('age', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className="nutri-input"
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
            aria-describedby={errors.height_cm ? 'height_cm-error' : undefined}
            {...register('height_cm', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className="nutri-input"
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
            aria-describedby={errors.current_weight_kg ? 'current_weight_kg-error' : undefined}
            {...register('current_weight_kg', {
              setValueAs: (v) => (v === '' || isNaN(Number(v)) ? undefined : Number(v)),
            })}
            className="nutri-input"
          />
        </FormField>
      </div>

      {/* Mức độ vận động */}
      <fieldset className="min-w-0 space-y-3" aria-describedby={errors.activity_level ? 'activity_level-error' : undefined}>
        <legend className="text-sm font-semibold text-nutri-ink">
          Mức độ vận động hàng ngày <span className="text-nutri-error" aria-hidden="true">*</span>
        </legend>
        <div className="space-y-2.5">
          {activityOptions.map((opt) => {
            const isSelected = currentActivity === opt.value;
            return (
              <label
                key={opt.value}
                className="nutri-choice"
                data-selected={isSelected}
              >
                <input
                  type="radio"
                  name="activity_level"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => setValue('activity_level', opt.value, { shouldValidate: true })}
                  aria-labelledby={`activity-${opt.value}-label`}
                  aria-describedby={`activity-${opt.value}-description${errors.activity_level ? ' activity_level-error' : ''}`}
                  aria-invalid={!!errors.activity_level}
                  className="mt-1 h-4 w-4 shrink-0 accent-nutri-primary"
                />
                <span className="min-w-0 flex-1">
                  <span id={`activity-${opt.value}-label`} className="block text-sm font-semibold">
                    {opt.label}
                  </span>
                  <span id={`activity-${opt.value}-description`} className="mt-1 block text-sm leading-5 text-nutri-muted">{opt.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.activity_level?.message && (
          <p id="activity_level-error" role="alert" className="text-sm text-nutri-error">
            {errors.activity_level.message}
          </p>
        )}
      </fieldset>
    </div>
  );
};
