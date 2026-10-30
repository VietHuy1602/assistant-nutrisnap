import React from 'react';
import { Info } from 'lucide-react';

interface EstimatedBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export const EstimatedBadge: React.FC<EstimatedBadgeProps> = ({
  className = '',
  size = 'sm',
  showIcon = true,
}) => {
  const sizeClasses =
    size === 'sm'
      ? 'text-sm leading-6 px-2 py-0.5 gap-1'
      : 'text-sm leading-6 px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200/80 ${sizeClasses} ${className}`}
      title="Giá trị ước tính dựa trên hình ảnh và CSDL tham chiếu"
      aria-label="Giá trị ước tính"
    >
      {showIcon && <Info className={size === 'sm' ? 'w-3 h-3 text-slate-400' : 'w-3.5 h-3.5 text-slate-400'} aria-hidden="true" />}
      <span>Ước tính</span>
    </span>
  );
};
