
interface ChatEmptyStateProps {
  username?: string;
}

export function ChatEmptyState({ username }: ChatEmptyStateProps) {
  return (
    <div className="flex min-w-0 flex-col items-start">
      <p className="w-full break-words rounded-2xl bg-nutri-surface p-4 text-sm leading-6">
        {`Xin chào ${username || 'bạn'}! Tôi là Trợ lý Dinh dưỡng NutriSnap. Hôm nay bạn muốn kiểm tra calo hay ghi nhận món ăn nào?`}
      </p>
    </div>
  );
}
