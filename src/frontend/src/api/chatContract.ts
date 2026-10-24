/**
 * src/frontend/src/api/chatContract.ts
 * Bộ chuẩn hóa phản hồi từ Assistant API theo nguyên tắc Tolerant Reader + Zod.
 * KHÔNG BAO GIỜ ném lỗi ra ngoài UI.
 */
import { z } from 'zod';
import { MEAL_ITEM_LIMITS } from '../constants/mealLimits';
import type { ActionCardModel, AssistantTurn } from '../chat/types';

export const ALIASES = {
  text: ['reply_text', 'reply', 'message', 'content', 'response', 'answer', 'text'],
  sessionId: ['session_id', 'sessionId', 'chat_session_id'],
  card: ['action_card', 'pending_confirmation_data', 'pending_confirmation', 'action', 'card'],
  items: ['items', 'meal_items', 'foods'],
  mealType: ['meal_type', 'mealType', 'type'],
  foodName: ['food_name', 'name', 'dish_name', 'title'],
  calories: ['calories', 'estimated_calories', 'total_calories'],
  gram: ['estimated_gram', 'estimated_grams', 'grams', 'gram', 'weight_g'],
} as const;

export const MEAL_TYPE_MAP: Record<string, 'breakfast' | 'lunch' | 'dinner' | 'snack'> = {
  'sáng': 'breakfast',
  'bữa sáng': 'breakfast',
  'breakfast': 'breakfast',
  'trưa': 'lunch',
  'bữa trưa': 'lunch',
  'lunch': 'lunch',
  'tối': 'dinner',
  'bữa tối': 'dinner',
  'dinner': 'dinner',
  'phụ': 'snack',
  'bữa phụ': 'snack',
  'snack': 'snack',
};

export const MEAL_TYPE_VI_LABELS: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
  snack: 'Bữa phụ',
};

const firstDefined = (o: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const k of keys) {
    const val = o[k];
    if (val !== undefined && val !== null) return val;
  }
  return undefined;
};

export const cardItemSchema = z.object({
  food_id: z.number().int().positive(),
  food_name: z.string().min(1).max(MEAL_ITEM_LIMITS.maxNameLength),
  estimated_gram: z.number().positive().max(MEAL_ITEM_LIMITS.maxGram),
  calories: z.number().nonnegative().optional(),
  protein_g: z.number().nonnegative().optional(),
  carbs_g: z.number().nonnegative().optional(),
  fat_g: z.number().nonnegative().optional(),
});

function normalizeCardObject(raw: Record<string, unknown>): {
  normalizedItems: unknown[];
  normalizedMealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  normalizedTotals?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  actionId?: string | number;
  status?: string;
  expiresAt?: string;
} {
  const data = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data))
    ? (raw.data as Record<string, unknown>)
    : raw;

  const rawMealType = String(firstDefined(data, ALIASES.mealType) || firstDefined(raw, ALIASES.mealType) || 'lunch').trim().toLowerCase();
  const mealType = MEAL_TYPE_MAP[rawMealType] || 'lunch';

  const rawItemsList = (firstDefined(data, ALIASES.items) || firstDefined(raw, ALIASES.items));
  const rawItems = Array.isArray(rawItemsList) ? rawItemsList : [];

  const normalizedItems = rawItems.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const itemObj = item as Record<string, unknown>;
    const foodIdRaw = itemObj.food_id ?? itemObj.foodId ?? itemObj.id;
    const foodId = typeof foodIdRaw === 'number' ? foodIdRaw : Number(foodIdRaw);
    const foodName = String(firstDefined(itemObj, ALIASES.foodName) || '').trim();
    const gramsRaw = firstDefined(itemObj, ALIASES.gram);
    const grams = typeof gramsRaw === 'number' ? gramsRaw : Number(gramsRaw);
    const caloriesRaw = firstDefined(itemObj, ALIASES.calories);
    const calories = caloriesRaw !== undefined ? Number(caloriesRaw) : undefined;
    const protein = itemObj.protein_g !== undefined ? Number(itemObj.protein_g) : (itemObj.protein !== undefined ? Number(itemObj.protein) : undefined);
    const carbs = itemObj.carbs_g !== undefined ? Number(itemObj.carbs_g) : (itemObj.carbs !== undefined ? Number(itemObj.carbs) : undefined);
    const fat = itemObj.fat_g !== undefined ? Number(itemObj.fat_g) : (itemObj.fat !== undefined ? Number(itemObj.fat) : undefined);

    return {
      food_id: foodId,
      food_name: foodName,
      estimated_gram: grams,
      calories: calories !== undefined && !isNaN(calories) ? calories : undefined,
      protein_g: protein !== undefined && !isNaN(protein) ? protein : undefined,
      carbs_g: carbs !== undefined && !isNaN(carbs) ? carbs : undefined,
      fat_g: fat !== undefined && !isNaN(fat) ? fat : undefined,
    };
  });

  const totalCalRaw = firstDefined(data, ['total_calories', 'calories', 'totalCalories']) ?? firstDefined(raw, ['total_calories', 'calories']);
  const totalCal = totalCalRaw !== undefined ? Number(totalCalRaw) : undefined;

  const actionIdRaw = raw.action_id ?? (raw.data as Record<string, unknown> | undefined)?.action_id;
  const actionId = (typeof actionIdRaw === 'string' || typeof actionIdRaw === 'number') ? actionIdRaw : undefined;
  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at : undefined;

  return {
    normalizedItems,
    normalizedMealType: mealType,
    normalizedTotals: totalCal !== undefined && !isNaN(totalCal) ? { calories: totalCal } : undefined,
    actionId,
    status,
    expiresAt,
  };
}

let cardSeq = 0;
function nextCardId(): string {
  return `card-${Date.now().toString(36)}-${(++cardSeq).toString(36)}`;
}

export function normalizeAssistantResponse(raw: unknown): AssistantTurn {
  const warnings: string[] = [];
  const root = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};

  let rawText = firstDefined(root, ALIASES.text);
  if (!rawText && typeof raw === 'string' && raw.trim()) {
    rawText = raw.trim();
  }
  const text = typeof rawText === 'string' && rawText.trim() ? rawText : '';

  const sidRaw = firstDefined(root, ALIASES.sessionId);
  const sessionId = (typeof sidRaw === 'string' || typeof sidRaw === 'number') ? sidRaw : null;

  const rawCard = firstDefined(root, ALIASES.card);
  let card: ActionCardModel | null = null;

  if (rawCard && typeof rawCard === 'object' && !Array.isArray(rawCard)) {
    try {
      const cardObj = rawCard as Record<string, unknown>;
      const normalized = normalizeCardObject(cardObj);

      if (!Array.isArray(normalized.normalizedItems) || normalized.normalizedItems.length === 0) {
        warnings.push('card.items:empty');
      } else if (normalized.normalizedItems.length > MEAL_ITEM_LIMITS.maxItems) {
        warnings.push('card.items:too_many');
      } else {
        const validatedItems: z.infer<typeof cardItemSchema>[] = [];
        let itemsValid = true;

        for (let idx = 0; idx < normalized.normalizedItems.length; idx++) {
          const parseResult = cardItemSchema.safeParse(normalized.normalizedItems[idx]);
          if (parseResult.success) {
            validatedItems.push(parseResult.data);
          } else {
            itemsValid = false;
            warnings.push(...parseResult.error.issues.map((i) => `card.items[${idx}].${i.path.join('.')}:${i.code}`));
          }
        }

        if (itemsValid && validatedItems.length > 0) {
          card = {
            id: nextCardId(),
            kind: 'log_meal',
            state: 'pending',
            mealType: normalized.normalizedMealType,
            mealTypeVi: MEAL_TYPE_VI_LABELS[normalized.normalizedMealType],
            items: validatedItems,
            totals: normalized.normalizedTotals,
            actionId: normalized.actionId,
            status: normalized.status,
            expiresAt: normalized.expiresAt,
          };
        }
      }
    } catch {
      warnings.push('card:parse_exception');
    }
  }

  return {
    sessionId,
    text: text || (card ? '' : 'Trợ lý trả về dữ liệu không đọc được. Vui lòng thử lại.'),
    card,
    warnings,
  };
}
