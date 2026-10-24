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

const numeric = (value: unknown): number =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : NaN;

export const cardItemSchema = z.object({
  food_id: z.number().finite().int().positive(),
  food_name: z.string().min(1).max(MEAL_ITEM_LIMITS.maxNameLength),
  estimated_gram: z.number().min(MEAL_ITEM_LIMITS.minGram).max(MEAL_ITEM_LIMITS.maxGram),
  calories: z.number().finite().nonnegative().optional(),
  protein_g: z.number().nonnegative().optional(),
  carbs_g: z.number().nonnegative().optional(),
  fat_g: z.number().nonnegative().optional(),
});

function normalizeCardObject(raw: Record<string, unknown>): {
  normalizedItems: unknown[];
  normalizedMealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  validMealType: boolean;
  normalizedTotals?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  actionId?: string | number;
  confirmation_id?: string;
  status?: string;
  expiresAt?: string;
} {
  const data = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data))
    ? (raw.data as Record<string, unknown>)
    : raw;

  const mealTypeValue = firstDefined(data, ALIASES.mealType) ?? firstDefined(raw, ALIASES.mealType);
  const rawMealType = typeof mealTypeValue === 'string' ? mealTypeValue.trim().toLowerCase() : '';
  const mealType = MEAL_TYPE_MAP[rawMealType] || 'lunch';

  const rawItemsList = (firstDefined(data, ALIASES.items) || firstDefined(raw, ALIASES.items));
  const rawItems = Array.isArray(rawItemsList) ? rawItemsList : [];

  const normalizedItems = rawItems.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const itemObj = item as Record<string, unknown>;
    const foodIdRaw = itemObj.food_id ?? itemObj.foodId ?? itemObj.id;
    const foodId = numeric(foodIdRaw);
    const nameValue = firstDefined(itemObj, ALIASES.foodName);
    const foodName = typeof nameValue === 'string' ? nameValue.trim() : '';
    const gramsRaw = firstDefined(itemObj, ALIASES.gram);
    const grams = numeric(gramsRaw);
    const caloriesRaw = firstDefined(itemObj, ALIASES.calories);
    const calories = caloriesRaw !== undefined ? numeric(caloriesRaw) : undefined;
    const protein = numeric(itemObj.protein_g ?? itemObj.protein);
    const carbs = numeric(itemObj.carbs_g ?? itemObj.carbs);
    const fat = numeric(itemObj.fat_g ?? itemObj.fat);

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
  const totalCal = totalCalRaw !== undefined ? numeric(totalCalRaw) : undefined;

  const actionIdRaw = raw.action_id ?? (raw.data as Record<string, unknown> | undefined)?.action_id;
  const actionId = (typeof actionIdRaw === 'string' || typeof actionIdRaw === 'number') ? actionIdRaw : undefined;
  const confirmationIdRaw = firstDefined(data, ['confirmation_id', 'confirmationId']) ?? firstDefined(raw, ['confirmation_id', 'confirmationId']);
  const confirmation_id = typeof confirmationIdRaw === 'string' && confirmationIdRaw.trim() ? confirmationIdRaw.trim() : undefined;
  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at : undefined;

  return {
    normalizedItems,
    normalizedMealType: mealType,
    validMealType: typeof mealTypeValue === 'string' && Object.prototype.hasOwnProperty.call(MEAL_TYPE_MAP, rawMealType),
    normalizedTotals: totalCal !== undefined && !isNaN(totalCal) ? { calories: totalCal } : undefined,
    actionId,
    confirmation_id,
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
      if (cardObj.type !== undefined && cardObj.type !== 'confirm_log_meal') {
        warnings.push('card.type:unsupported');
        return { sessionId, text: text || 'Thẻ này chưa hỗ trợ lưu bữa ăn.', card: null, warnings };
      }
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
            state: normalized.validMealType && cardObj.type === 'confirm_log_meal' && normalized.status === 'pending_user_action' &&
              cardObj.expires_at === undefined ? 'pending' : 'readonly',
            mealType: normalized.normalizedMealType,
            mealTypeVi: MEAL_TYPE_VI_LABELS[normalized.normalizedMealType],
            items: validatedItems,
            totals: normalized.normalizedTotals,
            actionId: normalized.actionId,
            confirmation_id: normalized.confirmation_id,
            status: normalized.status,
            expiresAt: normalized.expiresAt,
          };
        }
      }
    } catch {
      warnings.push('card:parse_exception');
    }
  }

  if (!text && !card) warnings.push('response:empty');
  if (root.pending_confirmation === true && !card) warnings.push('card:missing_confirmation');

  return {
    sessionId,
    text: text || (card ? '' : 'Trợ lý trả về dữ liệu không đọc được. Vui lòng thử lại.'),
    card,
    warnings,
  };
}
