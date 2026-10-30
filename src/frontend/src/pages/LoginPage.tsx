import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { FormField } from '../components/FormField';
import { PasswordField } from '../components/PasswordField';
import { useAuth } from '../context/AuthContext';
import { loginSchema, LoginFormValues } from '../schemas/authSchemas';
import { safeRedirect } from '../utils/safeRedirect';
import { isApiError } from '../utils/apiError';
import styles from './LoginSurface.module.css';

export interface LoginPageProps {
  onLoginSuccess?: (hasGoal: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: {
      username_or_email: '',
      password: '',
    },
  });

  const prefetchRegister = () => {
    import('./RegisterPage');
  };

  const prefetchDestinations = () => {
    import('./GoalPlannerWizard');
    import('./BasicDashboard');
    import('./MealCaptureFlow');
  };

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    prefetchDestinations();
    try {
      const userHasGoal = await login(values);
      onLoginSuccess?.(userHasGoal);
      const from = (location.state as { from?: string } | null)?.from;
      const target = safeRedirect(from, userHasGoal ? '/' : '/goal-setup');
      navigate(target, { replace: true });
    } catch (err: unknown) {
      if (isApiError(err)) {
        if (err.status === 401) {
          setFormError('Tên đăng nhập hoặc mật khẩu không đúng.');
        } else {
          setFormError(err.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
        }
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Đăng nhập không thành công. Vui lòng thử lại.');
      }
    }
  };

  return (
    <div className={styles.surface}>
      <aside className={styles.brand} aria-label="NutriSnap — Chụp phát biết liền, ăn ngon bớt phiền"><img src="/branding/nutrisnap-launch.png" alt="NutriSnap — Chụp phát biết liền, ăn ngon bớt phiền" /></aside>
      <div className={styles.panel}>
      <div className="w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Đăng nhập
          </h1>
          <p className="text-xs text-slate-500">
            Trợ lý AI Dinh dưỡng Cá nhân & Quản lý Hành trình Vóc dáng
          </p>
        </div>

        {sessionExpired && !formError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-amber-50 text-amber-800 text-xs border border-amber-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.</span>
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            id="username_or_email"
            label="Tên đăng nhập hoặc Email"
            error={errors.username_or_email?.message}
            required
          >
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" aria-hidden="true" />
              <input
                id="username_or_email"
                type="text"
                autoComplete="username"
                placeholder="Nhập tên đăng nhập hoặc email"
                aria-invalid={!!errors.username_or_email}
                {...register('username_or_email')}
                className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
                  errors.username_or_email
                    ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                    : 'border-slate-200 focus:ring-nutri-primary focus:border-transparent'
                }`}
              />
            </div>
          </FormField>

          <FormField
            id="password"
            label="Mật khẩu"
            error={errors.password?.message}
            required
          >
            <PasswordField
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              hasError={!!errors.password}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <ShieldCheck className="w-4 h-4 text-nutri-primary shrink-0" />
            <span>
              Phiên đăng nhập được bảo vệ bằng <strong>HttpOnly Cookie</strong>.
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Đang xác thực...' : 'Đăng nhập'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Chưa có tài khoản?{' '}
          <Link
            to="/register"
            onMouseEnter={prefetchRegister}
            onFocus={prefetchRegister}
            className="text-nutri-primary font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-nutri-primary rounded"
          >
            Đăng ký ngay
          </Link>
        </p>
      </div>

      <div className="mt-6 max-w-md w-full">
        <DisclaimerBadge />
      </div>
      </div>
    </div>
  );
};
