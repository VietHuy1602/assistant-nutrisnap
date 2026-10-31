import React, { useRef, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { BottomNav } from '../components/BottomNav';
import { AssistantChatDrawer } from '../components/AssistantChatDrawer';
import { ChatProvider, useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { ConnectivityProvider } from '../app/ConnectivityProvider';
import { DraftBanner } from '../offline/DraftBanner';

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
        <DraftBanner />

        <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-8 ${location.pathname === '/' ? 'pt-4' : 'pt-8'}`}>
          {/* Banner gợi ý thiết lập mục tiêu nếu chưa có */}
          {!hasGoal && location.pathname === '/' && (
            <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm leading-6 text-amber-900 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  Thiết lập mục tiêu để xem kế hoạch dinh dưỡng phù hợp với bạn. Bạn vẫn có thể ghi bữa ăn trước.
                </span>
              </div>
              <Link
                to="/goal-setup"
                className="inline-flex min-h-12 min-w-12 items-center justify-center px-4 py-2 rounded-xl bg-nutri-primary text-white font-semibold text-center hover:bg-nutri-dark shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
              >
                Thiết lập ngay
              </Link>
            </div>
          )}

          <Outlet context={{ openChat, mealRevision } satisfies AppShellContext} />
        </main>
      <BottomNav />
      </div>

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
