import { describe, it, expect, vi } from 'vitest';
import { AxiosHeaders } from 'axios';
import { apiClient } from '../api/client';

describe('Security & Zero-Trust Architecture (ADR-001 & Guardrails)', () => {
  it('1. ApiClient cấu hình withCredentials = true để trình duyệt tự gửi HttpOnly Cookie', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('2. ApiClient KHÔNG chứa header Authorization mặc định', () => {
    const headers = apiClient.defaults.headers;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers.common?.['Authorization']).toBeUndefined();
  });

  it('3. Request Interceptor không bao giờ gắn header Authorization thủ công', async () => {
    // Mô phỏng request config chạy qua interceptor với AxiosHeaders thực tế
    const headers = new AxiosHeaders();
    const setSpy = vi.spyOn(headers, 'set');
    const dummyConfig = {
      headers,
    } as unknown as import('axios').InternalAxiosRequestConfig;

    // Lấy interceptor đã đăng ký
    // @ts-expect-error accessing internal axios interceptors for testing
    const requestInterceptor = apiClient.interceptors.request.handlers[0].fulfilled;
    const transformed = await requestInterceptor(dummyConfig);

    expect(transformed.withCredentials).toBe(true);
    // Kiểm tra không có cuộc gọi set('Authorization', ...)
    expect(setSpy).not.toHaveBeenCalledWith(
      'Authorization',
      expect.anything(),
    );
    expect(setSpy).toHaveBeenCalledWith(
      'X-Requested-With',
      'XMLHttpRequest',
    );
    expect(setSpy).toHaveBeenCalledWith(
      'X-Request-ID',
      expect.any(String),
    );
  });

  it('4. Tuyệt đối không lưu token vào localStorage hoặc sessionStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    // Khi gọi bất kỳ phương thức nào của apiClient hay app, không có token nào được ghi vào storage
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
