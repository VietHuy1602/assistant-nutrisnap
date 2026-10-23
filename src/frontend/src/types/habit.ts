// Frontend presentation model only; not an API or achievement contract.
export interface CalendarMonth { year: number; month: number }
export type HabitDay =
  | { date: string; state: 'completed'; description: string }
  | { date: string; state: 'unconfirmed'; description?: string }
  | { date: string; state: 'unavailable'; reason: 'no-records' | 'insufficient-data' | 'not-provided' }
  | { date: string; state: 'loading' }
  | { date: string; state: 'error'; message: string };
export interface HabitCalendarProps {
  month: CalendarMonth;
  today: string;
  days: readonly HabitDay[];
  loadState: 'loading' | 'ready' | 'error';
  source: 'demo' | 'verified';
  selectedDate?: string;
  errorMessage?: string;
  onMonthChange: (month: CalendarMonth) => void;
  onDateSelect: (date: string) => void;
  onRetry?: () => void;
}
