import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Spinner';
import { ConnectionErrorScreen } from './ConnectionErrorScreen';
import { useDelayedFlag } from '../hooks/useDelayedFlag';

interface PublicOnlyRouteProps {
  children?: React.ReactNode;
}

export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { status, hasGoal } = useAuth();
  const showSpinner = useDelayedFlag(status === 'loading', 150);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3" aria-busy="true">
        {showSpinner ? (
          <Spinner size="lg" label="Đang kiểm tra phiên đăng nhập..." />
        ) : (
          <span className="sr-only">Đang kiểm tra phiên đăng nhập...</span>
        )}
      </div>
    );
  }

  if (status === 'unreachable') {
    return <ConnectionErrorScreen />;
  }

  if (status === 'authenticated') {
    return <Navigate to={hasGoal ? '/' : '/goal-setup'} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
