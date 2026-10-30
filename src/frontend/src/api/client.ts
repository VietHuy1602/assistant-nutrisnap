/**
 * src/frontend/src/api/client.ts
 * Axios API client instance with withCredentials: true and robust error/session interceptors.
 * Đảm bảo trình duyệt tự động gửi và nhận HttpOnly JWT Cookie an toàn (Zero-Trust).
 */

import axios, { AxiosError } from 'axios';
import { Capacitor } from '@capacitor/core';
import { normalizeAxiosError } from '../utils/apiError';

export const UNAUTHORIZED_EVENT = 'nutrisnap:unauthorized';
const AUTH_PROBE_PATHS = ['/auth/login', '/auth/register', '/auth/me'];

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const resolvedBaseUrl =
  typeof Capacitor !== 'undefined' &&
  Capacitor.isNativePlatform() &&
  (rawBaseUrl.includes('localhost') || rawBaseUrl.includes('127.0.0.1'))
    ? rawBaseUrl.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2')
    : rawBaseUrl;

const normalizedBaseUrl = resolvedBaseUrl.endsWith('/api/v1')
  ? resolvedBaseUrl
  : `${resolvedBaseUrl.replace(/\/+$/, '')}/api/v1`;

export const apiClient = axios.create({
  baseURL: normalizedBaseUrl,
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
  async (error: AxiosError) => {
    const config = error.config as (typeof error.config & { _retryCount?: number });
    const method = (config?.method ?? '').toUpperCase();
    const isGet = method === 'GET';
    const status = error.response?.status;
    const isNetworkOr5xx = !error.response || status === 502 || status === 503 || status === 504;

    // Retry có kiểm soát: Tối đa 1 lần đối với request GET mang tính idempotent (/auth/me, /goals)
    // khi gặp lỗi mạng hoặc mã 502/503/504 (chờ 400 ms). Tuyệt đối KHÔNG retry POST (§8 Step 4)
    if (config && isGet && isNetworkOr5xx && (config._retryCount ?? 0) < 1) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return apiClient.request(config);
    }

    const url = config?.url ?? '';
    if (error.response?.status === 401 && !AUTH_PROBE_PATHS.some((p) => url.endsWith(p))) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
    }
    return Promise.reject(normalizeAxiosError(error));
  },
);
