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
  meals_summary: Array<{
    id: number;
    meal_type: string;
    image_path?: string;
    logged_at: string;
    total_calories: number;
    items: Array<{
      id: number;
      food_id: number;
      food_name: string;
      estimated_gram: number;
      estimated_calories: number;
    }>;
  }>;
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
  };
}

export interface ChatMessageResponse {
  session_id: number;
  reply_text: string;
  action_card?: ActionCard;
  disclaimer: string;
}
