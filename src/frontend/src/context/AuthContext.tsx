/**
 * src/frontend/src/context/AuthContext.tsx
 * Authentication Context & Provider.
 * Zero-Trust: Trạng thái phiên suy ra từ GET /auth/me qua HttpOnly Cookie.
 * Tuyệt đối không lưu JWT trong localStorage / sessionStorage.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/authApi';
import { UNAUTHORIZED_EVENT } from '../api/client';
import { AuthResponse, LoginRequest, RegisterRequest, UserPublic } from '../types/api';
import { isApiError } from '../utils/apiError';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unreachable';

export interface AuthContextType {
  status: AuthStatus;
  failureStatus?: number;
  user: UserPublic | null;
  hasGoal: boolean;
  sessionExpired: boolean;
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  setHasGoal: (v: boolean) => void;
  clearSessionExpired: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// In-flight request deduplication: Gộp các lời gọi GET /auth/me đồng thời thành 1 Promise (SAC-5)
let inFlightMePromise: Promise<AuthResponse> | null = null;

export function fetchMeDeduped(): Promise<AuthResponse> {
  if (!inFlightMePromise) {
    inFlightMePromise = authApi.me().finally(() => {
      inFlightMePromise = null;
    });
  }
  return inFlightMePromise;
}

function isUnauthorizedError(err: unknown): boolean {
  if (isApiError(err) && err.status === 401) return true;
  if (err instanceof Error && /401|unauthorized/i.test(err.message)) return true;
  return false;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [failureStatus, setFailureStatus] = useState<number>();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [hasGoal, setHasGoal] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const retryBootstrap = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetchMeDeduped();
      setUser(res.user);
      setHasGoal(res.has_goal);
      setStatus('authenticated');
      setSessionExpired(false);
    } catch (err: unknown) {
      setUser(null);
      setHasGoal(false);
      if (isUnauthorizedError(err)) {
        setStatus('unauthenticated');
      } else {
        // Lỗi mạng / timeout / 5xx -> unreachable (SAC-3: không chuyển /login)
        setFailureStatus(isApiError(err) ? err.status : undefined);
        setStatus('unreachable');
      }
    }
  }, []);

  // Bootstrap xác thực khi ứng dụng khởi chạy
  useEffect(() => {
    let ignore = false;

    fetchMeDeduped()
      .then((res) => {
        if (!ignore) {
          setUser(res.user);
          setHasGoal(res.has_goal);
          setStatus('authenticated');
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setUser(null);
          setHasGoal(false);
          if (isUnauthorizedError(err)) {
            setStatus('unauthenticated');
          } else {
            // Lỗi mạng / timeout / 5xx -> unreachable
            setFailureStatus(isApiError(err) ? err.status : undefined);
            setStatus('unreachable');
          }
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Lắng nghe sự kiện online của trình duyệt khi đang unreachable để tự động thử lại (SAC-4)
  useEffect(() => {
    const handleOnline = () => {
      if (status === 'unreachable') {
        retryBootstrap();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [status, retryBootstrap]);

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

  const login = useCallback(async (credentials: LoginRequest): Promise<boolean> => {
    await authApi.login(credentials);
    try {
      const meRes = await fetchMeDeduped();
      setUser(meRes.user);
      setHasGoal(meRes.has_goal);
      setStatus('authenticated');
      setSessionExpired(false);
      return meRes.has_goal;
    } catch (err: unknown) {
      setUser(null);
      setHasGoal(false);
      if (isUnauthorizedError(err)) {
        setStatus('unauthenticated');
      } else {
        setFailureStatus(isApiError(err) ? err.status : undefined);
        setStatus('unreachable');
      }
      if (isUnauthorizedError(err)) {
        throw new Error('Đăng nhập thành công nhưng phiên chưa được lưu. Hãy kiểm tra cấu hình cookie của ứng dụng.');
      }
      // Preserve network/server errors: they do not prove that cookie storage failed.
      throw err;
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
      const res = await fetchMeDeduped();
      setUser(res.user);
      setHasGoal(res.has_goal);
      setStatus('authenticated');
    } catch (err: unknown) {
      setUser(null);
      setHasGoal(false);
      if (isUnauthorizedError(err)) {
        setStatus('unauthenticated');
      } else {
        setFailureStatus(isApiError(err) ? err.status : undefined);
        setStatus('unreachable');
      }
    }
  }, []);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const value: AuthContextType = {
    status,
    failureStatus,
    user,
    hasGoal,
    sessionExpired,
    login,
    register,
    logout,
    refresh,
    retryBootstrap,
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
