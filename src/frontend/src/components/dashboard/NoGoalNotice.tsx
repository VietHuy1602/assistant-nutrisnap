import React from 'react';
import { Target, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const NoGoalNotice: React.FC = () => {
  return (
    <div className="w-full p-4.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">
          <Target className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h4 className="font-bold text-emerald-950">Chưa thiết lập mục tiêu cá nhân</h4>
          <p className="text-xs text-emerald-800 mt-0.5">
            Hệ thống đang hiển thị hạn mức tham khảo chuẩn 2.000 kcal. Thiết lập mục tiêu để tính TDEE/BMR chuẩn theo cơ địa của bạn.
          </p>
        </div>
      </div>

      <Link
        to="/goal-setup"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <span>Thiết lập mục tiêu</span>
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
};
