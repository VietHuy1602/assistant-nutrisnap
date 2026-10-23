import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Bot, Send, X, Check, Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { ChatMessageResponse, ActionCard } from '../types/api';

export interface AppShellContext {
  openChat: () => void;
}

export const AppShell: React.FC = () => {
  const { user, hasGoal } = useAuth();
  const location = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isChatOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const page = pageRef.current;
    page?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      page?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isChatOpen]);

  const handleDialogKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setIsChatOpen(false); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  // Assistant Chat State
  const [inputMsg, setInputMsg] = useState('');
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: 'user' | 'assistant'; text: string; actionCard?: ActionCard }>
  >([
    {
      sender: 'assistant',
      text: `Xin chào ${user?.username || 'bạn'}! Tôi là Trợ lý Dinh dưỡng NutriSnap. Hôm nay bạn muốn kiểm tra calo hay ghi nhận món ăn nào?`,
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const handleSendChat = async (messageText?: string) => {
    const textToSend = messageText || inputMsg;
    if (!textToSend.trim() || chatLoading) return;

    // Push user message
    const newHistory = [...chatMessages, { sender: 'user' as const, text: textToSend }];
    setChatMessages(newHistory);
    setInputMsg('');
    setChatLoading(true);

    try {
      const res = await apiClient.post<ChatMessageResponse>('/assistant/chat', {
        session_id: 1,
        message: textToSend,
      });

      setChatMessages([
        ...newHistory,
        {
          sender: 'assistant',
          text: res.data.reply_text,
          actionCard: res.data.action_card,
        },
      ]);
    } catch (err) {
      console.error(err);
      setChatMessages([
        ...newHistory,
        {
          sender: 'assistant',
          text: 'Xin lỗi, không thể kết nối tới AI Assistant lúc này. Vui lòng thử lại sau!',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleConfirmActionCard = async (card: ActionCard) => {
    try {
      // Gửi request xác nhận lưu bữa ăn tới Backend
      await apiClient.post('/meals/log', {
        meal_type: card.data.meal_type,
        items: card.data.items,
        is_confirmed: true,
      });

      // Cập nhật trạng thái card trong hội thoại
      card.status = 'confirmed';
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `✅ Đã lưu ${card.data.items.length} món (${card.data.total_calories} kcal) vào nhật ký thành công! Bạn có thể tải lại Dashboard để xem số liệu mới.`,
        },
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-nutri-surface flex flex-col">
      <div ref={pageRef} className="flex flex-1 flex-col">
      <Navbar onOpenChat={() => setIsChatOpen(true)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <Outlet context={{ openChat: () => setIsChatOpen(true) } satisfies AppShellContext} />
      </main>
      </div>

      {/* Assistant Chat Drawer */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs transition-opacity">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="assistant-title" onKeyDown={handleDialogKey} className="w-full max-w-md bg-nutri-panel h-[100dvh] min-h-0 shadow-2xl flex flex-col text-nutri-ink">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-nutri-primary flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="assistant-title" className="font-semibold text-sm text-nutri-ink">Trợ lý AI NutriSnap</h3>
                  <span className="text-xs text-nutri-muted">Dinh dưỡng · Thông tin tham khảo</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                aria-label="Đóng trợ lý"
                ref={closeRef}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-nutri-muted hover:bg-nutri-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Prompts */}
            <div className="min-w-0 shrink-0 px-4 py-3 bg-nutri-surface border-b border-nutri-border/60 flex gap-2 overflow-x-auto text-xs whitespace-nowrap">
              <button
                type="button"
                onClick={() => handleSendChat('Hôm nay tôi còn bao nhiêu calo?')}
                disabled={chatLoading} className="min-h-11 shrink-0 px-3 py-2 rounded-full bg-nutri-panel border border-nutri-border text-nutri-muted hover:border-nutri-primary hover:text-nutri-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutri-focus disabled:opacity-50"
              >
                💡 Calo còn lại?
              </button>
              <button
                type="button"
                onClick={() => handleSendChat('Trưa nay tôi ăn 1 tô phở bò tái')}
                disabled={chatLoading} className="min-h-11 shrink-0 px-3 py-2 rounded-full bg-nutri-panel border border-nutri-border text-nutri-muted hover:border-nutri-primary hover:text-nutri-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutri-focus disabled:opacity-50"
              >
                🍲 Ghi nhận phở bò
              </button>
              <button
                type="button"
                onClick={() => handleSendChat('Gợi ý bữa tối 40k đủ đạm')}
                disabled={chatLoading} className="min-h-11 shrink-0 px-3 py-2 rounded-full bg-nutri-panel border border-nutri-border text-nutri-muted hover:border-nutri-primary hover:text-nutri-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutri-focus disabled:opacity-50"
              >
                🥗 Gợi ý món 40k
              </button>
            </div>

            {/* Chat Messages */}
            <div role="log" aria-label="Hội thoại với trợ lý" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] break-words rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender === 'user'
                        ? 'bg-nutri-primary text-white rounded-br-xs'
                        : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Two-Step Confirmation Action Card */}
                  {msg.actionCard && (
                    <div className="mt-3 w-full bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                        <span>Kiểm tra trước khi lưu</span>
                        <span className="capitalize">{msg.actionCard.data.meal_type}</span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {msg.actionCard.data.items.map((it, i) => (
                          <div key={i} className="flex flex-wrap justify-between items-center gap-2 break-words bg-white p-2 rounded-lg border border-slate-100">
                            <span className="font-medium text-slate-700">{it.food_name}</span>
                            <span className="text-slate-500">{it.estimated_gram}g (~{it.calories} kcal)</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-xs font-bold text-slate-800 pt-1 border-t border-emerald-200/60">
                        <span>Tổng Calo ước tính:</span>
                        <span className="text-nutri-primary">{msg.actionCard.data.total_calories} kcal</span>
                      </div>

                      {msg.actionCard.status === 'pending_user_action' ? (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleConfirmActionCard(msg.actionCard!)}
                            className="min-h-11 flex-1 py-2 bg-nutri-primary hover:bg-nutri-dark text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
                          >
                            <Check className="w-3.5 h-3.5" /> Xác nhận lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              msg.actionCard!.status = 'cancelled';
                              setChatMessages([...chatMessages]);
                            }}
                            className="min-h-11 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className={`text-xs font-medium flex items-center gap-1 ${msg.actionCard.status === 'cancelled' ? 'text-nutri-muted' : 'text-nutri-dark'}`}>
                          {msg.actionCard.status === 'cancelled' ? 'Đã hủy · Bữa ăn chưa được lưu' : 'Đã xác nhận lưu vào nhật ký'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce motion-reduce:animate-none"></span>
                  Đang chờ phản hồi từ trợ lý…
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
            >
              <label htmlFor="assistant-message" className="sr-only">Tin nhắn cho trợ lý</label>
              <input
                id="assistant-message"
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Nhập câu hỏi hoặc món ăn..."
                className="min-w-0 min-h-11 flex-1 px-3.5 py-2 text-base rounded-xl border border-nutri-border focus:outline-none focus:ring-2 focus:ring-nutri-focus"
              />
              <button
                type="submit"
                aria-label="Gửi tin nhắn"
                disabled={!inputMsg.trim() || chatLoading}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
