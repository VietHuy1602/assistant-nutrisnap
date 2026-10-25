import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { appBus, type AppEvent } from '../app/appBus';
import { ConnectivityProvider, useConnectivity } from '../app/ConnectivityProvider';

describe('Step 2: appBus & ConnectivityProvider', () => {
  beforeEach(() => {
    appBus.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    appBus.clear();
  });

  describe('appBus', () => {
    it('1. correctly emits and receives typed events', () => {
      const listener = vi.fn();
      const unsub = appBus.on('meal-logged', listener);

      const event: AppEvent = {
        type: 'meal-logged',
        at: Date.now(),
        source: 'test-flow',
      };
      appBus.emit(event);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(event);

      unsub();
      appBus.emit(event);
      expect(listener).toHaveBeenCalledTimes(1); // No new calls after unsub
    });

    it('2. STRICT SECURITY: throws error if event payload contains health data (S6, ADR-W6-07)', () => {
      const badEvent = {
        type: 'meal-logged',
        at: Date.now(),
        source: 'leak-attempt',
        calories: 500, // FORBIDDEN!
      } as unknown as AppEvent;

      expect(() => appBus.emit(badEvent)).toThrow(/appBus Security Breach/);
    });

    it('3. STRICT SECURITY: throws error if event payload contains gram or weight or food', () => {
      expect(() =>
        appBus.emit({
          type: 'habit-updated',
          at: Date.now(),
          source: 'leak',
          grams: 150,
        } as unknown as AppEvent)
      ).toThrow();

      expect(() =>
        appBus.emit({
          type: 'habit-updated',
          at: Date.now(),
          source: 'leak',
          weight: 70,
        } as unknown as AppEvent)
      ).toThrow();

      expect(() =>
        appBus.emit({
          type: 'habit-updated',
          at: Date.now(),
          source: 'leak',
          food_name: 'Phở bò',
        } as unknown as AppEvent)
      ).toThrow();
    });

    it('4. coalesces repeated events within delay window (debounce)', () => {
      vi.useFakeTimers();
      const listener = vi.fn();
      appBus.on('meal-logged', listener);

      appBus.emitCoalesced('meal-logged', 300, 'component-A');
      appBus.emitCoalesced('meal-logged', 300, 'component-B');
      appBus.emitCoalesced('meal-logged', 300, 'component-C');

      expect(listener).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(listener).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('ConnectivityProvider', () => {
    const TestConsumer: React.FC = () => {
      const { status, isOnline, isOffline, isRateLimited, triggerRateLimit, triggerUnreachable, resetStatus } =
        useConnectivity();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="isOnline">{String(isOnline)}</span>
          <span data-testid="isOffline">{String(isOffline)}</span>
          <span data-testid="isRateLimited">{String(isRateLimited)}</span>
          <button onClick={() => triggerRateLimit(3)}>Simulate 429</button>
          <button onClick={triggerUnreachable}>Simulate Unreachable</button>
          <button onClick={resetStatus}>Reset</button>
        </div>
      );
    };

    it('5. provides default online status and displays banner when offline', () => {
      render(
        <ConnectivityProvider>
          <TestConsumer />
        </ConnectivityProvider>
      );

      expect(screen.getByTestId('status').textContent).toBe('online');
      expect(screen.getByTestId('isOnline').textContent).toBe('true');

      // Dispatch offline
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(screen.getByTestId('status').textContent).toBe('offline');
      expect(screen.getByTestId('isOffline').textContent).toBe('true');
      expect(screen.getByText(/Đang offline. Bản ghi của bạn đã được lưu nháp/)).toBeInTheDocument();

      // Dispatch online
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(screen.getByTestId('status').textContent).toBe('online');
    });

    it('6. handles 429 rate limit countdown and renders friendly notice', () => {
      render(
        <ConnectivityProvider>
          <TestConsumer />
        </ConnectivityProvider>
      );

      fireEvent.click(screen.getByText('Simulate 429'));

      expect(screen.getByTestId('isRateLimited').textContent).toBe('true');
      expect(screen.getByText(/Bạn thao tác hơi nhanh/)).toBeInTheDocument();
    });

    it('7. allows manual reset from unreachable status', () => {
      render(
        <ConnectivityProvider>
          <TestConsumer />
        </ConnectivityProvider>
      );

      fireEvent.click(screen.getByText('Simulate Unreachable'));
      expect(screen.getByText(/Không thể kết nối tới máy chủ/)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Reset'));
      expect(screen.getByTestId('status').textContent).toBe('online');
    });
  });
});
