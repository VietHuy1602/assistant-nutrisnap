import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BrandedStartup } from './BrandedStartup';
import { ConnectionErrorScreen } from './ConnectionErrorScreen';
import { useDelayedFlag } from '../hooks/useDelayedFlag';

interface PublicOnlyRouteProps {
  children?: React.ReactNode;
}

export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { status, hasGoal } = useAuth();
  const showSpinner = useDelayedFlag(status === 'loading', 150);

  if (status === 'loading') {
    return <BrandedStartup announce={showSpinner} />;
  }

  if (status === 'unreachable') {
    return <ConnectionErrorScreen />;
  }

  if (status === 'authenticated') {
    // Tài khoản mới (chưa có mục tiêu) đi qua bộ câu hỏi trước; ai đã làm sẽ được chuyển tiếp sang /goal-setup
    return <Navigate to={hasGoal ? '/' : '/onboarding'} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
