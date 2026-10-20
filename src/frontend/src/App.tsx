import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { GoalPlannerPage } from './pages/GoalPlannerPage';
import { LoginPage } from './pages/LoginPage';
import { apiClient } from './api/client';
import { ChatMessageResponse, ActionCard } from './types/api';
import { Send, X, Bot, Check } from 'lucide-react';

export const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'goals'>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Assistant Chat State
  const [inputMsg, setInputMsg] = useState('');
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: 'user' | 'assistant'; text: string; actionCard?: ActionCard }>
  >([
    {
      sender: 'assistant',
      text: 'Xin chào Thành Đạt! Tôi là Trợ lý Dinh dưỡng NutriSnap. Hôm nay bạn muốn kiểm tra calo hay ghi nhận món ăn nào?',
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
          text: `✅ Đã lưu ${card.data.items.length} món (${card.data.total_calories} kcal) vào nhật ký thành công! Dashboard đã được cập nhật.`,
        },
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  if (!isLoggedIn) {
    return (
      <LoginPage
        onLoginSuccess={(hasGoal) => {
          setIsLoggedIn(true);
          setCurrentTab(hasGoal ? 'dashboard' : 'goals');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab as any)}
        onOpenChat={() => setIsChatOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'dashboard' && <DashboardPage />}
        {currentTab === 'goals' && <GoalPlannerPage />}
      </main>

      {/* Assistant Chat Drawer */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#107C41] flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">Trợ lý AI NutriSnap</h3>
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Sẵn sàng hỗ trợ
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Prompts */}
            <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100 flex gap-2 overflow-x-auto text-xs whitespace-nowrap scrollbar-none">
              <button
                onClick={() => handleSendChat('Hôm nay tôi còn bao nhiêu calo?')}
                className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-[#107C41]"
              >
                💡 Calo còn lại?
              </button>
              <button
                onClick={() => handleSendChat('Trưa nay tôi ăn 1 tô phở bò tái')}
                className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-[#107C41]"
              >
                🍲 Ghi nhận phở bò
              </button>
              <button
                onClick={() => handleSendChat('Gợi ý bữa tối 40k đủ đạm')}
                className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-[#107C41]"
              >
                🥗 Gợi ý món 40k
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender === 'user'
                        ? 'bg-[#107C41] text-white rounded-br-xs'
                        : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Two-Step Confirmation Action Card */}
                  {msg.actionCard && (
                    <div className="mt-3 w-full bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                        <span>📋 XÁC NHẬN BỮA ĂN (TWO-STEP FLOW)</span>
                        <span className="capitalize">{msg.actionCard.data.meal_type}</span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {msg.actionCard.data.items.map((it, i) => (
                          <div key={i} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                            <span className="font-medium text-slate-700">{it.food_name}</span>
                            <span className="text-slate-500">{it.estimated_gram}g (~{it.calories} kcal)</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-xs font-bold text-slate-800 pt-1 border-t border-emerald-200/60">
                        <span>Tổng Calo ước tính:</span>
                        <span className="text-[#107C41]">{msg.actionCard.data.total_calories} kcal</span>
                      </div>

                      {msg.actionCard.status === 'pending_user_action' ? (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleConfirmActionCard(msg.actionCard!)}
                            className="flex-1 py-1.5 bg-[#107C41] hover:bg-[#0B522B] text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 shadow-xs"
                          >
                            <Check className="w-3.5 h-3.5" /> Xác nhận lưu
                          </button>
                          <button
                            onClick={() => {
                              msg.actionCard!.status = 'cancelled';
                              setChatMessages([...chatMessages]);
                            }}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Đã xác nhận lưu vào CSDL
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"></span>
                  Trợ lý đang suy nghĩ và tính toán calo...
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
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Nhập câu hỏi hoặc món ăn..."
                className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#107C41]"
              />
              <button
                type="submit"
                disabled={!inputMsg.trim() || chatLoading}
                className="p-2 rounded-xl bg-[#107C41] hover:bg-[#0B522B] text-white disabled:opacity-40 transition-all shadow-xs"
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

export default App;
