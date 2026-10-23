// Presentation boundary only. This is not a backend monthly-report contract.
export interface MonthlyReportDay {
  date: string;
  state: 'available' | 'unavailable' | 'error';
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface MonthlyReportData {
  month: string; // YYYY-MM; all dates are civil dates in Asia/Ho_Chi_Minh.
  source: 'demo' | 'verified';
  days: readonly MonthlyReportDay[];
  // Supplied by the provider; the UI never derives monthly nutrition statistics.
  summary?: {
    totalCalories?: number | null;
    averageDailyCalories?: number | null;
  };
}

export interface MonthlyReportViewProps {
  month: string;
  today: string; // Caller supplies the business date in Asia/Ho_Chi_Minh.
  loadState: 'loading' | 'error' | 'empty' | 'partial' | 'ready';
  data?: MonthlyReportData;
  errorMessage?: string;
  onMonthChange: (month: string) => void;
  onRetry?: () => void;
}
