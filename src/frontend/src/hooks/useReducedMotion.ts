/**
 * src/frontend/src/hooks/useReducedMotion.ts
 * Hook to detect prefers-reduced-motion media query for accessible charts and animations.
 * WCAG 2.2 AA / ASC-8 of NS-FE-W5-001.
 */

import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (e: MediaQueryListEvent) => setMatches(e.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(update);
      return () => mediaQuery.removeListener(update);
    }
  }, []);

  return matches;
}
