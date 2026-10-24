import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, XCircle } from 'lucide-react';
import { MESSAGE_MAX_LENGTH } from '../config';

interface ChatComposerProps {
  isSending: boolean;
  isSlow?: boolean;
  onSend: (message: string) => void | Promise<void>;
  onCancel?: () => void;
  draft?: string;
  onDraftChange?: (draft: string) => void;
}

const focusStyle = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';
const primaryBtn = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-nutri-primary px-3 py-2 text-sm font-semibold text-white hover:bg-nutri-dark disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`;
const cancelBtn = `inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 ${focusStyle}`;

export function ChatComposer({
  isSending,
  isSlow = false,
  onSend,
  onCancel,
  draft,
  onDraftChange,
}: ChatComposerProps) {
  const [internalText, setInternalText] = useState(draft || '');
  const isComposingRef = useRef(false);

  const text = draft !== undefined ? draft : internalText;
  const setText = (val: string) => {
    if (draft === undefined) {
      setInternalText(val);
    }
    onDraftChange?.(val);
  };

  const trimmed = text.trim();
  const isOverLimit = text.length > MESSAGE_MAX_LENGTH;
  const canSend = trimmed.length > 0 && !isOverLimit && !isSending;

  const handleSend = () => {
    if (!canSend) return;
    const msg = text;
    setText('');
    void onSend(msg);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Check IME composition status for safe Vietnamese typing
    if (isComposingRef.current || (e.nativeEvent as unknown as { isComposing?: boolean }).isComposing || e.keyCode === 229) {
      return;
    }

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-nutri-border/60 p-3 bg-nutri-panel">
      {text.length > MESSAGE_MAX_LENGTH * 0.8 && (
        <div className="flex justify-end pb-1 px-1">
          <span
            className={`text-xs ${
              isOverLimit ? 'text-red-500 font-semibold' : 'text-nutri-muted'
            }`}
          >
            {text.length}/{MESSAGE_MAX_LENGTH}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor="assistant-message" className="sr-only">
          Tin nhắn cho trợ lý
        </label>
        <input
          id="assistant-message"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Nhập câu hỏi hoặc món ăn..."
          disabled={isSending}
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-nutri-border px-3.5 py-2 text-base text-nutri-ink focus:outline-none focus:ring-2 focus:ring-nutri-focus disabled:opacity-75 disabled:bg-slate-50"
        />

        {isSending && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Hủy yêu cầu đang gửi"
            title="Hủy"
            className={cancelBtn}
          >
            <XCircle size={16} aria-hidden="true" />
            <span>Hủy</span>
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Gửi tin nhắn"
            disabled={!canSend}
            className={`${primaryBtn} min-w-11 shrink-0 px-3`}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {isSlow && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg leading-5">
          Việc này đang mất nhiều thời gian hơn bình thường. Bạn có thể chờ thêm hoặc hủy.
        </p>
      )}
    </form>
  );
}
