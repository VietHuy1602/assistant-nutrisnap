import { useCallback, useEffect, useRef, useState } from 'react';

interface UseChatScrollOptions {
  threshold?: number;
  dependency?: unknown;
}

export function useChatScroll({ threshold = 80, dependency }: UseChatScrollOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  const checkIsNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= threshold;
  }, [threshold]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') {
      try {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
      } catch {
        el.scrollTop = el.scrollHeight;
      }
    } else {
      el.scrollTop = el.scrollHeight;
    }
    setShowScrollBottom(false);
    isNearBottomRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    const nearBottom = checkIsNearBottom();
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);
  }, [checkIsNearBottom]);

  // When dependency changes (new message arrives), scroll to bottom if user was near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    } else {
      setShowScrollBottom(true);
    }
  }, [dependency, scrollToBottom]);

  return {
    containerRef,
    showScrollBottom,
    scrollToBottom,
    handleScroll,
  };
}
