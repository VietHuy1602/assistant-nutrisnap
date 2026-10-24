/**
 * src/frontend/src/hooks/useSpeechRecognition.ts
 * Hook managing browser Web Speech API (vi-VN) transcription.
 * PRIVACY GUARANTEE: Pure browser SpeechRecognition without audio file recording, Blobs, or audio streams.
 * Client-only speech-to-text with 15s auto-stop and manual fallback.
 * ADR-W5-05, ADR-W5-06, ASC-16 through ASC-20 of NS-FE-W5-001.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechRecognitionOptions {
  lang?: string;
  maxDurationSeconds?: number;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
}

export function useSpeechRecognition({
  lang = 'vi-VN',
  maxDurationSeconds = 15,
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(maxDurationSeconds);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const cleanupTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    cleanupTimers();
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition already stopped
      }
    }
    setIsListening(false);
  }, [cleanupTimers, isListening]);

  const startListening = useCallback(() => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setSecondsRemaining(maxDurationSeconds);

    if (!isSupported) {
      const msg = 'Trình duyệt chưa hỗ trợ nhận diện giọng nói. Vui lòng nhập bằng văn bản.';
      setError(msg);
      onError?.(msg);
      return;
    }

    try {
      cleanupTimers();

      const SpeechRecognitionConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionConstructor) {
        throw new Error('SpeechRecognition not available');
      }

      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalStr = '';
        let interimStr = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript ?? '';
          if (res.isFinal) {
            finalStr += text;
          } else {
            interimStr += text;
          }
        }

        if (finalStr) {
          setTranscript((prev) => {
            const next = prev ? `${prev} ${finalStr}`.trim() : finalStr.trim();
            onResult?.(next, true);
            return next;
          });
          setInterimTranscript('');
        } else if (interimStr) {
          setInterimTranscript(interimStr);
          onResult?.(interimStr, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        cleanupTimers();
        setIsListening(false);

        let userMessage = 'Có lỗi khi nhận diện giọng nói. Bạn có thể nhập ghi chú bằng tay.';
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          userMessage =
            'Quyền truy cập micro bị từ chối. Bạn vẫn có thể nhập ghi chú bằng bàn phím.';
        } else if (event.error === 'no-speech') {
          userMessage = 'Chưa nghe thấy giọng nói. Hãy thử lại hoặc nhập bằng tay.';
        } else if (event.error === 'network') {
          userMessage = 'Lỗi kết nối mạng khi nhận diện. Bạn có thể nhập ghi chú bằng tay.';
        }

        setError(userMessage);
        onError?.(userMessage);
      };

      recognition.onend = () => {
        cleanupTimers();
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Countdown timer for 15s limit
      countdownIntervalRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            cleanupTimers();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-stop after maxDurationSeconds
      autoStopTimerRef.current = setTimeout(() => {
        stopListening();
      }, maxDurationSeconds * 1000);
    } catch {
      cleanupTimers();
      setIsListening(false);
      const msg = 'Không thể khởi động micro. Vui lòng nhập bằng văn bản.';
      setError(msg);
      onError?.(msg);
    }
  }, [isSupported, lang, maxDurationSeconds, cleanupTimers, stopListening, onResult, onError]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [cleanupTimers]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    fullTranscript: (transcript + (interimTranscript ? ` ${interimTranscript}` : '')).trim(),
    error,
    secondsRemaining,
    startListening,
    stopListening,
    resetTranscript,
  };
}
