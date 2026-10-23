// Isolated illustrative UI data. Never used by the live meal API as food references.
export type SwapGoal = 'reduce_calories' | 'high_protein' | 'balanced_saver';
export interface SwapFood { key: string; name: string; grams: number; calories: number; protein: number; carbs: number; fat: number; price: number }
export interface SwapPreview { current: SwapFood; alternatives: SwapFood[] }
export type SwapProvider = (goal: SwapGoal) => Promise<SwapPreview>;
export const demoSwapProvider: SwapProvider = async goal => {
  const current = { key: 'demo-current', name: 'Bữa ăn minh họa', grams: 100, calories: 200, protein: 10, carbs: 25, fat: 6, price: 20000 };
  const choices = {
    reduce_calories: { ...current, key: 'demo-light', name: 'Lựa chọn nhẹ minh họa', calories: 150, price: 18000 },
    high_protein: { ...current, key: 'demo-protein', name: 'Lựa chọn đạm minh họa', protein: 15, price: 22000 },
    balanced_saver: { ...current, key: 'demo-budget', name: 'Lựa chọn tiết kiệm minh họa', calories: 180, price: 15000 },
  };
  return { current, alternatives: [choices[goal]] };
};
