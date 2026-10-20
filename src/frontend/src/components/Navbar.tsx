import React from 'react';
import { Salad, Target, LayoutDashboard, MessageSquareText } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenChat: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, onOpenChat }) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#107C41]">
            <Salad className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Nutri<span className="text-[#107C41]">Snap</span>
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-[#107C41]">
              AI Assistant
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'dashboard'
                ? 'bg-emerald-50 text-[#107C41]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Tổng quan</span>
          </button>

          <button
            onClick={() => onSelectTab('goals')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'goals'
                ? 'bg-emerald-50 text-[#107C41]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">Mục tiêu</span>
          </button>

          {/* Quick Chat Assistant Trigger */}
          <button
            onClick={onOpenChat}
            className="flex items-center gap-1.5 px-3.5 py-2 ml-2 rounded-lg text-sm font-medium bg-[#107C41] hover:bg-[#0B522B] text-white transition-all shadow-sm active:scale-95"
          >
            <MessageSquareText className="w-4 h-4" />
            <span>Trợ lý AI</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
