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
import { isApiError, isContractError } from '../utils/apiError';

export interface UseAssistantChatProps {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  isAuthenticated: boolean;
  userId?: number;
}

export function useAssistantChat({
  state,
  dispatch,
  isAuthenticated,
  userId,
}: UseAssistantChatProps) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const historyLoadedRef = useRef<boolean>(false);
  const historyControllerRef = useRef<AbortController | null>(null);

  const clearSlowTimer = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    historyLoadedRef.current = false;
    lastSendTimeRef.current = 0;
    return () => {
      clearSlowTimer();
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      historyControllerRef.current?.abort();
      historyControllerRef.current = null;
    };
  }, [isAuthenticated, userId, clearSlowTimer]);

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
      if (!cleanText || !isAuthenticated) return;

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
      if (state.status !== 'idle' || abortControllerRef.current) {
        return;
      }

      lastSendTimeRef.current = now;
      if (historyControllerRef.current) {
        historyControllerRef.current.abort();
        historyControllerRef.current = null;
        dispatch({ type: 'HISTORY_LOADED', sessionId: null, messages: [] });
      }
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

        if (controller.signal.aborted || abortControllerRef.current !== controller) return;
        clearSlowTimer();
        abortControllerRef.current = null;
        lastSendTimeRef.current = 0;

        dispatch({
          type: 'REPLY_OK',
          sessionId: turn.sessionId,
          text: turn.text,
          card: turn.card,
        });
        if (turn.warnings.some(warning => warning.startsWith('card'))) {
          dispatch({ type: 'SYSTEM_NOTE', text: 'Thẻ này chưa hỗ trợ lưu bữa ăn tại đây hoặc thiếu thông tin hợp lệ. Vui lòng yêu cầu trợ lý kiểm tra lại.', tone: 'info' });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted || abortControllerRef.current !== controller) return;
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
        const statusCode = isApiError(err) ? err.status : errorObj?.response?.status;

        let errorMsg = 'Chưa nhận được phản hồi từ trợ lý. Vui lòng thử lại.';
        if (statusCode === 429) {
          errorMsg = 'Bạn thao tác hơi nhanh, vui lòng thử lại sau ít phút.';
        } else if (statusCode === 403) {
          errorMsg = 'Phiên trò chuyện đã được làm mới. Vui lòng gửi lại tin nhắn.';
          // Preserve the failed user message so an explicit retry remains available.
          dispatch({ type: 'RESET_SESSION' });
        } else if (statusCode !== undefined && statusCode >= 500) {
          // Do not expose server internals or guess which backend dependency failed.
          errorMsg = `Trợ lý đang gặp lỗi máy chủ (HTTP ${statusCode}). Chưa nhận được thẻ xác nhận hợp lệ cho yêu cầu này. Vui lòng thử lại sau hoặc báo nhóm phụ trách.`;
        } else if (isApiError(err) && err.isNetworkError) {
          errorMsg = 'Không thể kết nối hoặc đã hết thời gian chờ phản hồi từ trợ lý. Vui lòng kiểm tra kết nối rồi gửi lại khi sẵn sàng.';
        } else if (isContractError(err)) {
          errorMsg = err.message;
        } else if (statusCode === 401) {
          errorMsg = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
        } else if (isApiError(err) && statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
          errorMsg = err.message;
        } else if (typeof errorObj?.response?.data?.detail === 'string') {
          errorMsg = errorObj.response.data.detail;
        }

        dispatch({
          type: 'SEND_FAILED',
          error: errorMsg,
          systemTone: 'error',
        });
      }
    },
    [clearSlowTimer, dispatch, state.sessionId, state.status, isAuthenticated],
  );

  // Thử lại tin nhắn đã thất bại
  const retry = useCallback(
    (clientId: string) => {
      const failedMessage = state.messages.find((m) => m.clientId === clientId);
      if (!failedMessage) return;

      const messageText = failedMessage.text;
      lastSendTimeRef.current = 0;
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
    const controller = new AbortController();
    historyControllerRef.current = controller;
    dispatch({ type: 'HISTORY_LOADING' });

    try {
      const sessions = await assistantApi.listSessions(controller.signal);
      if (controller.signal.aborted) return;
      if (!sessions || sessions.length === 0) {
        dispatch({
          type: 'HISTORY_LOADED',
          sessionId: null,
          messages: [],
        });
        return;
      }

      // Lấy phiên chat mới nhất
      const latestSession = sessions[0];
      const messages = await assistantApi.getSessionMessages(latestSession.id, 20, controller.signal);
      if (controller.signal.aborted) return;

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
      if (controller.signal.aborted) return;
      historyLoadedRef.current = false;
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
