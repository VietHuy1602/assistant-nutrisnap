/**
 * src/frontend/src/hooks/useAssistantChat.ts
 * Hook quản lý luồng gửi/nhận tin nhắn, tải lịch sử, hẹn giờ thông báo chậm và hủy tin nhắn.
 */

import { useCallback, useEffect, useRef } from 'react';
import { assistantApi } from '../api/assistantApi';
import {
  CHAT_SLOW_HINT_MS,
  MESSAGE_MAX_LENGTH,
  MIN_SEND_INTERVAL_MS,
} from '../chat/config';
import type { ChatAction, ChatState } from '../chat/chatReducer';

export interface UseAssistantChatProps {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  isAuthenticated: boolean;
}

export function useAssistantChat({
  state,
  dispatch,
  isAuthenticated,
}: UseAssistantChatProps) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const historyLoadedRef = useRef<boolean>(false);

  const clearSlowTimer = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, []);

  // Hủy tin nhắn đang gửi
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearSlowTimer();
    dispatch({ type: 'CANCEL' });
  }, [clearSlowTimer, dispatch]);

  // Gửi tin nhắn
  const send = useCallback(
    async (text: string) => {
      const cleanText = text.trim();
      if (!cleanText) return;

      if (cleanText.length > MESSAGE_MAX_LENGTH) {
        dispatch({
          type: 'SYSTEM_NOTE',
          text: `Tin nhắn vượt quá giới hạn ${MESSAGE_MAX_LENGTH} ký tự. Vui lòng rút gọn nội dung.`,
          tone: 'error',
        });
        return;
      }

      // Khóa khoảng cách gửi tối thiểu
      const now = Date.now();
      if (now - lastSendTimeRef.current < MIN_SEND_INTERVAL_MS) {
        return;
      }

      // Khóa 1 tin nhắn chạy tại một thời điểm
      if (state.status !== 'idle') {
        return;
      }

      lastSendTimeRef.current = now;
      const clientId = `client-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      dispatch({
        type: 'SEND_START',
        clientId,
        text: cleanText,
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: 'AWAITING_REPLY' });

      // Hẹn giờ cảnh báo chậm sau 8 giây
      clearSlowTimer();
      slowTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SLOW' });
      }, CHAT_SLOW_HINT_MS);

      try {
        const turn = await assistantApi.sendMessage(
          {
            message: cleanText,
            sessionId: state.sessionId,
          },
          controller.signal,
        );

        clearSlowTimer();
        abortControllerRef.current = null;

        dispatch({
          type: 'REPLY_OK',
          sessionId: turn.sessionId,
          text: turn.text,
          card: turn.card,
        });
      } catch (err: unknown) {
        clearSlowTimer();
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }

        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        const errorObj = err as {
          response?: { status?: number; data?: { detail?: string } };
          message?: string;
        };
        const statusCode = errorObj?.response?.status;

        let errorMsg = 'Chưa nhận được phản hồi từ trợ lý. Vui lòng thử lại.';
        if (statusCode === 429) {
          errorMsg = 'Bạn thao tác hơi nhanh, vui lòng thử lại sau ít phút.';
        } else if (statusCode === 403) {
          errorMsg = 'Phiên trò chuyện đã được làm mới. Vui lòng gửi lại tin nhắn.';
          dispatch({ type: 'RESET' });
        } else if (errorObj?.response?.data?.detail) {
          errorMsg = errorObj.response.data.detail;
        }

        dispatch({
          type: 'SEND_FAILED',
          error: errorMsg,
          systemTone: 'error',
        });
      }
    },
    [clearSlowTimer, dispatch, state.sessionId, state.status],
  );

  // Thử lại tin nhắn đã thất bại
  const retry = useCallback(
    (clientId: string) => {
      const failedMessage = state.messages.find((m) => m.clientId === clientId);
      if (!failedMessage) return;

      const messageText = failedMessage.text;
      dispatch({ type: 'RETRY_PREPARE', clientId });
      void send(messageText);
    },
    [dispatch, send, state.messages],
  );

  // Tải lịch sử phiên chat khi đăng nhập
  const loadHistory = useCallback(async () => {
    if (!isAuthenticated || historyLoadedRef.current || state.historyStatus === 'loading') {
      return;
    }

    historyLoadedRef.current = true;
    dispatch({ type: 'HISTORY_LOADING' });

    try {
      const sessions = await assistantApi.listSessions();
      if (!sessions || sessions.length === 0) {
        dispatch({
          type: 'HISTORY_LOADED',
          sessionId: null,
          messages: [],
        });
        return;
      }

      // Lấy phiên chat mới nhất
      const latestSession = sessions[sessions.length - 1];
      const messages = await assistantApi.getSessionMessages(latestSession.id, 20);

      dispatch({
        type: 'HISTORY_LOADED',
        sessionId: latestSession.id,
        messages: messages.map((m) => ({
          id: m.id,
          senderRole: m.senderRole,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
    } catch {
      dispatch({ type: 'HISTORY_FAILED' });
    }
  }, [dispatch, isAuthenticated, state.historyStatus]);

  // Dọn dẹp timer và abort request khi unmount
  useEffect(() => {
    return () => {
      clearSlowTimer();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [clearSlowTimer]);

  return {
    send,
    cancel,
    retry,
    loadHistory,
  };
}
