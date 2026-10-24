/**
 * src/frontend/src/chat/chatReducer.ts
 * Quản lý trạng thái thuần túy (Pure Reducer) cho hệ thống hội thoại Trợ lý ảo AI.
 * Đảm bảo:
 * - Khóa một tin nhắn chạy tại một thời điểm (Single in-flight message).
 * - Hủy bỏ request an toàn, không để lại bong bóng rác (Ghost bubble).
 * - Khử trùng lặp tin nhắn lịch sử (Deduplication).
 */

import type { ActionCardModel, ChatMessage, SystemTone } from './types';

export type ChatFlowStatus = 'idle' | 'sending' | 'awaitingReply' | 'slow';
export type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ChatState {
  messages: ChatMessage[];
  sessionId: string | number | null;
  status: ChatFlowStatus;
  historyStatus: HistoryStatus;
  cards: Record<string, ActionCardModel>;
  currentPendingClientId: string | null;
}

export const initialChatState: ChatState = {
  messages: [],
  sessionId: null,
  status: 'idle',
  historyStatus: 'idle',
  cards: {},
  currentPendingClientId: null,
};

export type ChatAction =
  | {
      type: 'SEND_START';
      clientId: string;
      text: string;
      createdAt?: string;
    }
  | {
      type: 'AWAITING_REPLY';
    }
  | {
      type: 'SLOW';
    }
  | {
      type: 'REPLY_OK';
      sessionId: string | number | null;
      text: string;
      card?: ActionCardModel | null;
      disclaimer?: string;
      createdAt?: string;
    }
  | {
      type: 'SEND_FAILED';
      error: string;
      systemTone?: SystemTone;
    }
  | {
      type: 'CANCEL';
    }
  | {
      type: 'RETRY_PREPARE';
      clientId: string;
    }
  | {
      type: 'HISTORY_LOADING';
    }
  | {
      type: 'HISTORY_LOADED';
      sessionId: string | number | null;
      messages: Array<{
        id: string | number;
        senderRole: 'user' | 'assistant';
        content: string;
        createdAt: string;
      }>;
    }
  | {
      type: 'HISTORY_FAILED';
      error?: string;
    }
  | {
      type: 'UPDATE_CARD';
      card: ActionCardModel;
    }
  | {
      type: 'SYSTEM_NOTE';
      text: string;
      tone: SystemTone;
    }
  | {
      type: 'RESET';
    };

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND_START': {
      // Chỉ cho phép 1 tin nhắn chạy tại một thời điểm
      if (state.status !== 'idle') {
        return state;
      }
      const userMessage: ChatMessage = {
        id: generateId('msg'),
        clientId: action.clientId,
        sender: 'user',
        text: action.text,
        status: 'sending',
        createdAt: action.createdAt || new Date().toISOString(),
      };
      return {
        ...state,
        status: 'sending',
        currentPendingClientId: action.clientId,
        messages: [...state.messages, userMessage],
      };
    }

    case 'AWAITING_REPLY': {
      if (state.status === 'idle') return state;
      return {
        ...state,
        status: 'awaitingReply',
      };
    }

    case 'SLOW': {
      if (state.status !== 'awaitingReply' && state.status !== 'sending') {
        return state;
      }
      return {
        ...state,
        status: 'slow',
      };
    }

    case 'REPLY_OK': {
      const updatedMessages = state.messages.map((m) =>
        m.clientId === state.currentPendingClientId ? { ...m, status: 'sent' as const } : m,
      );

      const nextCards = { ...state.cards };
      let cardId: string | undefined = undefined;

      if (action.card) {
        cardId = action.card.id;
        nextCards[cardId] = action.card;
      }

      const assistantMsg: ChatMessage = {
        id: generateId('msg-ai'),
        clientId: generateId('client-ai'),
        sender: 'assistant',
        text: action.text,
        cardId,
        createdAt: action.createdAt || new Date().toISOString(),
        disclaimer: action.disclaimer,
      };

      return {
        ...state,
        status: 'idle',
        currentPendingClientId: null,
        sessionId: action.sessionId ?? state.sessionId,
        messages: [...updatedMessages, assistantMsg],
        cards: nextCards,
      };
    }

    case 'SEND_FAILED': {
      const updatedMessages = state.messages.map((m) =>
        m.clientId === state.currentPendingClientId
          ? {
              ...m,
              status: 'failed' as const,
              isRetryable: true,
              error: action.error,
            }
          : m,
      );

      const systemMsg: ChatMessage = {
        id: generateId('sys'),
        clientId: generateId('client-sys'),
        sender: 'system',
        text: action.error,
        systemTone: action.systemTone || 'error',
        createdAt: new Date().toISOString(),
      };

      return {
        ...state,
        status: 'idle',
        currentPendingClientId: null,
        messages: [...updatedMessages, systemMsg],
      };
    }

    case 'CANCEL': {
      if (state.status === 'idle') return state;

      // Khi hủy: Không để lại tin nhắn rác của trợ lý, đánh dấu tin nhắn người dùng chưa hoàn tất
      const updatedMessages = state.messages.map((m) =>
        m.clientId === state.currentPendingClientId
          ? { ...m, status: 'failed' as const, isRetryable: true, error: 'Đã hủy gửi tin nhắn' }
          : m,
      );

      return {
        ...state,
        status: 'idle',
        currentPendingClientId: null,
        messages: updatedMessages,
      };
    }

    case 'RETRY_PREPARE': {
      // Chuẩn bị gửi lại: Tìm tin nhắn lỗi và loại bỏ tin nhắn thất bại cũ để gửi lượt mới
      const filtered = state.messages.filter((m) => m.clientId !== action.clientId);
      return {
        ...state,
        status: 'idle',
        currentPendingClientId: null,
        messages: filtered,
      };
    }

    case 'HISTORY_LOADING': {
      return {
        ...state,
        historyStatus: 'loading',
      };
    }

    case 'HISTORY_LOADED': {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const formattedHistory: ChatMessage[] = [];

      for (const item of action.messages) {
        const idStr = String(item.id);
        if (!existingIds.has(idStr)) {
          formattedHistory.push({
            id: idStr,
            clientId: idStr,
            sender: item.senderRole === 'user' ? 'user' : 'assistant',
            text: item.content,
            createdAt: item.createdAt,
            status: 'sent',
          });
          existingIds.add(idStr);
        }
      }

      return {
        ...state,
        sessionId: action.sessionId ?? state.sessionId,
        historyStatus: 'ready',
        messages: [...formattedHistory, ...state.messages],
      };
    }

    case 'HISTORY_FAILED': {
      return {
        ...state,
        historyStatus: 'error',
      };
    }

    case 'UPDATE_CARD': {
      return {
        ...state,
        cards: {
          ...state.cards,
          [action.card.id]: action.card,
        },
      };
    }

    case 'SYSTEM_NOTE': {
      const sysMsg: ChatMessage = {
        id: generateId('sys'),
        clientId: generateId('client-sys'),
        sender: 'system',
        text: action.text,
        systemTone: action.tone,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        messages: [...state.messages, sysMsg],
      };
    }

    case 'RESET': {
      return initialChatState;
    }

    default:
      return state;
  }
}
