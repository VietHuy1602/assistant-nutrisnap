/**
 * src/frontend/src/api/adminApi.ts
 * API quản trị người dùng (chỉ tài khoản is_admin). Số liệu do backend tổng hợp sẵn.
 */

import { apiClient } from './client';

export interface AdminStats {
  total_users: number;
  active_users: number;
  locked_users: number;
  admin_users: number;
  new_users_7d: number;
  users_with_goal: number;
  total_meals: number;
  meals_7d: number;
  active_loggers_7d: number;
  chat_sessions_7d: number;
  signups_by_day: Array<{ date: string; count: number }>;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  has_goal: boolean;
  meal_count: number;
  last_meal_at: string | null;
}

export interface AdminUserList {
  total: number;
  page: number;
  page_size: number;
  items: AdminUser[];
}

export type AdminStatusFilter = 'all' | 'active' | 'locked' | 'admin';

export const adminApi = {
  async getStats(): Promise<AdminStats> {
    const res = await apiClient.get<AdminStats>('/admin/stats');
    return res.data;
  },
  async listUsers(params: { q?: string; status?: AdminStatusFilter; page?: number; page_size?: number }): Promise<AdminUserList> {
    const res = await apiClient.get<AdminUserList>('/admin/users', { params });
    return res.data;
  },
  async updateUser(id: number, body: { is_active?: boolean; is_admin?: boolean }): Promise<AdminUser> {
    const res = await apiClient.patch<AdminUser>(`/admin/users/${id}`, body);
    return res.data;
  },
  async deleteUser(id: number): Promise<void> {
    await apiClient.delete(`/admin/users/${id}`);
  },
};
