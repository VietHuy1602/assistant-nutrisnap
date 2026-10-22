import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Activity, Sparkles, ArrowRight, RotateCcw, Wallet, Info } from 'lucide-react';
import { GoalData } from '../../types/api';
import { DisclaimerBadge } from '../DisclaimerBadge';
import { DISCLAIMER_ESTIMATE } from '../../constants/copy';

interface GoalResultPanelProps {
  data: GoalData;
  onResetToEdit: () => void;
}

export const GoalResultPanel: React.FC<GoalResultPanelProps> = ({ data, onResetToEdit }) => {
  const navigate = useNavigate();

  const formatNumber = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '0';
    return Number(val).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  };

  const formatCurrency = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '0 đ';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  // Kiểm tra xem disclaimer từ server có nội dung cảnh báo bổ sung không
  const hasExtraDisclaimer =
    data.disclaimer &&
    data.disclaimer.trim().length > 0 &&
    data.disclaimer !== DISCLAIMER_ESTIMATE;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header chúc mừng */}
      <div className="text-center space-y-2">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-emerald-100 text-nutri-primary items-center justify-center mb-1 shadow-xs">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Kế hoạch Dinh dưỡng Cá nhân của bạn
        </h2>
        <p className="text-xs text-slate-500 max-w-lg mx-auto">
          Các chỉ số năng lượng và tỷ lệ dinh dưỡng đa lượng đã được hệ thống máy chủ tính toán
          dựa trên dữ liệu chuẩn hóa khoa học.
        </p>
      </div>

      {/* Thẻ TDEE nổi bật nhất */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40 border-2 border-emerald-300/80 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-nutri-primary text-[11px] font-bold uppercase tracking-wider mb-2">
              Chỉ số trọng tâm
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              TDEE (Tổng tiêu hao năng lượng mỗi ngày)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tổng năng lượng tiêu hao mỗi ngày · <span className="font-semibold text-emerald-700">Ước tính</span>
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-4xl sm:text-5xl font-black text-nutri-primary tracking-tight">
              {formatNumber(data.tdee_calories)}
            </span>
            <span className="text-sm font-bold text-slate-500 ml-1.5">kcal/ngày</span>
          </div>
        </div>
      </div>

      {/* Thẻ BMR & Hạn mức Calo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* BMR */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              BMR (Tỷ lệ trao đổi chất cơ bản)
            </span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-800">
              {formatNumber(data.bmr_calories)}
            </span>
            <span className="text-xs text-slate-500">kcal/ngày</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Năng lượng nghỉ ngơi tối thiểu duy trì sự sống · <span className="font-medium text-slate-600">Ước tính</span>
          </p>
        </div>

        {/* Hạn mức Calo / ngày */}
        <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/30 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-orange-700 uppercase tracking-wider">
              Hạn mức Calo khuyến nghị
            </span>
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-orange-600">
              {formatNumber(data.target_calories)}
            </span>
            <span className="text-xs text-orange-700 font-medium">kcal/ngày</span>
          </div>
          <p className="text-[11px] text-orange-600/80">
            Mục tiêu năng lượng nạp vào hằng ngày · <span className="font-semibold text-orange-700">Ước tính</span>
          </p>
        </div>
      </div>

      {/* Bộ 3 Macro: Protein, Carbs, Fat */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Phân bổ Dinh dưỡng đa lượng (Macronutrients) · Ước tính
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Protein */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-1.5">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block">
              Protein (Đạm)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-blue-600">
                {formatNumber(data.target_protein_g)}
              </span>
              <span className="text-xs text-blue-700 font-medium">gam/ngày</span>
            </div>
            <p className="text-[11px] text-blue-600/80">Xây dựng và bảo toàn khối cơ</p>
          </div>

          {/* Carbs */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-1.5">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
              Carbs (Tinh bột)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-amber-600">
                {formatNumber(data.target_carbs_g)}
              </span>
              <span className="text-xs text-amber-700 font-medium">gam/ngày</span>
            </div>
            <p className="text-[11px] text-amber-600/80">Cung cấp năng lượng cho hoạt động</p>
          </div>

          {/* Fat */}
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/30 space-y-1.5">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block">
              Fat (Chất béo tốt)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-purple-600">
                {formatNumber(data.target_fat_g)}
              </span>
              <span className="text-xs text-purple-700 font-medium">gam/ngày</span>
            </div>
            <p className="text-[11px] text-purple-600/80">Hấp thu vitamin & cân bằng nội tiết</p>
          </div>
        </div>
      </div>

      {/* Ngân sách */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-800">Ngân sách ăn uống dự kiến</p>
            <p className="text-[11px] text-slate-500">Mức chi tiêu tối ưu cho thực đơn</p>
          </div>
        </div>
        <span className="text-base font-bold text-slate-900">
          {formatCurrency(data.daily_budget_vnd)}/ngày
        </span>
      </div>

      {/* Cảnh báo bổ sung nếu có trong disclaimer trả về */}
      {hasExtraDisclaimer && (
        <div role="note" className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <p className="font-bold text-amber-950">Lưu ý từ hệ thống</p>
            <p>{data.disclaimer}</p>
          </div>
        </div>
      )}

      {/* Disclaimer chuẩn */}
      <DisclaimerBadge text={data.disclaimer || DISCLAIMER_ESTIMATE} />

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onResetToEdit}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-semibold transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Chỉnh lại mục tiêu
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          Vào trang Tổng quan
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
