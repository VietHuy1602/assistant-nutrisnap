/**
 * src/frontend/src/components/meal/mealDraftReducer.ts
 * Pure reducer managing meal draft items, gram editing, food swapping, and 5-second undo removal.
 * Tuân thủ ADR-W3-04 (Explicit state machine / pure reducer for deterministic testing).
 */

import type { FoodReferenceItem, RecognizedFoodItem } from '../../types/api';

export interface DraftMealItem {
  key: string; // Stable unique key
  food_id: number | null;
  food_name: string;
  estimated_gram: number;
  confidence?: number;
  source: 'ai' | 'manual' | 'voice';
  matched_name?: string | null;
  nutrition_source?: 'database' | 'usda' | 'ai_estimate' | null;
}

export interface DeletedItemInfo {
  item: DraftMealItem;
  index: number;
}

export interface MealDraftState {
  mealType: string;
  items: DraftMealItem[];
  deletedItem: DeletedItemInfo | null;
  voiceNote?: string;
  previousVoiceSnapshot?: {
    items: DraftMealItem[];
    voiceNote?: string;
  } | null;
}

export type MealDraftAction =
  | { type: 'SET_MEAL_TYPE'; mealType: string }
  | { type: 'LOAD_RECOGNIZED'; recognizedItems: RecognizedFoodItem[]; mealType?: string }
  | { type: 'SET_GRAM'; key: string; gram: number }
  | { type: 'SWAP_FOOD'; key: string; food: FoodReferenceItem }
  | { type: 'REMOVE_ITEM'; key: string }
  | { type: 'UNDO_REMOVE' }
  | { type: 'CLEAR_UNDO' }
  | { type: 'ADD_ITEM'; food?: FoodReferenceItem }
  | {
      type: 'APPLY_VOICE_RESULT';
      note: string;
      adjustedItems?: Array<{
        food_id?: number | null;
        food_name: string;
        estimated_gram: number;
      }>;
    }
  | { type: 'UNDO_VOICE' }
  | { type: 'RESET' };

let keyCounter = 0;
export function generateDraftKey(prefix = 'item'): string {
  keyCounter++;
  return `${prefix}-${Date.now()}-${keyCounter}`;
}

export const initialDraftState: MealDraftState = {
  mealType: 'lunch',
  items: [],
  deletedItem: null,
};

export function mealDraftReducer(state: MealDraftState, action: MealDraftAction): MealDraftState {
  switch (action.type) {
    case 'SET_MEAL_TYPE':
      return { ...state, mealType: action.mealType };

    case 'LOAD_RECOGNIZED': {
      const mappedItems: DraftMealItem[] = action.recognizedItems.map((rec, index) => ({
        key: generateDraftKey(`ai-${index}`),
        food_id: rec.food_id,
        food_name: rec.food_name,
        estimated_gram: Math.max(1, Math.min(3000, Math.round(rec.estimated_gram))),
        confidence: rec.confidence,
        source: 'ai',
        matched_name: rec.matched_name,
        nutrition_source: rec.nutrition_source,
      }));

      return {
        ...state,
        mealType: action.mealType || state.mealType,
        items: mappedItems,
        deletedItem: null,
      };
    }

    case 'SET_GRAM': {
      const validGram = Number.isFinite(action.gram)
        ? Math.max(0, Math.min(3000, action.gram))
        : 0;

      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key ? { ...item, estimated_gram: validGram } : item,
        ),
      };
    }

    case 'SWAP_FOOD': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key
            ? {
                ...item,
                food_id: action.food.id,
                food_name: action.food.food_name,
                matched_name: action.food.food_name,
                confidence: 1.0,
                source: 'manual',
                nutrition_source: null,
              }
            : item,
        ),
      };
    }

    case 'REMOVE_ITEM': {
      const index = state.items.findIndex((it) => it.key === action.key);
      if (index === -1) return state;

      const itemToRemove = state.items[index];
      const nextItems = state.items.filter((it) => it.key !== action.key);

      return {
        ...state,
        items: nextItems,
        deletedItem: { item: itemToRemove, index },
      };
    }

    case 'UNDO_REMOVE': {
      if (!state.deletedItem) return state;

      const { item, index } = state.deletedItem;
      const nextItems = [...state.items];
      const insertAt = Math.min(index, nextItems.length);
      nextItems.splice(insertAt, 0, item);

      return {
        ...state,
        items: nextItems,
        deletedItem: null,
      };
    }

    case 'CLEAR_UNDO':
      return { ...state, deletedItem: null };

    case 'ADD_ITEM': {
      const newItem: DraftMealItem = action.food
        ? {
            key: generateDraftKey('manual'),
            food_id: action.food.id,
            food_name: action.food.food_name,
            estimated_gram: 100,
            confidence: 1.0,
            source: 'manual',
            matched_name: action.food.food_name,
          }
        : {
            key: generateDraftKey('manual-empty'),
            food_id: null,
            food_name: 'Món ăn mới',
            estimated_gram: 100,
            confidence: 1.0,
            source: 'manual',
          };

      return {
        ...state,
        items: [...state.items, newItem],
      };
    }

    case 'APPLY_VOICE_RESULT': {
      const snapshot = {
        items: [...state.items],
        voiceNote: state.voiceNote,
      };

      const newItems =
        action.adjustedItems && action.adjustedItems.length > 0
          ? action.adjustedItems.map((adj, idx) => ({
              key: generateDraftKey(`voice-${idx}`),
              food_id: adj.food_id ?? null,
              food_name: adj.food_name,
              estimated_gram: Math.max(1, Math.min(3000, Math.round(adj.estimated_gram))),
              confidence: 1.0,
              source: 'voice' as const,
              matched_name: adj.food_name,
            }))
          : state.items;

      return {
        ...state,
        items: newItems,
        voiceNote: action.note,
        previousVoiceSnapshot: snapshot,
      };
    }

    case 'UNDO_VOICE': {
      if (!state.previousVoiceSnapshot) return state;
      return {
        ...state,
        items: state.previousVoiceSnapshot.items,
        voiceNote: state.previousVoiceSnapshot.voiceNote,
        previousVoiceSnapshot: null,
      };
    }

    case 'RESET':
      return initialDraftState;

    default:
      return state;
  }
}

/**
 * Kiểm tra điều kiện bản nháp có thể lưu hoặc preview hợp lệ:
 * - Có ít nhất 1 món
 * - Mọi món có food_id khác null
 * - Mọi món có estimated_gram > 0 và <= 3000
 */
export function isDraftSavable(items: DraftMealItem[]): boolean {
  if (items.length === 0) return false;
  return items.every(
    (item) =>
      item.food_id !== null &&
      item.food_id !== undefined &&
      item.estimated_gram > 0 &&
      item.estimated_gram <= 3000,
  );
}

/**
 * Lấy danh sách các lý do chưa thể lưu nếu có
 */
export function getDraftUnsavableReasons(items: DraftMealItem[]): string[] {
  const reasons: string[] = [];
  if (items.length === 0) {
    reasons.push('Chưa có món ăn nào trong bữa.');
    return reasons;
  }

  const unlinkedCount = items.filter((it) => it.food_id === null || it.food_id === undefined).length;
  if (unlinkedCount > 0) {
    reasons.push(`Có ${unlinkedCount} món chưa khớp CSDL (vui lòng chọn món).`);
  }

  const invalidGramCount = items.filter(
    (it) => !Number.isFinite(it.estimated_gram) || it.estimated_gram <= 0 || it.estimated_gram > 3000,
  ).length;
  if (invalidGramCount > 0) {
    reasons.push(`Có ${invalidGramCount} món có khối lượng không hợp lệ (1g - 3000g).`);
  }

  return reasons;
}
