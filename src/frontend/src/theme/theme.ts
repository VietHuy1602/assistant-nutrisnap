/**
 * src/frontend/src/theme/theme.ts
 * Chế độ giao diện Sáng / Tối. Chỉ lưu lựa chọn giao diện của thiết bị (không phải dữ liệu sức khỏe).
 * Áp dụng bằng class "dark" trên <html>; màu tối định nghĩa trong index.css.
 */

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'nutrisnap-theme';
const EVENT = 'nutrisnap:theme';

export function readTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Trình duyệt chặn bộ nhớ: dùng mặc định
  }
  return 'light';
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

export function setTheme(mode: ThemeMode): void {
  applyTheme(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Không lưu được thì vẫn đổi giao diện cho phiên hiện tại
  }
  window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT, { detail: mode }));
}

/** Hook đọc/đổi chế độ giao diện, đồng bộ giữa các thành phần đang hiển thị. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => readTheme());
  useEffect(() => {
    const onChange = (event: Event) => setMode((event as CustomEvent<ThemeMode>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const update = useCallback((next: ThemeMode) => setTheme(next), []);
  return [mode, update];
}
