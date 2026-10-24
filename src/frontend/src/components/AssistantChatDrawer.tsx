import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Bot, Check, X } from 'lucide-react';
import type { ActionCard } from '../types/api';
import { isApiError } from '../utils/apiError';
import {
  cancelAssistantAction,
  confirmAssistantAction,
  isMealCard,
  saveAssistantMeal,
  sendAssistantMessage,
} from '../api/assistantApi';
import { useOptionalChat, type ChatContextValue } from '../context/ChatContext';
import { useChatScroll } from '../chat/useChatScroll';
import { ChatComposer } from '../chat/components/ChatComposer';
import { QuickSuggestions, DEFAULT_PROMPTS } from '../chat/components/QuickSuggestions';
import { TypingIndicator } from '../chat/components/TypingIndicator';
import { HistorySkeleton } from '../chat/components/HistorySkeleton';
import { ArrowDown } from 'lucide-react';

let localSequence = 0;
function localId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (
    'chat-' +
    Date.now().toString(36) +
    '-' +
    (++localSequence).toString(36) +
    '-' +
    Math.random().toString(36).slice(2)
  );
}

type CardPhase = 'pending' | 'saving' | 'confirmed' | 'cancelled' | 'failed';
type MealCardState = {
  id: string;
  source: ActionCard;
  phase: CardPhase;
  error?: string;
  retryable?: boolean;
  savedCalories?: number;
};

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  card?: MealCardState;
  unsupported?: boolean;
  error?: boolean;
  disclaimer?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  username?: string;
  backgroundRef: RefObject<HTMLDivElement>;
  onMealSaved: () => void;
}

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';
const primary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-nutri-primary px-4 py-2 text-sm font-semibold text-white hover:bg-nutri-dark disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const secondary = `inline-flex min-h-11 items-center justify-center rounded-xl border border-nutri-border px-4 py-2 text-sm font-medium hover:bg-nutri-surface disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const display = (value: number) => value.toLocaleString('vi-VN');
const mealLabels: Record<string, string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
  snack: 'Bữa phụ',
};

export function AssistantChatDrawer(props: Props) {
  const globalContext = useOptionalChat();
  return <AssistantChatDrawerView {...props} chatContext={globalContext} />;
}

interface InternalViewProps extends Props {
  chatContext?: ChatContextValue;
}

function AssistantChatDrawerView({
  isOpen,
  onClose,
  username,
  backgroundRef,
  onMealSaved,
  chatContext,
}: InternalViewProps) {
  const chat = chatContext;

  // Local draft state is preserved across opening and closing the drawer
  const [draft, setDraft] = useState('');

  // Fallback messages for legacy test compatibility
  const [legacyMessages, setLegacyMessages] = useState<MessageItem[]>(() => [
    {
      id: localId(),
      sender: 'assistant',
      text: `Xin chào ${username || 'bạn'}! Tôi là Trợ lý Dinh dưỡng NutriSnap. Hôm nay bạn muốn kiểm tra calo hay ghi nhận món ăn nào?`,
    },
  ]);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const sendingLock = useRef(false);
  const cardLocks = useRef(new Set<string>());
  const mounted = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Keyboard navigation & accessibility focus trapping
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page = backgroundRef.current;
    const wasInert = page?.hasAttribute('inert');
    const overflow = document.body.style.overflow;
    page?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      if (!wasInert) page?.removeAttribute('inert');
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen, backgroundRef]);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ||
        []
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  // Smart auto-scroll
  const { containerRef, showScrollBottom, scrollToBottom, handleScroll } = useChatScroll({
    dependency: legacyMessages.length + (chat?.state.messages.length || 0),
  });

  function updateCard(id: string, changes: Partial<MealCardState>) {
    setLegacyMessages((previous) =>
      previous.map((message) =>
        message.card?.id === id
          ? { ...message, card: { ...message.card, ...changes } }
          : message
      )
    );
  }

  async function handleSend(messageText: string) {
    const text = messageText.trim();
    if (!text || text.length > 2000 || sendingLock.current) return;
    sendingLock.current = true;
    setLegacyLoading(true);

    setLegacyMessages((previous) => [
      ...previous,
      { id: localId(), sender: 'user', text },
    ]);

    try {
      const reply = await sendAssistantMessage(text);
      const card = isMealCard(reply.card)
        ? {
            id: localId(),
            source: reply.card,
            phase: reply.card.status === 'cancelled' ? ('cancelled' as const) : ('pending' as const),
          }
        : undefined;
      if (mounted.current) {
        setLegacyMessages((previous) => [
          ...previous,
          {
            id: localId(),
            sender: 'assistant',
            text: reply.text,
            card,
            unsupported: reply.card != null && !card,
            disclaimer: reply.disclaimer,
          },
        ]);
      }
    } catch {
      if (mounted.current) {
        setLegacyMessages((previous) => [
          ...previous,
          {
            id: localId(),
            sender: 'assistant',
            error: true,
            text: 'Chưa nhận được phản hồi từ trợ lý. Vui lòng kiểm tra kết nối hoặc phiên đăng nhập rồi gửi lại khi sẵn sàng.',
          },
        ]);
      }
    } finally {
      sendingLock.current = false;
      if (mounted.current) setLegacyLoading(false);
    }
  }

  async function confirmCard(card: MealCardState) {
    if (
      cardLocks.current.has(card.id) ||
      !['pending', 'failed'].includes(card.phase) ||
      (card.phase === 'failed' && !card.retryable) ||
      !isMealCard(card.source)
    ) {
      return;
    }
    cardLocks.current.add(card.id);
    updateCard(card.id, { phase: 'saving', error: undefined });
    let saved;
    const confId = card.source.confirmation_id ?? card.source.data?.confirmation_id;
    try {
      if (confId) {
        saved = await confirmAssistantAction(confId);
      } else {
        saved = await saveAssistantMeal(card.source);
      }
    } catch (error) {
      // A rejected validation request is retryable; a timeout/invalid acknowledgement may already have written.
      const retryable = isApiError(error) && (error.status === 400 || error.status === 422);
      if (retryable) cardLocks.current.delete(card.id);
      if (mounted.current) {
        updateCard(card.id, {
          phase: 'failed',
          retryable,
          error: retryable
            ? 'Máy chủ chưa chấp nhận bữa ăn. Bạn có thể thử lại hoặc hủy thẻ.'
            : 'Chưa xác minh được kết quả lưu. Hãy kiểm tra nhật ký và phiên đăng nhập trước khi ghi lại để tránh trùng bữa ăn.',
        });
      }
      return;
    }
    if (!mounted.current) return;
    updateCard(card.id, { phase: 'confirmed', savedCalories: saved.calories });
    onMealSaved();
  }

  function cancelCard(card: MealCardState) {
    if (cardLocks.current.has(card.id) || !['pending', 'failed'].includes(card.phase)) return;
    cardLocks.current.add(card.id);
    const confId = card.source.confirmation_id ?? card.source.data?.confirmation_id;
    if (confId) {
      void cancelAssistantAction(confId);
    }
    updateCard(card.id, { phase: 'cancelled', error: undefined });
  }

  if (!isOpen) return null;

  const isSending =
    legacyLoading ||
    (chatContext
      ? chatContext.state.status === 'awaitingReply' ||
        chatContext.state.status === 'sending' ||
        chatContext.state.status === 'slow'
      : false);
  const isSlow = chatContext ? chatContext.state.status === 'slow' : false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        onKeyDown={handleKey}
        className="flex h-[100dvh] min-h-0 w-full max-w-md flex-col bg-nutri-panel text-nutri-ink shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-nutri-border/60 bg-nutri-surface p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="rounded-xl bg-nutri-selected p-2 text-nutri-primary">
              <Bot aria-hidden="true" size={20} />
            </span>
            <div>
              <h2 id="assistant-title" className="text-sm font-semibold">
                Trợ lý AI NutriSnap
              </h2>
              <p className="text-xs text-nutri-muted">Dinh dưỡng · Thông tin tham khảo</p>
            </div>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Đóng trợ lý"
            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl hover:bg-nutri-selected ${focus}`}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {/* Quick Suggestions */}
        <QuickSuggestions
          disabled={isSending}
          onSelect={(msg) => void handleSend(msg)}
          prompts={DEFAULT_PROMPTS}
        />

        {/* Messages Body */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div
            ref={containerRef}
            role="log"
            aria-label="Hội thoại với trợ lý"
            aria-live="polite"
            onScroll={handleScroll}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
          >
            {chat?.state.historyStatus === 'loading' && <HistorySkeleton />}

            {legacyMessages.map((message) => (
              <div
                key={message.id}
                className={`flex min-w-0 flex-col ${
                  message.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <p
                  role={message.error ? 'alert' : undefined}
                  className={`max-w-[90%] break-words rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                    message.sender === 'user'
                      ? 'bg-nutri-primary text-white'
                      : message.error
                      ? 'bg-red-50 text-nutri-error'
                      : 'bg-nutri-surface'
                  }`}
                >
                  {message.text}
                </p>

                {message.unsupported && (
                  <p className="mt-2 text-sm text-nutri-muted">
                    Thẻ này chưa hỗ trợ lưu bữa ăn tại đây hoặc thiếu thông tin hợp lệ. Vui lòng yêu cầu trợ lý kiểm tra lại.
                  </p>
                )}

                {message.card && (
                  <section
                    aria-label="Thẻ xác nhận bữa ăn"
                    aria-busy={message.card.phase === 'saving'}
                    className="mt-3 w-full min-w-0 space-y-3 rounded-2xl border border-nutri-border bg-nutri-selected/50 p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
                      <h3>Kiểm tra trước khi lưu</h3>
                      <span>{mealLabels[message.card.source.data.meal_type] || message.card.source.data.meal_type}</span>
                    </div>

                    <ul className="space-y-2">
                      {message.card.source.data.items.map((item, index) => (
                        <li
                          key={index}
                          className="flex flex-wrap justify-between gap-2 rounded-xl bg-nutri-panel p-3 text-sm"
                        >
                          <span className="min-w-0 break-words font-medium">{item.food_name}</span>
                          <span className="text-nutri-muted">
                            {display(item.estimated_gram)} g · {display(item.calories)} kcal
                          </span>
                        </li>
                      ))}
                    </ul>

                    <p className="text-sm font-semibold">
                      Tổng ước tính trước khi lưu: {display(message.card.source.data.total_calories)} kcal
                    </p>

                    {message.card.phase === 'pending' && (
                      <p className="text-sm text-nutri-muted">Chờ bạn xác nhận · Chưa gửi yêu cầu lưu.</p>
                    )}
                    {message.card.phase === 'saving' && (
                      <p role="status" className="text-sm text-nutri-dark">
                        Đang lưu bữa ăn…
                      </p>
                    )}
                    {message.card.phase === 'confirmed' && (
                      <p
                        role="status"
                        className="flex items-center gap-2 text-sm font-semibold text-nutri-dark"
                      >
                        <Check aria-hidden="true" size={18} />
                        Đã lưu vào nhật ký · {display(message.card.savedCalories!)} kcal (máy chủ xác nhận).
                      </p>
                    )}
                    {message.card.phase === 'cancelled' && (
                      <p role="status" className="text-sm text-nutri-muted">
                        Đã hủy · Bữa ăn chưa được lưu
                      </p>
                    )}
                    {message.card.phase === 'failed' && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-nutri-error"
                      >
                        <p className="font-semibold">Chưa xác nhận lưu thành công</p>
                        <p className="mt-1 leading-6">{message.card.error}</p>
                      </div>
                    )}

                    {(message.card.phase === 'pending' ||
                      message.card.phase === 'saving' ||
                      (message.card.phase === 'failed' && message.card.retryable)) && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={message.card.phase === 'saving'}
                          onClick={() => void confirmCard(message.card!)}
                          className={`${primary} flex-1`}
                        >
                          {message.card.phase === 'failed' ? 'Thử lưu lại' : 'Xác nhận lưu'}
                        </button>
                        <button
                          type="button"
                          disabled={message.card.phase === 'saving'}
                          onClick={() => cancelCard(message.card!)}
                          className={secondary}
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {message.disclaimer && (
                  <p className="mt-2 text-xs leading-5 text-nutri-muted">{message.disclaimer}</p>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex flex-col items-start">
                <TypingIndicator />
              </div>
            )}
          </div>

          {/* New message pill */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              aria-label="Cuộn xuống tin nhắn mới nhất"
              className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full bg-nutri-dark/80 backdrop-blur text-white px-3 py-1.5 text-xs shadow-lg hover:bg-nutri-dark transition-all duration-200 animate-fade-in z-10"
            >
              <span>Tin nhắn mới</span>
              <ArrowDown size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Footer disclaimer */}
        <div className="border-t border-nutri-border/40 px-3 py-1.5 bg-nutri-surface text-center">
          <p className="text-[11px] text-nutri-muted">
            Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo. Trợ lý không thay thế tư vấn y khoa.
          </p>
        </div>

        {/* Composer */}
        <ChatComposer
          isSending={isSending}
          isSlow={isSlow}
          onSend={handleSend}
          onCancel={chatContext?.cancel}
          draft={draft}
          onDraftChange={setDraft}
        />
      </div>
    </div>
  );
}
