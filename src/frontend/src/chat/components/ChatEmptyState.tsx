
interface ChatEmptyStateProps {
  username?: string;
}

export function ChatEmptyState({ username }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-start p-4">
      <p className="max-w-[90%] break-words rounded-2xl bg-nutri-surface px-4 py-2.5 text-sm leading-6">
        {`Xin chào ${username || 'bạn'}! Tôi là Trợ lý Dinh dưỡng NutriSnap. Hôm nay bạn muốn kiểm tra calo hay ghi nhận món ăn nào?`}
      </p>
    </div>
  );
}
