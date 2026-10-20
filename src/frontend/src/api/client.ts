/**
 * src/frontend/src/api/client.ts
 * Axios API client instance with withCredentials: true
 * Bắt buộc để trình duyệt tự động gửi và nhận HttpOnly JWT Cookie an toàn.
 */

import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
  withCredentials: true, // Bảo mật HttpOnly Cookie: Trình duyệt tự động đính kèm
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor để xử lý lỗi xác thực 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Có thể chuyển hướng về trang login nếu cần
      console.warn('Phiên đăng nhập hết hạn hoặc chưa xác thực.');
    }
    return Promise.reject(error);
  }
);
