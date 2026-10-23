import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { formatVNDate, toLocalISODate } from '../../utils/date';

interface DateNavigatorProps {
  currentDate: string; // YYYY-MM-DD
  onDateChange: (newDate: string) => void;
  className?: string;
}

export const DateNavigator: React.FC<DateNavigatorProps> = ({
  currentDate,
  onDateChange,
  className = '',
}) => {
  const todayStr = toLocalISODate(new Date());
  const isToday = currentDate === todayStr;

  const handlePrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    onDateChange(toLocalISODate(d));
  };

  const handleNextDay = () => {
    if (isToday) return;
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    const nextStr = toLocalISODate(d);
    // Không cho phép vượt quá ngày hôm nay
    if (nextStr <= todayStr) {
      onDateChange(nextStr);
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      <button
        type="button"
        onClick={handlePrevDay}
        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        aria-label="Xem ngày hôm trước"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-800">
        <Calendar className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
        <span>{isToday ? 'Hôm nay' : formatVNDate(currentDate)}</span>
      </div>

      <button
        type="button"
        onClick={handleNextDay}
        disabled={isToday}
        className={`p-1.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          isToday
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
        aria-label="Xem ngày tiếp theo"
      >
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
