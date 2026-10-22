/**
 * src/frontend/src/api/authApi.ts
 * Auth API module calling endpoints with apiClient (HttpOnly Cookie, Zero-Trust).
 */

import { apiClient } from './client';
import { AuthResponse, BaseResponse, LoginRequest, RegisterRequest } from '../types/api';

export const authApi = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/register', data);
    return res.data;
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', data);
    return res.data;
  },

  async me(): Promise<AuthResponse> {
    const res = await apiClient.get<AuthResponse>('/auth/me');
    return res.data;
  },

  async logout(): Promise<BaseResponse> {
    const res = await apiClient.post<BaseResponse>('/auth/logout');
    return res.data;
  },
};
