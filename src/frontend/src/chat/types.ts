/**
 * src/frontend/src/chat/types.ts
 * Kiểu dữ liệu trung tâm cho hệ thống Chat và Thẻ hành động tương tác (W4).
 */

export type ChatMessageSender = 'user' | 'assistant' | 'system';
export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';
export type SystemTone = 'info' | 'success' | 'error';

export interface ChatMessage {
  id: string;
  clientId: string;
  sender: ChatMessageSender;
  text: string;
  cardId?: string;
  status?: MessageDeliveryStatus;
  systemTone?: SystemTone;
  createdAt: string;
  isRetryable?: boolean;
  disclaimer?: string;
  error?: string;
}

export type CardPhase =
  | 'pending'
  | 'editing'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'uncertain'
  | 'expired'
  | 'readonly';

export interface ActionCardItemModel {
  food_id: number;
  food_name: string;
  estimated_gram: number;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface ActionCardTotalsModel {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface ActionCardModel {
  id: string;
  kind: 'log_meal';
  state: CardPhase;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  mealTypeVi?: string;
  items: ActionCardItemModel[];
  totals?: ActionCardTotalsModel;
  actionId?: string | number;
  confirmation_id?: string;
  status?: string;
  expiresAt?: string;
  savedCalories?: number;
  savedMealId?: number;
  errorMessage?: string;
}

export interface AssistantTurn {
  sessionId: string | number | null;
  text: string;
  card: ActionCardModel | null;
  warnings: string[];
}
