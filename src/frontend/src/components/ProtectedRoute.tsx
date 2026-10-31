import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BrandedStartup } from './BrandedStartup';
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
    return <BrandedStartup announce={showSpinner} />;
  }

  if (status === 'unreachable') {
    return <ConnectionErrorScreen />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return children ? <>{children}</> : <Outlet />;
};
