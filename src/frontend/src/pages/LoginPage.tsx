import React, { useState } from 'react';
import { Salad, Lock, User, ArrowRight } from 'lucide-react';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { apiClient } from '../api/client';
import { AuthResponse } from '../types/api';

interface LoginPageProps {
  onLoginSuccess: (hasGoal: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('thanhdat');
  const [password, setPassword] = useState('Password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<AuthResponse>('/auth/login', {
        username_or_email: usernameOrEmail,
        password: password,
      });

      if (res.data.success) {
        // Trình duyệt đã tự động nhận Cookie access_token qua HttpOnly
        onLoginSuccess(res.data.has_goal);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-emerald-50 text-[#107C41] items-center justify-center mb-2">
            <Salad className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Chào mừng đến với <span className="text-[#107C41]">NutriSnap</span>
          </h1>
          <p className="text-xs text-slate-500">
            Trợ lý AI Dinh dưỡng Cá nhân & Quản lý Hành trình Vóc dáng
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
              Tên đăng nhập hoặc Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="thanhdat hoặc dat@example.com"
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              />
            </div>
          </div>

          <div className="text-xs text-slate-400">
            🔒 Xác thực an toàn qua <strong>HttpOnly Cookie</strong> chống rò rỉ mã token.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#107C41] hover:bg-[#0B522B] text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      <div className="mt-6 max-w-md">
        <DisclaimerBadge />
      </div>
    </div>
  );
};
