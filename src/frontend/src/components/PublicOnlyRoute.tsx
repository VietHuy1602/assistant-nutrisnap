import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Spinner';

interface PublicOnlyRouteProps {
  children?: React.ReactNode;
}

export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { status, hasGoal } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Spinner size="lg" label="Đang kiểm tra phiên đăng nhập..." />
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to={hasGoal ? '/' : '/goal-setup'} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
