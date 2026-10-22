import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Save, AlertCircle, Info, Sparkles } from 'lucide-react';
import { goalSchema, GoalFormValues, STEP_FIELDS } from '../schemas/goalSchemas';
import { WizardStepper } from '../components/goal/WizardStepper';
import { StepBody } from '../components/goal/StepBody';
import { StepGoal } from '../components/goal/StepGoal';
import { StepSafety } from '../components/goal/StepSafety';
import { StepReview } from '../components/goal/StepReview';
import { GoalResultPanel } from '../components/goal/GoalResultPanel';
import { GoalResultSkeleton } from '../components/goal/GoalResultSkeleton';
import { goalApi } from '../api/goalApi';
import { useAuth } from '../context/AuthContext';
import { GoalData } from '../types/api';
import { isApiError } from '../utils/apiError';

export const GoalPlannerWizard: React.FC = () => {
  const { hasGoal, setHasGoal } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachableStep, setMaxReachableStep] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [resultData, setResultData] = useState<GoalData | null>(null);
  const [existingGoal, setExistingGoal] = useState<GoalData | null>(null);
  const stepHeaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stepHeaderRef.current?.focus();
  }, [currentStep]);

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    mode: 'onTouched',
    defaultValues: {
      gender: 'male',
      age: 25,
      height_cm: 170,
      current_weight_kg: 65,
      target_weight_kg: 62,
      activity_level: 'moderate',
      goal_type: 'lose_weight',
      weekly_pace_kg: 0.5,
      daily_budget_vnd: 60000,
    },
  });

  const {
    handleSubmit,
    trigger,
    getValues,
    setValue,
    formState: { isSubmitting },
  } = form;

  // P1: Tải mục tiêu hiện tại nếu có
  useEffect(() => {
    let ignore = false;
    if (hasGoal) {
      goalApi
        .getGoal()
        .then((goal) => {
          if (!ignore) {
            setExistingGoal(goal);
          }
        })
        .catch(() => {
          // Bỏ qua êm lặng nếu API lỗi, không chặn người dùng tạo mục tiêu mới
        });
    }
    return () => {
      ignore = true;
    };
  }, [hasGoal]);

  const handleNext = async () => {
    setFormError(null);
    const fieldsToValidate = STEP_FIELDS[currentStep];
    const isValid = await trigger(fieldsToValidate);
    if (!isValid) return;

    if (currentStep === 1) {
      const curWeight = getValues('current_weight_kg');
      if (getValues('goal_type') === 'maintain') {
        setValue('target_weight_kg', curWeight);
      }
    }

    setCurrentStep((prev) => {
      const next = prev + 1;
      setMaxReachableStep((m) => Math.max(m, next));
      return next;
    });
  };

  const handleBack = () => {
    setFormError(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleStepJump = (step: number) => {
    if (step <= maxReachableStep) {
      setFormError(null);
      setCurrentStep(step);
    }
  };

  const onSubmit = async (values: GoalFormValues) => {
    setFormError(null);
    try {
      // Gửi đúng 9 trường của GoalCreateRequest, tuyệt đối KHÔNG có user_id (Zero-Trust)
      const savedGoal = await goalApi.saveGoal({
        gender: values.gender,
        age: values.age,
        height_cm: values.height_cm,
        current_weight_kg: values.current_weight_kg,
        target_weight_kg: values.target_weight_kg,
        activity_level: values.activity_level,
        goal_type: values.goal_type,
        weekly_pace_kg: values.weekly_pace_kg,
        daily_budget_vnd: values.daily_budget_vnd,
      });

      setHasGoal(true);
      setResultData(savedGoal);
    } catch (err: unknown) {
      if (isApiError(err)) {
        setFormError(err.message || 'Không thể lưu mục tiêu. Vui lòng kiểm tra lại dữ liệu.');
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Không thể lưu mục tiêu. Vui lòng thử lại sau.');
      }
    }
  };

  // Nếu đã lưu thành công -> hiển thị bảng kết quả dinh dưỡng
  if (resultData) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        <GoalResultPanel
          data={resultData}
          onResetToEdit={() => {
            setResultData(null);
            setCurrentStep(1);
          }}
        />
      </div>
    );
  }

  // Nếu đang gửi dữ liệu lưu ở Bước 4 -> hiển thị Skeleton placeholder ngay lập tức để không nhảy layout (SAC-11)
  if (isSubmitting && currentStep === 4) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        <GoalResultSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Header Wizard */}
      <div ref={stepHeaderRef} tabIndex={-1} className="space-y-1 outline-none">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-nutri-primary text-xs font-bold mb-1">
          <Sparkles className="w-3.5 h-3.5" />
          Thiết lập lộ trình thông minh
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Kế hoạch Mục tiêu Dinh dưỡng
        </h1>
        <p className="text-xs text-slate-500">
          Hệ thống sẽ tính toán BMR, TDEE và định lượng Đạm, Tinh bột, Chất béo tối ưu mỗi ngày.
        </p>
      </div>

      {/* Banner nếu đã có mục tiêu trước đó */}
      {existingGoal && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-950">Mục tiêu hiện tại</p>
            <p>
              Hạn mức hiện tại:{' '}
              <strong>{existingGoal.target_calories.toLocaleString('vi-VN')} kcal/ngày</strong>.
              Lưu mới sẽ thay thế và cập nhật lại toàn bộ lộ trình này.
            </p>
          </div>
        </div>
      )}

      {/* Stepper điều hướng 4 bước */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <WizardStepper
          currentStep={currentStep}
          maxReachableStep={maxReachableStep}
          onStepClick={handleStepJump}
        />
      </div>

      {/* Form Card chính */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        {formError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div
            key={currentStep}
            className="min-h-[380px] transition-opacity duration-200 ease-out motion-reduce:transition-none"
          >
            {currentStep === 1 && <StepBody form={form} />}
            {currentStep === 2 && <StepGoal form={form} />}
            {currentStep === 3 && <StepSafety form={form} />}
            {currentStep === 4 && <StepReview form={form} onEditStep={handleStepJump} />}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-8">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 1 || isSubmitting}
              className={`px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold transition-all flex items-center gap-2 ${
                currentStep === 1
                  ? 'opacity-0 pointer-events-none'
                  : 'hover:bg-slate-50 active:scale-98'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-sm active:scale-98"
              >
                Tiếp tục
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed active:scale-98"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Đang tính toán & lưu...' : 'Lưu mục tiêu dinh dưỡng'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
