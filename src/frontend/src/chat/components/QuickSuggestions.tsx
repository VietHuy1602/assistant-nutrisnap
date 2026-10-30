
export interface PromptItem {
  label: string;
  message: string;
}

export const DEFAULT_PROMPTS: PromptItem[] = [
  { label: '💡 Calo & Đạm hôm nay', message: 'Hôm nay mình đã ăn bao nhiêu calo và còn thiếu bao nhiêu đạm?' },
  { label: '🍱 Gợi ý thực đơn', message: 'Gợi ý thực đơn vừa ngân sách hôm nay' },
  { label: '🔄 Đổi món giàu đạm', message: 'Gợi ý đổi món giàu Protein hơn' },
  { label: '📈 Xu hướng & Thói quen', message: 'Phân tích xu hướng cân nặng & thói quen của tôi' },
  { label: '🍜 Ghi nhận bữa ăn', message: 'Ghi nhận nhanh bữa ăn vừa dùng' },
];

const focusStyle = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

interface QuickSuggestionsProps {
  disabled?: boolean;
  onSelect: (message: string) => void;
  prompts?: PromptItem[];
}

export function QuickSuggestions({
  disabled = false,
  onSelect,
  prompts = DEFAULT_PROMPTS,
}: QuickSuggestionsProps) {
  return (
    <div role="group" aria-label="Gợi ý bắt đầu trò chuyện" className="grid min-w-0 grid-cols-2 gap-2 border-b border-nutri-border/60 bg-nutri-surface px-4 py-3">
      {prompts.map((prompt) => (
        <button
          key={prompt.message}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt.message)}
          className={`min-h-12 min-w-0 whitespace-normal break-words rounded-xl border border-nutri-border bg-nutri-panel px-3 py-2 text-left text-sm leading-5 text-nutri-muted hover:text-nutri-dark disabled:opacity-50 ${focusStyle}`}
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}
