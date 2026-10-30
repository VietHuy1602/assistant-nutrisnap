import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Bot, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../context/ChatContext';
import { useChatScroll } from '../chat/useChatScroll';
import { ChatComposer } from '../chat/components/ChatComposer';
import { QuickSuggestions } from '../chat/components/QuickSuggestions';
import { HistorySkeleton } from '../chat/components/HistorySkeleton';
import { MessageList } from '../chat/components/MessageList';
import { ActionConfirmationCard } from '../chat/components/ActionConfirmationCard';
import styles from '../chat/components/AssistantSurface.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  username?: string;
  backgroundRef: RefObject<HTMLDivElement>;
  onMealSaved: () => void;
}

export function AssistantChatDrawer({ isOpen, onClose, username, backgroundRef, onMealSaved }: Props) {
  const chat = useChat();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [aiMode, setAiMode] = useState<'live' | 'fallback'>('fallback');
  const dialog = useRef<HTMLDivElement>(null);
  const isSending = chat.state.status !== 'idle';
  const scroll = useChatScroll({ dependency: chat.state.messages.length });

  useEffect(() => { setDraft(''); }, [username]);
  useEffect(() => {
    if (!isOpen) return;
    const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api/v1';
    const baseUrl = rawBaseUrl.endsWith('/api/v1') ? rawBaseUrl : `${rawBaseUrl.replace(/\/+$/, '')}/api/v1`;
    fetch(`${baseUrl}/assistant/health`)
      .then(res => res.json())
      .then(data => {
        if (data?.mode === 'live' || data?.status === 'online') setAiMode('live');
        else setAiMode('fallback');
      })
      .catch(() => setAiMode('fallback'));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page = backgroundRef.current;
    const wasInert = page?.hasAttribute('inert');
    const overflow = document.body.style.overflow;
    page?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    (dialog.current?.querySelector<HTMLElement>('textarea:not(:disabled)') ?? dialog.current?.querySelector<HTMLElement>('button'))?.focus();
    return () => {
      if (!wasInert) page?.removeAttribute('inert');
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen, backgroundRef]);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
    ) ?? []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  // The drawer stays mounted; only its visible DOM closes. Conversation lives in ChatProvider.
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="assistant-title" onKeyDown={handleKey}
        className={`${styles.assistant} flex h-[100dvh] min-h-0 w-full max-w-md flex-col bg-nutri-panel text-nutri-ink shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-nutri-border/60 bg-nutri-surface p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="rounded-xl bg-nutri-selected p-2 text-nutri-primary"><Bot aria-hidden="true" size={20} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 id="assistant-title" className="text-base leading-6 font-semibold">Trợ lý AI NutriSnap</h2>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                  aiMode === 'live' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-300'
                }`}>
                  {aiMode === 'live' ? 'AI đang kết nối' : 'Chế độ cơ bản'}
                </span>
              </div>
              <p className="text-xs text-nutri-muted">Dinh dưỡng · Thông tin tham khảo</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng trợ lý"
            className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl hover:bg-nutri-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="min-w-0 max-h-[28dvh] shrink-0 overflow-y-auto overscroll-contain">
        <QuickSuggestions disabled={isSending} onSelect={message => void chat.send(message)} />
        {chat.state.historyStatus === 'loading' && <HistorySkeleton />}
        {chat.state.historyStatus === 'error' && <div role="status" className="shrink-0 px-4 py-2 text-sm text-nutri-muted">
          Chưa tải được lịch sử. Bạn vẫn có thể trò chuyện mới.
          <button type="button" onClick={() => void chat.loadHistory()} className="ml-2 min-h-11 rounded-lg px-2 text-nutri-primary focus-visible:ring-2 focus-visible:ring-nutri-focus">Thử tải lại lịch sử</button>
        </div>}
        </div>
        <MessageList messages={chat.state.messages} username={username} isSending={isSending}
          containerRef={scroll.containerRef} showScrollBottom={scroll.showScrollBottom}
          onScroll={scroll.handleScroll} onScrollToBottom={() => scroll.scrollToBottom(true)}
          onRetry={chat.retry} renderCard={message => {
            const card = message.cardId ? chat.state.cards[message.cardId] : undefined;
            return card ? <ActionConfirmationCard card={card} onMealSaved={onMealSaved} onNavigateDashboard={() => { onClose(); navigate('/'); }} /> : null;
          }} />
        <div className="shrink-0 border-t border-nutri-border/40 bg-nutri-surface px-3 py-1.5 text-center">
          <p className="text-[11px] text-nutri-muted">Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo. Trợ lý không thay thế tư vấn y khoa.</p>
        </div>
        <ChatComposer isSending={isSending} isSlow={chat.state.status === 'slow'} onSend={chat.send}
          onCancel={chat.cancel} draft={draft} onDraftChange={setDraft} />
      </div>
    </div>
  );
}
