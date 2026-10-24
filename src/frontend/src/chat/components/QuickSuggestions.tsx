
export interface PromptItem {
  label: string;
  message: string;
}

export const DEFAULT_PROMPTS: PromptItem[] = [
  { label: '💡 Calo còn lại?', message: 'Hôm nay tôi còn bao nhiêu calo?' },
  { label: '🍲 Ghi nhận phở bò', message: 'Trưa nay tôi ăn 1 tô phở bò tái' },
  { label: '🥗 Gợi ý món 40k', message: 'Gợi ý bữa tối 40k đủ đạm' },
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
    <div className="flex min-w-0 shrink-0 gap-2 overflow-x-auto border-b border-nutri-border/60 bg-nutri-surface px-4 py-3">
      {prompts.map((prompt) => (
        <button
          key={prompt.message}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt.message)}
          className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border border-nutri-border bg-nutri-panel px-3 py-2 text-xs text-nutri-muted hover:text-nutri-dark disabled:opacity-50 ${focusStyle}`}
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}
