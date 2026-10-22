/**
 * src/frontend/src/context/AuthContext.tsx
 * Authentication Context & Provider.
 * Zero-Trust: Trạng thái phiên suy ra từ GET /auth/me qua HttpOnly Cookie.
 * Tuyệt đối không lưu JWT trong localStorage / sessionStorage.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/authApi';
import { UNAUTHORIZED_EVENT } from '../api/client';
import { LoginRequest, RegisterRequest, UserPublic } from '../types/api';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextType {
  status: AuthStatus;
  user: UserPublic | null;
  hasGoal: boolean;
  sessionExpired: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setHasGoal: (v: boolean) => void;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserPublic | null>(null);
  const [hasGoal, setHasGoal] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  // Bootstrap xác thực khi ứng dụng khởi chạy
  useEffect(() => {
    let ignore = false;

    authApi
      .me()
      .then((res) => {
        if (!ignore) {
          setUser(res.user);
          setHasGoal(res.has_goal);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (!ignore) {
          setUser(null);
          setHasGoal(false);
          setStatus('unauthenticated');
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Lắng nghe sự kiện 401 toàn cục từ Axios response interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setHasGoal(false);
      setStatus('unauthenticated');
      setSessionExpired(true);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    await authApi.login(credentials);
    try {
      const meRes = await authApi.me();
      setUser(meRes.user);
      setHasGoal(meRes.has_goal);
      setStatus('authenticated');
      setSessionExpired(false);
    } catch {
      setUser(null);
      setHasGoal(false);
      setStatus('unauthenticated');
      throw new Error('Không thể thiết lập phiên đăng nhập. Hãy kiểm tra cookie của trình duyệt.');
    }
  }, []);

  const register = useCallback(
    async (payload: RegisterRequest) => {
      await authApi.register(payload);
      // Hợp đồng API: sau khi đăng ký, tự động đăng nhập với cùng thông tin
      await login({
        username_or_email: payload.username,
        password: payload.password,
      });
      setHasGoal(false);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Dù API thất bại (ví dụ mất mạng), vẫn dọn sạch trạng thái đăng nhập cục bộ
    } finally {
      setUser(null);
      setHasGoal(false);
      setStatus('unauthenticated');
      setSessionExpired(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.user);
      setHasGoal(res.has_goal);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setHasGoal(false);
      setStatus('unauthenticated');
    }
  }, []);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const value: AuthContextType = {
    status,
    user,
    hasGoal,
    sessionExpired,
    login,
    register,
    logout,
    refresh,
    setHasGoal,
    clearSessionExpired,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
