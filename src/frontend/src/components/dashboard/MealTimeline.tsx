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
    <section aria-label="Nhật ký bữa ăn" className={`min-w-0 flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg leading-7 font-bold text-nutri-ink">
          Các bữa ăn trong ngày ({meals.length})
        </h3>
      </div>

      <ol className="diary-list m-0 flex list-none flex-col gap-4 border-l border-nutri-border pl-3 sm:pl-5">
        {meals.map((meal) => (
          <li key={meal.id} className="relative min-w-0">
            <span aria-hidden="true" className="diary-marker absolute -left-[17px] top-6 h-2 w-2 rounded-full bg-nutri-primary sm:-left-[25px]" />
            <MealCard meal={meal} onDelete={onDeleteMeal} />
          </li>
        ))}
      </ol>
    </section>
  );
};
