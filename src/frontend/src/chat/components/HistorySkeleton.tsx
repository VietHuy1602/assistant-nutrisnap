
export function HistorySkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse" role="status" aria-label="Đang tải lịch sử trò chuyện...">
      <div className="flex items-start">
        <div className="h-10 w-3/4 rounded-2xl bg-nutri-surface" />
      </div>
      <div className="flex items-end justify-end">
        <div className="h-8 w-1/2 rounded-2xl bg-nutri-primary/20" />
      </div>
      <div className="flex items-start">
        <div className="h-16 w-5/6 rounded-2xl bg-nutri-surface" />
      </div>
    </div>
  );
}
