/**
 * src/frontend/src/context/ChatContext.tsx
 * Context & Provider quản lý toàn bộ trạng thái hội thoại và thẻ tương tác của Trợ lý AI.
 * Đảm bảo:
 * - Lưu trữ 100% trong bộ nhớ (In-memory only), không lưu vào localStorage/sessionStorage (N3).
 * - Tự động RESET toàn bộ tin nhắn khi đăng xuất hoặc đổi tài khoản người dùng (M11).
 * - Tồn tại ở cấp AppShell: đổi route trong ứng dụng không làm mất hội thoại.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { chatReducer, initialChatState, type ChatAction, type ChatState } from '../chat/chatReducer';
import { useAssistantChat } from '../hooks/useAssistantChat';
import { useAuth } from './AuthContext';
import { HISTORY_PREFETCH_DELAY_MS } from '../chat/config';

export interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  send: (text: string) => Promise<void>;
  cancel: () => void;
  retry: (clientId: string) => void;
  loadHistory: () => Promise<void>;
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function useOptionalChat(): ChatContextValue | undefined {
  return useContext(ChatContext);
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status } = useAuth();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [isOpen, setIsOpen] = useState(false);
  const previousUserIdRef = useRef<number | null>(null);

  const isAuthenticated = status === 'authenticated';

  const { send, cancel, retry, loadHistory } = useAssistantChat({
    state,
    dispatch,
    isAuthenticated,
    userId: user?.id,
  });

  // Tự động RESET toàn bộ hội thoại khi đăng xuất hoặc đổi tài khoản (M11)
  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'RESET' });
      setIsOpen(false);
      previousUserIdRef.current = null;
      return;
    }

    const currentUserId = user?.id ?? null;
    if (previousUserIdRef.current !== null && previousUserIdRef.current !== currentUserId) {
      dispatch({ type: 'RESET' });
      setIsOpen(false);
    }
    previousUserIdRef.current = currentUserId;
  }, [isAuthenticated, user?.id]);

  // Lên lịch tải trước lịch sử (Prefetch) một cách êm ái khi authenticated
  useEffect(() => {
    if (!isAuthenticated || !isOpen) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(
        () => {
          void loadHistory();
        },
        { timeout: 3000 },
      );
    } else {
      timerId = setTimeout(() => {
        void loadHistory();
      }, HISTORY_PREFETCH_DELAY_MS);
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    };
  }, [isAuthenticated, isOpen, loadHistory]);

  const openChat = () => setIsOpen(true);
  const closeChat = () => setIsOpen(false);

  const value: ChatContextValue = {
    state,
    dispatch,
    send,
    cancel,
    retry,
    loadHistory,
    isOpen,
    openChat,
    closeChat,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat phải được sử dụng bên trong ChatProvider.');
  }
  return context;
}
