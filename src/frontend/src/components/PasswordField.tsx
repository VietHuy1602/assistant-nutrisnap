import React, { useState, forwardRef } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

export interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  hasError?: boolean;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ id, hasError = false, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    const toggleShow = () => {
      setShowPassword((prev) => !prev);
    };

    return (
      <div className="relative">
        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" aria-hidden="true" />
        <input
          ref={ref}
          id={id}
          type={showPassword ? 'text' : 'password'}
          className={`w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
            hasError
              ? 'border-red-300 focus:ring-red-400 bg-red-50/20'
              : 'border-slate-200 focus:ring-nutri-primary focus:border-transparent'
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={toggleShow}
          aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={showPassword}
          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-nutri-primary rounded-lg p-0.5"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    );
  },
);

PasswordField.displayName = 'PasswordField';
