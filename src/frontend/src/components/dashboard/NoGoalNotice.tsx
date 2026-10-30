import React from 'react';
import { Target } from 'lucide-react';
import { formatKcal } from '../../utils/format';


export const NoGoalNotice: React.FC<{ target?: number }> = ({ target }) => {
  return (
    <div className="w-full p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">
          <Target className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h4 className="font-bold text-emerald-950">Giá trị tham khảo</h4>
          <p className="text-sm leading-6 text-emerald-800 mt-0.5">
            Các giá trị bên dưới chỉ để tham khảo{target !== undefined ? ` (${formatKcal(target)} kcal)` : ''}, chưa phải mục tiêu dinh dưỡng cá nhân của bạn. Bạn có thể tiếp tục ghi bữa ăn.
          </p>
        </div>
      </div>


    </div>
  );
};
