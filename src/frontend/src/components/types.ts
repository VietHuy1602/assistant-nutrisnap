export type GoalKind = 'lose_weight' | 'maintain' | 'gain_muscle';
export interface GoalInput { gender: string; age: number; height_cm: number; current_weight_kg: number; target_weight_kg: number; activity_level: string; goal_type: GoalKind; weekly_pace_kg: number; daily_budget_vnd: number }
export interface GoalResult { bmr_calories: number; tdee_calories: number; target_calories: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number }
export interface Food { id: number; food_name: string; calories_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number }
export interface Portion { key: string; food_id: number | null; food_name: string; grams: string; per100: [number, number, number, number] }
export interface Preview { status: 'pending_confirmation' | 'unrecognized'; detected_items: { food_id: number | null; food_name: string; estimated_gram: number; estimated_calories: number; protein_g: number; carbs_g: number; fat_g: number; confidence: number }[] }
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export interface NutritionAPI {
  saveGoal(input: GoalInput): Promise<GoalResult>;
  preview(image: string, meal: MealType): Promise<Preview>;
  search(query: string): Promise<Food[]>;
  saveMeal(meal: MealType, items: Portion[], notes: string): Promise<{success: boolean; total_calories: number}>;
}
