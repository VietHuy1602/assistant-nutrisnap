import React, { useRef, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { BottomNav } from '../components/BottomNav';
import { AssistantChatDrawer } from '../components/AssistantChatDrawer';
import { ChatProvider, useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { ConnectivityProvider } from '../app/ConnectivityProvider';

export interface AppShellContext {
  openChat: () => void;
  // Frontend invalidation only: no meal data or API contract is shared through the shell.
  mealRevision: number;
}

function AppShellInner() {
  const { user, hasGoal } = useAuth();
  const location = useLocation();
  const { isOpen, openChat, closeChat } = useChat();
  const [mealRevision, setMealRevision] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-nutri-surface flex flex-col">
      <div ref={pageRef} className="flex flex-1 flex-col">
        <Navbar onOpenChat={openChat} />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
          {/* Banner gợi ý thiết lập mục tiêu nếu chưa có */}
          {!hasGoal && location.pathname === '/' && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  Bạn chưa thiết lập mục tiêu thể trạng cá nhân! Hãy dành 1 phút để hệ thống tính toán
                  hạn mức calo và dinh dưỡng phù hợp nhất cho bạn.
                </span>
              </div>
              <Link
                to="/goal-setup"
                className="inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-xl bg-nutri-primary text-white font-semibold text-center hover:bg-nutri-dark shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
              >
                Thiết lập ngay
              </Link>
            </div>
          )}

          <Outlet context={{ openChat, mealRevision } satisfies AppShellContext} />
        </main>
      </div>

      <BottomNav />

      <AssistantChatDrawer
        isOpen={isOpen}
        onClose={closeChat}
        username={user?.username}
        backgroundRef={pageRef}
        onMealSaved={() => setMealRevision((previous) => previous + 1)}
      />
    </div>
  );
}

export const AppShell: React.FC = () => {
  const { user } = useAuth();
  return (
    <ConnectivityProvider>
      <ChatProvider key={user?.id ?? 'signed-out'}>
        <AppShellInner />
      </ChatProvider>
    </ConnectivityProvider>
  );
};
