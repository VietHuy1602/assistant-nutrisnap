import React from 'react';
import { Info } from 'lucide-react';

interface DisclaimerBadgeProps {
  className?: string;
  text?: string;
}

export const DisclaimerBadge: React.FC<DisclaimerBadgeProps> = ({
  className = '',
  text = 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.',
}) => {
  return (
    <div
      className={`flex items-center gap-2 text-xs text-slate-500 bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-200/60 ${className}`}
    >
      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span>{text}</span>
    </div>
  );
};
