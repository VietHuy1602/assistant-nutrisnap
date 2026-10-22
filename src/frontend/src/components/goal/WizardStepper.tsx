import React from 'react';
import { Check } from 'lucide-react';

interface WizardStepperProps {
  currentStep: number;
  totalSteps?: number;
  onStepClick?: (step: number) => void;
  maxReachableStep?: number;
}

const STEP_TITLES = [
  'Thông số cơ thể',
  'Mục tiêu',
  'Kiểm tra an toàn',
  'Xác nhận',
];

export const WizardStepper: React.FC<WizardStepperProps> = ({
  currentStep,
  totalSteps = 4,
  onStepClick,
  maxReachableStep = currentStep,
}) => {
  return (
    <div className="w-full">
      {/* Hiển thị trên màn hình nhỏ (Mobile) */}
      <div className="md:hidden flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Bước {currentStep}/{totalSteps}
        </span>
        <span className="text-sm font-bold text-slate-800">
          {STEP_TITLES[currentStep - 1]}
        </span>
      </div>

      {/* Hiển thị trên Desktop / Tablet */}
      <ol className="hidden md:flex items-center w-full justify-between relative">
        {/* Đường nối thanh tiến trình */}
        <div
          className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0"
          aria-hidden="true"
        >
          <div
            className="h-full bg-nutri-primary transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
          />
        </div>

        {STEP_TITLES.map((title, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isClickable = onStepClick && stepNum <= maxReachableStep;

          return (
            <li
              key={stepNum}
              className="flex flex-col items-center relative z-10"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(stepNum)}
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  isCompleted
                    ? 'bg-nutri-primary text-white shadow-sm'
                    : isCurrent
                      ? 'bg-white text-nutri-primary border-2 border-nutri-primary ring-4 ring-emerald-50 shadow-sm'
                      : 'bg-white text-slate-400 border border-slate-200'
                } ${isClickable ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : stepNum}
              </button>
              <span
                className={`mt-2 text-xs font-medium text-center ${
                  isCurrent ? 'text-slate-900 font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {title}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
