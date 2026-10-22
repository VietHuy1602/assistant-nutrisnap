import axios from 'axios';
import type { Food, GoalResult, NutritionAPI, Preview } from './types';
// Same cookie-based client as the existing project. No tokens in browser storage.
const client = axios.create({baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1', withCredentials: true});
export const liveAPI: NutritionAPI = {
  async saveGoal(input) { return (await client.post<GoalResult>('/goals', input)).data; },
  async preview(image, meal) { return (await client.post<Preview>('/meals/preview', {image_base64:image, meal_type:meal})).data; },
  async search(q) { return (await client.get<{items:Food[]}>('/foods/search',{params:{q}})).data.items; },
  async saveMeal(meal, items, notes) { return (await client.post('/meals/log',{meal_type:meal, items:items.map(i=>({food_id:i.food_id,food_name:i.food_name,estimated_gram:Number(i.grams)})),is_confirmed:true, notes})).data; }
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
  if(axios.isAxiosError(error) && error.response?.status===401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trong ứng dụng.';
  return 'Chưa thể kết nối. Dữ liệu chưa được lưu. Bạn có thể thử lại.';
}
