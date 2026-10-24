
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Đang chờ phản hồi từ trợ lý…"
      className="flex items-center gap-2 text-sm text-nutri-muted py-2 px-3 bg-nutri-surface rounded-2xl w-fit"
    >
      <span className="sr-only">Đang chờ phản hồi từ trợ lý…</span>
      <span className="text-xs">Đang soạn</span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-nutri-primary animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-nutri-primary animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-nutri-primary animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}
