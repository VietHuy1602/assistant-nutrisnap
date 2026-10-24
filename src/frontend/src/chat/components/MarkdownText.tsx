import React from 'react';

/**
 * Phân tích cú pháp inline markdown đơn giản và an toàn (không dùng dangerouslySetInnerHTML):
 * - **in đậm** -> <strong>
 * - *in nghiêng* hoặc _in nghiêng_ -> <em>
 * - `code` -> <code>
 */
export function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 font-mono text-xs text-nutri-dark"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-nutri-ink">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      parts.push(
        <em key={key} className="italic text-nutri-ink/90">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      parts.push(token);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

interface MarkdownTextProps {
  content: string;
  isUser?: boolean;
}

/**
 * Hiển thị mượt mà nội dung văn bản Markdown từ Trợ lý AI NutriSnap:
 * Hỗ trợ in đậm (**text**), in nghiêng (*text*), danh sách bullet (* / -), danh sách đánh số (1.), và ngắt dòng.
 */
export function MarkdownText({ content, isUser }: MarkdownTextProps) {
  if (isUser) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      const ListTag = currentList.type;
      elements.push(
        <ListTag
          key={`list-${elements.length}`}
          className={`my-1 space-y-0.5 pl-4 ${
            currentList.type === 'ul' ? 'list-disc' : 'list-decimal'
          }`}
        >
          {currentList.items.map((item, i) => (
            <li key={i} className="leading-6">
              {item}
            </li>
          ))}
        </ListTag>
      );
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      if (elements.length > 0 && i < lines.length - 1 && lines[i + 1].trim()) {
        elements.push(<div key={`space-${i}`} className="h-1.5" />);
      }
      continue;
    }

    // Danh sách không thứ tự: "* " hoặc "- "
    const bulletMatch = rawLine.match(/^(\s*)[*-]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(parseInlineMarkdown(bulletMatch[2]));
      continue;
    }

    // Danh sách có thứ tự: "1. ", "2. ",...
    const numberedMatch = rawLine.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numberedMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(parseInlineMarkdown(numberedMatch[2]));
      continue;
    }

    // Dòng văn bản thông thường
    flushList();
    elements.push(
      <p key={`line-${i}`} className="leading-6">
        {parseInlineMarkdown(rawLine)}
      </p>
    );
  }

  flushList();

  return <div className="space-y-0.5 break-words [overflow-wrap:anywhere]">{elements}</div>;
}
