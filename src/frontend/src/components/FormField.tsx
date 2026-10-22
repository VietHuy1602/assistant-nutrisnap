import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  error,
  helperText,
  required,
  className = '',
  children,
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {helperText && !error && (
        <p id={`${id}-helper`} className="text-xs text-slate-500">
          {helperText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600 font-medium">
          {error}
        </p>
      )}
    </div>
  );
};
