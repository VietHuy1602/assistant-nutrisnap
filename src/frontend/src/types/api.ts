/**
 * src/frontend/src/types/api.ts
 * Type definitions mirroring the Backend API Contract (src/backend/schemas/api_contract.py).
 */

export interface BaseResponse {
  success: boolean;
  message: string;
  disclaimer: string;
}

export interface UserPublic {
  id: number;
  username: string;
  email: string;
  created_at?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  has_goal: boolean;
  user: UserPublic;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username_or_email: string;
  password: string;
}

export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'lose_weight' | 'maintain' | 'gain_muscle';

export interface GoalCreateRequest {
  gender: Gender;
  age: number;
  height_cm: number;
  current_weight_kg: number;
  target_weight_kg: number;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  weekly_pace_kg: number;
  daily_budget_vnd: number;
}

export interface GoalData {
  id: number;
  user_id: number;
  target_weight: number;
  bmr_calories: number;
  tdee_calories: number;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  daily_budget_vnd: number;
  disclaimer: string;
}

export interface MacroDetail {
  consumed: number;
  target: number;
  unit: string;
  progress_percent: number;
}

export interface DailyDashboardMealItem {
  id?: number;
  food_id?: number;
  food_name: string;
  estimated_gram: number;
  calories?: number;
  estimated_calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  estimated_price_vnd?: number;
}

export interface DailyDashboardMeal {
  id: number;
  meal_type: string;
  image_path?: string | null;
  logged_at: string;
  total_calories: number;
  total_protein_g?: number;
  total_carbs_g?: number;
  total_fat_g?: number;
  items: DailyDashboardMealItem[];
}

export interface DailyDashboardData {
  date: string;
  target_calories: number;
  consumed_calories: number;
  remaining_calories: number;
  calories_progress_percent: number;
  macros: {
    protein: MacroDetail;
    carbs: MacroDetail;
    fat: MacroDetail;
  };
  meals?: DailyDashboardMeal[];
  meals_summary: DailyDashboardMeal[];
  disclaimer: string;
}

export interface ActionCardItem {
  food_id: number;
  food_name: string;
  estimated_gram: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface ActionCard {
  type: 'confirm_log_meal' | 'confirm_update_goal' | 'recommendation_preview';
  status: 'pending_user_action' | 'confirmed' | 'cancelled';
  data: {
    meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    items: ActionCardItem[];
    total_calories: number;
    confirmation_id?: string;
  };
  confirmation_id?: string;
}

export interface ChatMessageResponse {
  session_id: number;
  reply_text: string;
  action_card?: ActionCard;
  disclaimer: string;
}

// ==============================================================================
// W3 PoC: AI VISION RECOGNITION & MEAL LOGGING CONTRACTS
// ==============================================================================

export interface RecognizedFoodItem {
  food_id: number | null;
  food_name: string;
  matched_name?: string | null;
  match_score?: number;
  is_matched: boolean;
  estimated_gram: number;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
}

export interface RecognizeFoodResponse {
  success: boolean;
  status: 'pending_confirmation' | 'unrecognized';
  meal_type: string;
  detected_items: RecognizedFoodItem[];
  total_estimated_calories: number;
  is_fallback?: boolean;
  message?: string;
  disclaimer?: string;
}

export interface MealItemInput {
  food_id?: number | null;
  food_name?: string | null;
  estimated_gram: number;
  eaten_ratio?: number;
}

export interface CalculatedMealItem {
  food_id: number;
  food_name: string;
  estimated_gram: number;
  eaten_ratio: number;
  effective_gram: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  estimated_price_vnd: number;
}

export interface NutritionCalculationResult {
  items: CalculatedMealItem[];
  total_weight_g: number;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_estimated_price_vnd: number;
  disclaimer: string;
}

export interface MealLogRequest {
  meal_type: string;
  items: MealItemInput[];
  image_path?: string | null;
  logged_at?: string | null;
  is_confirmed: boolean;
  notes?: string | null;
}

export interface MealLogResponse {
  status: 'pending_confirmation' | 'logged';
  meal_id?: number | null;
  meal_type: string;
  logged_at: string;
  nutrition: NutritionCalculationResult;
  disclaimer: string;
  success: boolean;
  total_calories?: number | null;
}

export interface FoodReferenceItem {
  id: number;
  food_name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  avg_price_vnd: number;
}

export interface FoodSearchResponse {
  total: number;
  items: FoodReferenceItem[];
}
