import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { GoalPlannerWizard } from './pages/GoalPlannerWizard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { AppShell } from './layouts/AppShell';

export const App: React.FC = () => {
  return (
    <Routes>
      {/* Tuyến đường chỉ dành cho khách (Public Only) */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Tuyến đường được bảo vệ (Protected Routes) nằm trong AppShell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/goal-setup" element={<GoalPlannerWizard />} />
        </Route>
      </Route>

      {/* Điều hướng mặc định */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
