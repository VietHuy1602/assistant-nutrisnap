import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Salad, User, Mail, ArrowRight, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { DisclaimerBadge } from '../components/DisclaimerBadge';
import { FormField } from '../components/FormField';
import { PasswordField } from '../components/PasswordField';
import { useAuth } from '../context/AuthContext';
import { registerSchema, RegisterFormValues } from '../schemas/authSchemas';
import { isApiError } from '../utils/apiError';

export const RegisterPage: React.FC = () => {
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password') || '';
  const hasMinLength = passwordValue.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(passwordValue);
  const hasNumber = /[0-9]/.test(passwordValue);

  const onSubmit = async (values: RegisterFormValues) => {
    setFormError(null);
    try {
      // Chỉ gửi username, email, password - KHÔNG gửi confirmPassword lên Backend
      await registerAuth({
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
      });

      // Tự động đăng nhập thành công -> chuyển sang thiết lập mục tiêu
      navigate('/goal-setup', {
        replace: true,
        state: { message: 'Tạo tài khoản thành công. Hãy thiết lập mục tiêu của bạn.' },
      });
    } catch (err: unknown) {
      if (isApiError(err)) {
        if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          for (const [field, msg] of Object.entries(err.fieldErrors)) {
            if (field in values) {
              setError(field as keyof RegisterFormValues, { message: msg });
            }
          }
        }

        if (err.status === 409) {
          setFormError(err.message || 'Tên đăng nhập hoặc địa chỉ email đã được sử dụng.');
        } else if (err.status === 400) {
          setFormError(err.message || 'Thông tin đăng ký không hợp lệ.');
        } else if (err.message.includes('cookie') || err.message.includes('phiên đăng nhập')) {
          // Trường hợp đăng ký thành công nhưng auto-login gặp sự cố cookie
          navigate('/login', {
            replace: true,
            state: { message: 'Đăng ký thành công, vui lòng đăng nhập.' },
          });
          return;
        } else {
          setFormError(err.message || 'Đăng ký không thành công. Vui lòng thử lại.');
        }
      } else if (err instanceof Error) {
        if (err.message.includes('cookie') || err.message.includes('phiên đăng nhập')) {
          navigate('/login', {
            replace: true,
            state: { message: 'Đăng ký thành công, vui lòng đăng nhập.' },
          });
          return;
        }
        setFormError(err.message);
      } else {
        setFormError('Đăng ký không thành công. Vui lòng thử lại.');
      }
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-emerald-50 text-nutri-primary items-center justify-center mb-2">
            <Salad className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tạo tài khoản <span className="text-nutri-primary">NutriSnap</span>
          </h1>
          <p className="text-xs text-slate-500">
            Khởi đầu hành trình dinh dưỡng cá nhân hóa dựa trên dữ liệu khoa học
          </p>
        </div>

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
            id="username"
            label="Tên đăng nhập"
            error={errors.username?.message}
            required
          >
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" aria-hidden="true" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Ví dụ: thanhdat25"
                aria-invalid={!!errors.username}
                {...register('username')}
                className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
                  errors.username
                    ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
                    : 'border-slate-200 focus:ring-nutri-primary focus:border-transparent'
                }`}
              />
            </div>
          </FormField>

          <FormField
            id="email"
            label="Địa chỉ Email"
            error={errors.email?.message}
            required
          >
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" aria-hidden="true" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                aria-invalid={!!errors.email}
                {...register('email')}
                className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
                  errors.email
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
              autoComplete="new-password"
              placeholder="Tối thiểu 8 ký tự, có chữ và số"
              hasError={!!errors.password}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>

          {/* Quy tắc mật khẩu hiển thị thời gian thực */}
          <div
            aria-live="polite"
            className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs text-slate-600"
          >
            <p className="font-semibold text-slate-700 mb-1">Yêu cầu mật khẩu an toàn:</p>
            <div className="flex items-center gap-2">
              {hasMinLength ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span className={hasMinLength ? 'text-emerald-700 font-medium' : ''}>
                Tối thiểu 8 ký tự
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasLetter ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span className={hasLetter ? 'text-emerald-700 font-medium' : ''}>
                Chứa ít nhất 1 chữ cái
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasNumber ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span className={hasNumber ? 'text-emerald-700 font-medium' : ''}>
                Chứa ít nhất 1 chữ số
              </span>
            </div>
          </div>

          <FormField
            id="confirmPassword"
            label="Xác nhận mật khẩu"
            error={errors.confirmPassword?.message}
            required
          >
            <PasswordField
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu vừa đặt"
              hasError={!!errors.confirmPassword}
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
          </FormField>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="text-nutri-primary font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-nutri-primary rounded"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </div>

      <div className="mt-6 max-w-md w-full">
        <DisclaimerBadge />
      </div>
    </div>
  );
};
