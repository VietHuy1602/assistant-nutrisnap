import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Bot, Check, Send, X } from 'lucide-react';
import type { ActionCard } from '../types/api';
import { isApiError } from '../utils/apiError';
import { isMealCard, saveAssistantMeal, sendAssistantMessage } from '../api/assistantApi';

let localSequence = 0;
function localId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'chat-' + Date.now().toString(36) + '-' + (++localSequence).toString(36) + '-' + Math.random().toString(36).slice(2);
}

type CardPhase = 'pending' | 'saving' | 'confirmed' | 'cancelled' | 'failed';
type MealCardState = { id: string; source: ActionCard; phase: CardPhase; error?: string; retryable?: boolean; savedCalories?: number };
type Message = { id: string; sender: 'user' | 'assistant'; text: string; card?: MealCardState; unsupported?: boolean; error?: boolean; disclaimer?: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  username?: string;
  backgroundRef: RefObject<HTMLDivElement>;
  onMealSaved: () => void;
}

const prompts = [
  { label: '💡 Calo còn lại?', message: 'Hôm nay tôi còn bao nhiêu calo?' },
  { label: '🍲 Ghi nhận phở bò', message: 'Trưa nay tôi ăn 1 tô phở bò tái' },
  { label: '🥗 Gợi ý món 40k', message: 'Gợi ý bữa tối 40k đủ đạm' },
];
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';
const primary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-nutri-primary px-4 py-2 text-sm font-semibold text-white hover:bg-nutri-dark disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const secondary = `inline-flex min-h-11 items-center justify-center rounded-xl border border-nutri-border px-4 py-2 text-sm font-medium hover:bg-nutri-surface disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const display = (value: number) => value.toLocaleString('vi-VN');
const mealLabels = { breakfast: 'Bữa sáng', lunch: 'Bữa trưa', dinner: 'Bữa tối', snack: 'Bữa phụ' };

export function AssistantChatDrawer({ isOpen, onClose, username, backgroundRef, onMealSaved }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => [{ id: localId(), sender: 'assistant', text: `Xin chào ${username || 'bạn'}! Tôi là Trợ lý Dinh dưỡng NutriSnap. Hôm nay bạn muốn kiểm tra calo hay ghi nhận món ăn nào?` }]);
  const [chatLoading, setChatLoading] = useState(false);
  const sending = useRef(false);
  // Kept independently of React's render timing so two events cannot start the same write.
  const cardLocks = useRef(new Set<string>());
  const mounted = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page = backgroundRef.current;
    const wasInert = page?.hasAttribute('inert');
    const overflow = document.body.style.overflow;
    page?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    return () => {
      if (!wasInert) page?.removeAttribute('inert');
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen, backgroundRef]);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function updateCard(id: string, changes: Partial<MealCardState>) {
    setMessages(previous => previous.map(message => message.card?.id === id ? { ...message, card: { ...message.card, ...changes } } : message));
  }

  async function send(message = input) {
    if (!message.trim() || message.length > 2000 || sending.current) return;
    sending.current = true; setChatLoading(true); setInput('');
    setMessages(previous => [...previous, { id: localId(), sender: 'user', text: message }]);
    try {
      const reply = await sendAssistantMessage(message);
      const card = isMealCard(reply.card) ? { id: localId(), source: reply.card, phase: reply.card.status === 'cancelled' ? 'cancelled' as const : 'pending' as const } : undefined;
      if (mounted.current) setMessages(previous => [...previous, { id: localId(), sender: 'assistant', text: reply.text, card, unsupported: reply.card != null && !card, disclaimer: reply.disclaimer }]);
    } catch {
      if (mounted.current) setMessages(previous => [...previous, { id: localId(), sender: 'assistant', error: true, text: 'Chưa nhận được phản hồi từ trợ lý. Vui lòng kiểm tra kết nối hoặc phiên đăng nhập rồi gửi lại khi sẵn sàng.' }]);
    } finally { sending.current = false; if (mounted.current) setChatLoading(false); }
  }

  async function confirm(card: MealCardState) {
    if (cardLocks.current.has(card.id) || !['pending', 'failed'].includes(card.phase) || (card.phase === 'failed' && !card.retryable) || !isMealCard(card.source)) return;
    cardLocks.current.add(card.id);
    updateCard(card.id, { phase: 'saving', error: undefined });
    let saved;
    try { saved = await saveAssistantMeal(card.source); }
    catch (error) {
      // A rejected validation request is retryable; a timeout/invalid acknowledgement may already have written.
      const retryable = isApiError(error) && (error.status === 400 || error.status === 422);
      if (retryable) cardLocks.current.delete(card.id);
      if (mounted.current) updateCard(card.id, { phase: 'failed', retryable, error: retryable
        ? 'Máy chủ chưa chấp nhận bữa ăn. Bạn có thể thử lại hoặc hủy thẻ.'
        : 'Chưa xác minh được kết quả lưu. Hãy kiểm tra nhật ký và phiên đăng nhập trước khi ghi lại để tránh trùng bữa ăn.' });
      return;
    }
    if (!mounted.current) return;
    updateCard(card.id, { phase: 'confirmed', savedCalories: saved.calories });
    // This callback only invalidates Dashboard data; a refresh failure must never undo the save result.
    onMealSaved();
  }

  function cancel(card: MealCardState) {
    if (cardLocks.current.has(card.id) || !['pending', 'failed'].includes(card.phase)) return;
    cardLocks.current.add(card.id);
    updateCard(card.id, { phase: 'cancelled', error: undefined });
  }

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="assistant-title" onKeyDown={handleKey} className="flex h-[100dvh] min-h-0 w-full max-w-md flex-col bg-nutri-panel text-nutri-ink shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-nutri-border/60 bg-nutri-surface p-4">
        <div className="flex min-w-0 items-center gap-2.5"><span className="rounded-xl bg-nutri-selected p-2 text-nutri-primary"><Bot aria-hidden="true" size={20} /></span><div><h2 id="assistant-title" className="text-sm font-semibold">Trợ lý AI NutriSnap</h2><p className="text-xs text-nutri-muted">Dinh dưỡng · Thông tin tham khảo</p></div></div>
        <button ref={close} type="button" onClick={onClose} aria-label="Đóng trợ lý" className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl hover:bg-nutri-selected ${focus}`}><X aria-hidden="true" size={20} /></button>
      </div>
      <div className="flex min-w-0 shrink-0 gap-2 overflow-x-auto border-b border-nutri-border/60 bg-nutri-surface px-4 py-3">
        {prompts.map(prompt => <button key={prompt.message} type="button" disabled={chatLoading} onClick={() => void send(prompt.message)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border border-nutri-border bg-nutri-panel px-3 py-2 text-xs text-nutri-muted hover:text-nutri-dark disabled:opacity-50 ${focus}`}>{prompt.label}</button>)}
      </div>
      <div role="log" aria-label="Hội thoại với trợ lý" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {messages.map(message => <div key={message.id} className={`flex min-w-0 flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
          <p role={message.error ? 'alert' : undefined} className={`max-w-[90%] break-words rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.sender === 'user' ? 'bg-nutri-primary text-white' : message.error ? 'bg-red-50 text-nutri-error' : 'bg-nutri-surface'}`}>{message.text}</p>
          {message.unsupported && <p className="mt-2 text-sm text-nutri-muted">Thẻ này chưa hỗ trợ lưu bữa ăn tại đây hoặc thiếu thông tin hợp lệ. Vui lòng yêu cầu trợ lý kiểm tra lại.</p>}
          {message.card && <section aria-label="Thẻ xác nhận bữa ăn" aria-busy={message.card.phase === 'saving'} className="mt-3 w-full min-w-0 space-y-3 rounded-2xl border border-nutri-border bg-nutri-selected/50 p-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><h3>Kiểm tra trước khi lưu</h3><span>{mealLabels[message.card.source.data.meal_type]}</span></div>
            <ul className="space-y-2">{message.card.source.data.items.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-2 rounded-xl bg-nutri-panel p-3 text-sm"><span className="min-w-0 break-words font-medium">{item.food_name}</span><span className="text-nutri-muted">{display(item.estimated_gram)} g · {display(item.calories)} kcal</span></li>)}</ul>
            <p className="text-sm font-semibold">Tổng ước tính trước khi lưu: {display(message.card.source.data.total_calories)} kcal</p>
            {message.card.phase === 'pending' && <p className="text-sm text-nutri-muted">Chờ bạn xác nhận · Chưa gửi yêu cầu lưu.</p>}
            {message.card.phase === 'saving' && <p role="status" className="text-sm text-nutri-dark">Đang lưu bữa ăn…</p>}
            {message.card.phase === 'confirmed' && <p role="status" className="flex items-center gap-2 text-sm font-semibold text-nutri-dark"><Check aria-hidden="true" size={18} />Đã lưu vào nhật ký · {display(message.card.savedCalories!)} kcal (máy chủ xác nhận).</p>}
            {message.card.phase === 'cancelled' && <p role="status" className="text-sm text-nutri-muted">Đã hủy · Bữa ăn chưa được lưu</p>}
            {message.card.phase === 'failed' && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-nutri-error"><p className="font-semibold">Chưa xác nhận lưu thành công</p><p className="mt-1 leading-6">{message.card.error}</p></div>}
            {(message.card.phase === 'pending' || message.card.phase === 'saving' || (message.card.phase === 'failed' && message.card.retryable)) && <div className="flex flex-wrap gap-2">
              <button type="button" disabled={message.card.phase === 'saving'} onClick={() => void confirm(message.card!)} className={`${primary} flex-1`}>{message.card.phase === 'failed' ? 'Thử lưu lại' : 'Xác nhận lưu'}</button>
              <button type="button" disabled={message.card.phase === 'saving'} onClick={() => cancel(message.card!)} className={secondary}>Hủy</button>
            </div>}
          </section>}
          {message.disclaimer && <p className="mt-2 text-xs leading-5 text-nutri-muted">{message.disclaimer}</p>}
        </div>)}
        {chatLoading && <p role="status" className="text-sm text-nutri-muted">Đang chờ phản hồi từ trợ lý…</p>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void send(); }} className="flex items-center gap-2 border-t border-nutri-border/60 p-3">
        <label htmlFor="assistant-message" className="sr-only">Tin nhắn cho trợ lý</label>
        <input id="assistant-message" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} placeholder="Nhập câu hỏi hoặc món ăn..." className="min-h-11 min-w-0 flex-1 rounded-xl border border-nutri-border px-3.5 py-2 text-base focus:outline-none focus:ring-2 focus:ring-nutri-focus" />
        <button type="submit" aria-label="Gửi tin nhắn" disabled={!input.trim() || chatLoading} className={`${primary} min-w-11 shrink-0 px-3`}><Send size={16} aria-hidden="true" /></button>
      </form>
    </div>
  </div>;
}
