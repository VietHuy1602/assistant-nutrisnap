/**
 * src/frontend/src/hooks/useCamera.ts
 * WebRTC camera management hook adhering to ADR-W3-05 & PSC-9.
 * Đảm bảo mọi MediaStreamTrack luôn được tắt (đèn camera tắt) khi dừng/unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareImageForUpload } from '../utils/image';

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'error';

export interface UseCameraReturn {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: string | null;
  start: () => Promise<boolean>;
  stop: () => void;
  capture: () => Promise<{ blob: Blob; sizeBytes: number } | null>;
}

export function useCamera(): UseCameraReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const statusRef = useRef<CameraStatus>('idle');

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setStream(null);
    if (isMountedRef.current) {
      statusRef.current = 'idle';
      setStatus('idle');
      setError(null);
    }
  }, []);

  // Đảm bảo dọn dẹp camera ngay khi component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
        streamRef.current = null;
      }
    };
  }, []);

  // Gắn stream vào video element khi stream có giá trị
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      try {
        video.srcObject = stream;
      } catch {
        // JSDOM does not support srcObject
      }
      if (typeof video.play === 'function') {
        try {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              // Trình duyệt có thể chặn autoplay nếu chưa tương tác
            });
          }
        } catch {
          // ignore
        }
      }
    }
  }, [stream]);

  const start = useCallback(async (): Promise<boolean> => {
    if (statusRef.current === 'requesting' || statusRef.current === 'live') {
      return true;
    }

    statusRef.current = 'requesting';
    setStatus('requesting');
    setError(null);

    // Kiểm tra hỗ trợ mediaDevices trong môi trường hiện tại
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      if (isMountedRef.current) {
        statusRef.current = 'unavailable';
        setStatus('unavailable');
        setError('Thiết bị hoặc trình duyệt không hỗ trợ truy cập camera trực tiếp.');
      }
      return false;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Nếu component đã unmount trong khi chờ camera kịp mở
      if (!isMountedRef.current) {
        mediaStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
        return false;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      statusRef.current = 'live';
      setStatus('live');
      return true;
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return false;
      }

      const domError = err as DOMException;
      if (domError.name === 'NotAllowedError' || domError.name === 'PermissionDeniedError') {
        statusRef.current = 'denied';
        setStatus('denied');
        setError('Quyền truy cập camera bị từ chối. Bạn có thể cấp quyền lại hoặc tải ảnh từ máy.');
      } else if (
        domError.name === 'NotFoundError' ||
        domError.name === 'DevicesNotFoundError' ||
        domError.name === 'OverconstrainedError'
      ) {
        statusRef.current = 'unavailable';
        setStatus('unavailable');
        setError('Không tìm thấy camera khả dụng trên thiết bị này.');
      } else {
        statusRef.current = 'error';
        setStatus('error');
        setError('Không thể mở camera. Vui lòng thử tải ảnh từ thiết bị.');
      }
      return false;
    }
  }, []);

  const capture = useCallback(async (): Promise<{ blob: Blob; sizeBytes: number } | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      return null;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    // Tắt camera ngay sau khi chụp
    stop();

    return prepareImageForUpload(canvas);
  }, [stop]);

  return {
    stream,
    videoRef,
    status,
    error,
    start,
    stop,
    capture,
  };
}
