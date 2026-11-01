import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';
import { applyTheme, readTheme } from './theme/theme';

// Áp dụng chế độ Sáng/Tối đã lưu trước lần vẽ đầu tiên để không bị nháy màu
applyTheme(readTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
