import React from 'react';
import type { DailyDashboardMeal } from '../../types/api';
import { MealCard } from './MealCard';

interface MealTimelineProps {
  meals: DailyDashboardMeal[];
  onDeleteMeal?: (mealId: number) => void;
  className?: string;
}

export const MealTimeline: React.FC<MealTimelineProps> = ({
  meals,
  onDeleteMeal,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Các bữa ăn trong ngày ({meals.length})
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onDelete={onDeleteMeal} />
        ))}
      </div>
    </div>
  );
};
