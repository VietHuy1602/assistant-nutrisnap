import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Spinner';
import { ConnectionErrorScreen } from './ConnectionErrorScreen';
import { useDelayedFlag } from '../hooks/useDelayedFlag';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { status } = useAuth();
  const location = useLocation();
  const showSpinner = useDelayedFlag(status === 'loading', 150);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3" aria-busy="true">
        {showSpinner ? (
          <>
            <Spinner size="lg" label="Đang kiểm tra phiên đăng nhập..." />
            <p className="text-sm text-slate-500 font-medium">Đang kiểm tra phiên đăng nhập…</p>
          </>
        ) : (
          <span className="sr-only">Đang kiểm tra phiên đăng nhập…</span>
        )}
      </div>
    );
  }

  if (status === 'unreachable') {
    return <ConnectionErrorScreen />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return children ? <>{children}</> : <Outlet />;
};
