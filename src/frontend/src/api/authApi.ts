/**
 * src/frontend/src/api/authApi.ts
 * Auth API module calling endpoints with apiClient (HttpOnly Cookie, Zero-Trust).
 */

import { apiClient } from './client';
import { AuthResponse, BaseResponse, LoginRequest, RegisterRequest } from '../types/api';
import { parseResponse } from './parseResponse';
import { authResponseSchema, baseResponseSchema } from './contracts';

export const authApi = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/register', data);
    return parseResponse(authResponseSchema, res.data, 'POST /auth/register');
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', data);
    return parseResponse(authResponseSchema, res.data, 'POST /auth/login');
  },

  async me(): Promise<AuthResponse> {
    const res = await apiClient.get<AuthResponse>('/auth/me');
    return parseResponse(authResponseSchema, res.data, 'GET /auth/me');
  },

  async logout(): Promise<BaseResponse> {
    const res = await apiClient.post<BaseResponse>('/auth/logout');
    return parseResponse(baseResponseSchema, res.data, 'POST /auth/logout');
  },
};
