import React, { type ReactNode } from 'react';
import { ArrowDown, RotateCcw } from 'lucide-react';
import type { ChatMessage } from '../types';
import { TypingIndicator } from './TypingIndicator';
import { ChatEmptyState } from './ChatEmptyState';

interface MessageListProps {
  messages: ChatMessage[];
  username?: string;
  isSending: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  showScrollBottom: boolean;
  onScrollToBottom: () => void;
  onScroll: () => void;
  onRetry?: (messageId: string) => void;
  renderCard?: (message: ChatMessage) => ReactNode;
}

const focusStyle = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

export function MessageList({
  messages,
  username,
  isSending,
  containerRef,
  showScrollBottom,
  onScrollToBottom,
  onScroll,
  onRetry,
  renderCard,
}: MessageListProps) {
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={containerRef}
        role="log"
        aria-label="Hội thoại với trợ lý"
        aria-live="polite"
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
      >
        {messages.length === 0 && <ChatEmptyState username={username} />}

        {messages.map((message) => {
          const isUser = message.sender === 'user';
          const isError = message.status === 'failed';

          return (
            <div
              key={message.id}
              className={`flex min-w-0 flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              {message.text && (
                <div className="flex flex-col gap-1 max-w-[90%]">
                  <p
                    role={isError ? 'alert' : undefined}
                    className={`break-words rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                      isUser
                        ? 'bg-nutri-primary text-white'
                        : isError
                        ? 'bg-red-50 text-nutri-error border border-red-200'
                        : 'bg-nutri-surface text-nutri-ink'
                    }`}
                  >
                    {message.text}
                  </p>
                  {isError && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(message.id)}
                      className={`inline-flex items-center gap-1 text-xs text-nutri-primary hover:underline font-medium self-end mt-0.5 ${focusStyle}`}
                    >
                      <RotateCcw size={12} aria-hidden="true" />
                      <span>Gửi lại</span>
                    </button>
                  )}
                </div>
              )}

              {/* Render Action Card if provided */}
              {renderCard ? (
                renderCard(message)
              ) : null}

              {message.disclaimer && (
                <p className="mt-2 text-xs leading-5 text-nutri-muted">
                  {message.disclaimer}
                </p>
              )}
            </div>
          );
        })}

        {isSending && (
          <div className="flex flex-col items-start">
            <TypingIndicator />
          </div>
        )}
      </div>

      {/* Floating "Tin nhắn mới ↓" Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={onScrollToBottom}
          aria-label="Cuộn xuống tin nhắn mới nhất"
          className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full bg-nutri-dark/80 backdrop-blur text-white px-3 py-1.5 text-xs shadow-lg hover:bg-nutri-dark transition-all duration-200 animate-fade-in z-10"
        >
          <span>Tin nhắn mới</span>
          <ArrowDown size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
