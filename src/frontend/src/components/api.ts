import axios from 'axios';
import type { Food, GoalResult, NutritionAPI, Preview } from './types';
import { apiClient as client } from '../api/client';
import { ApiError, isApiError } from '../utils/apiError';
type Recognition = Preview & { success: boolean; is_fallback: boolean };
export const liveAPI: NutritionAPI = {
  async saveGoal(input) { return (await client.post<GoalResult>('/goals', input)).data; },
  async preview(image, meal) {
    const { data } = await client.post<Recognition>('/ai/recognize-food', { image_base64: image, meal_type: meal });
    // The existing backend flags sample fallback results. Never offer them as real recognition.
    if (data.is_fallback !== false) throw new ApiError('Nhận diện ảnh chưa khả dụng. Hệ thống trả dữ liệu dự phòng nên chưa tạo bản nháp. Bạn có thể chọn món thủ công.');
    if (!data.success || !Array.isArray(data.detected_items)) throw new ApiError('Chưa nhận diện được món ăn. Hãy thử ảnh khác hoặc chọn món thủ công.');
    return data;
  },
  async search(q) {
    const { data } = await client.get<{ items: Food[] }>('/foods/search', { params: { q } });
    if (!Array.isArray(data.items)) throw new ApiError('Chưa tải được danh sách món ăn. Vui lòng thử lại.');
    // Avoid showing unrelated backend sample results for an unmatched search.
    const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return data.items.filter(food => Number.isInteger(food.id) && food.id > 0 && typeof food.food_name === 'string' && normalized(food.food_name).includes(normalized(q)) && [food.calories_per_100g, food.protein_per_100g, food.carbs_per_100g, food.fat_per_100g].every(value => Number.isFinite(value) && value >= 0));
  },
  async saveMeal(meal, items, notes) {
    const { data } = await client.post('/meals/log', { meal_type: meal, items: items.map(i => ({ food_id: i.food_id, food_name: i.food_name, estimated_gram: Number(i.grams) })), is_confirmed: true, notes });
    if (data.success !== true || data.status !== 'logged' || !Number.isInteger(data.meal_id) || data.meal_id <= 0 || !Number.isFinite(data.total_calories)) throw new ApiError('Máy chủ chưa xác nhận lưu bữa ăn. Vui lòng kiểm tra nhật ký trước khi thử lại.');
    return data;
  },
};
// Explicit UI fixtures. Never used as a fallback when a live request fails.
const foods: Food[] = [
  {id:1,food_name:'Phở bò tái',calories_per_100g:135,protein_per_100g:8.2,carbs_per_100g:16.5,fat_per_100g:3.8},
  {id:2,food_name:'Cơm tấm sườn nướng',calories_per_100g:185,protein_per_100g:9.5,carbs_per_100g:22,fat_per_100g:6.2},
  {id:3,food_name:'Rau luộc',calories_per_100g:30,protein_per_100g:2,carbs_per_100g:5,fat_per_100g:0.3}
];
export function createDemoAPI(scenario: string): NutritionAPI {
  const wait = async () => { await new Promise(r=>setTimeout(r,450)); if(scenario==='error') throw new Error('Demo failure'); };
  return {
    async saveGoal() { await wait(); return {bmr_calories:1500,tdee_calories:2100,target_calories:1900,target_protein_g:100,target_carbs_g:240,target_fat_g:60}; },
    async preview() { await wait(); return {status:scenario==='unrecognized'?'unrecognized':'pending_confirmation',detected_items:[{food_id:1,food_name:'Phở bò tái',estimated_gram:400,estimated_calories:540,protein_g:32.8,carbs_g:66,fat_g:15.2,confidence:0.92}]}; },
    async search(q) { await wait(); const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); return foods.filter(f=>norm(f.food_name).includes(norm(q))); },
    async saveMeal(_meal,items) { await wait(); return {success:true,total_calories:items.reduce((s,i)=>s+Number(i.grams)*i.per100[0]/100,0)}; }
  };
}
export function errorText(error: unknown): string {
  if (isApiError(error)) return error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trong ứng dụng.' : error.message;
  if(axios.isAxiosError(error) && error.response?.status===401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trong ứng dụng.';
  return 'Chưa thể kết nối. Dữ liệu chưa được lưu. Bạn có thể thử lại.';
}
