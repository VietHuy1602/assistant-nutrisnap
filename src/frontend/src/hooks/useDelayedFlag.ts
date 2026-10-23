/**
 * src/frontend/src/hooks/useDelayedFlag.ts
 * Hook trì hoãn hiển thị cờ (spinner, splash, saving indicators) một khoảng thời gian
 * (mặc định 150 ms) nhằm triệt tiêu hoàn toàn hiện tượng nhấp nháy giao diện (FOUC)
 * khi các tác vụ mạng phản hồi siêu nhanh (SAC-1, SAC-2).
 */

import { useState, useEffect } from 'react';

export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (active) {
      timer = setTimeout(() => {
        setShow(true);
      }, delayMs);
    } else {
      setShow(false);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active, delayMs]);

  return show;
}
