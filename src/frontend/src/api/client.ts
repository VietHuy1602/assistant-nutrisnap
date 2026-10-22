/**
 * src/frontend/src/api/client.ts
 * Axios API client instance with withCredentials: true and robust error/session interceptors.
 * Đảm bảo trình duyệt tự động gửi và nhận HttpOnly JWT Cookie an toàn (Zero-Trust).
 */

import axios, { AxiosError } from 'axios';
import { normalizeAxiosError } from '../utils/apiError';

export const UNAUTHORIZED_EVENT = 'nutrisnap:unauthorized';
const AUTH_PROBE_PATHS = ['/auth/login', '/auth/register', '/auth/me'];

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  withCredentials: true, // Trình duyệt tự gắn HttpOnly cookie
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  // Đảm bảo không bị ghi đè withCredentials
  config.withCredentials = true;

  if (config.headers) {
    config.headers.set('X-Requested-With', 'XMLHttpRequest');

    // Phòng ngừa trong môi trường HTTP non-secure không có crypto.randomUUID
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'req-' + Math.random().toString(36).substring(2, 15);
    config.headers.set('X-Request-ID', requestId);
  }

  return config; // KHÔNG gắn header Authorization
});

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !AUTH_PROBE_PATHS.some((p) => url.endsWith(p))) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
    }
    return Promise.reject(normalizeAxiosError(error));
  },
);
