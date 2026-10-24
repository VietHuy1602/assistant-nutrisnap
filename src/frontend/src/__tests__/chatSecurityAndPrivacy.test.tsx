import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAssistantResponse } from '../api/chatContract';
import { buildLogPayload } from '../chat/confirmStrategy';
import { ActionConfirmationCard } from '../chat/components/ActionConfirmationCard';
import type { ActionCardModel } from '../chat/types';

describe('Chat Security & Privacy Tests (Step 9 — N1-N6 Rules)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('N3: Strict In-Memory Session (No localStorage / sessionStorage)', () => {
    it('never calls localStorage.setItem or getItem during contract normalization', () => {
      const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
      const getItemSpy = vi.spyOn(window.localStorage, 'getItem');

      const raw = {
        reply_text: 'Xin chào bạn, calo hôm nay còn 500 kcal.',
        session_id: 'session-secret-999',
        action_card: {
          kind: 'log_meal',
          data: {
            meal_type: 'lunch',
            items: [{ food_id: 1, food_name: 'Phở', estimated_gram: 200, calories: 300 }],
            total_calories: 300,
          },
        },
      };

      const result = normalizeAssistantResponse(raw);
      expect(result.sessionId).toBe('session-secret-999');

      expect(setItemSpy).not.toHaveBeenCalled();
      expect(getItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
    });

    it('never calls sessionStorage.setItem or getItem during payload building', () => {
      const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');
      const getItemSpy = vi.spyOn(window.sessionStorage, 'getItem');

      const sampleCard: ActionCardModel = {
        id: 'card-1',
        kind: 'log_meal',
        state: 'pending',
        mealType: 'dinner',
        items: [{ food_id: 4, food_name: 'Cơm', estimated_gram: 150 }],
        totals: { calories: 200 },
      };

      buildLogPayload(sampleCard);

      expect(setItemSpy).not.toHaveBeenCalled();
      expect(getItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
    });
  });

  describe('M2 / N6: Zero-Trust Payload (Never include user_id)', () => {
    it('buildLogPayload produces exactly meal_type, items and is_confirmed=true — NO user_id', () => {
      const sampleCard: ActionCardModel = {
        id: 'card-1',
        kind: 'log_meal',
        state: 'pending',
        mealType: 'dinner',
        items: [
          { food_id: 4, food_name: 'Cơm trắng', estimated_gram: 150 },
          { food_id: 5, food_name: 'Thịt kho', estimated_gram: 100 },
        ],
        totals: { calories: 450 },
      };

      const payload = buildLogPayload(sampleCard) as unknown as Record<string, unknown>;

      // Strict Zero-Trust assertions
      expect(payload).not.toHaveProperty('user_id');
      expect(payload).not.toHaveProperty('userId');
      expect(payload).not.toHaveProperty('account_id');
      expect(payload.meal_type).toBe('dinner');
      expect(payload.is_confirmed).toBe(true);
      expect(payload.items).toEqual([
        { food_id: 4, estimated_gram: 150, food_name: 'Cơm trắng' },
        { food_id: 5, estimated_gram: 100, food_name: 'Thịt kho' },
      ]);
    });
  });

  describe('XSS Prevention & Safe Text Rendering', () => {
    it('sanitizes and treats script injection in assistant reply text as pure string without execution', () => {
      const xssPayload = '<script>window.evilInjected = true;</script><b>Đậm</b>';
      const raw = {
        reply_text: xssPayload,
      };

      const turn = normalizeAssistantResponse(raw);
      expect(turn.text).toBe(xssPayload);

      // Render to DOM via standard React text node
      render(<div data-testid="chat-bubble">{turn.text}</div>);

      const bubble = screen.getByTestId('chat-bubble');
      // Must be rendered as plain text content, not parsed HTML tags
      expect(bubble.textContent).toBe(xssPayload);
      expect(bubble.querySelector('script')).toBeNull();
      expect(bubble.querySelector('b')).toBeNull();
      expect((window as unknown as { evilInjected?: boolean }).evilInjected).toBeUndefined();
    });

    it('renders food names containing malicious HTML safely as plain text in ActionConfirmationCard', () => {
      const maliciousCard: ActionCardModel = {
        id: 'card-xss',
        kind: 'log_meal',
        state: 'pending',
        mealType: 'lunch',
        items: [
          {
            food_id: 99,
            food_name: '<img src=x onerror="window.malicious=true" />Phở gà',
            estimated_gram: 200,
            calories: 300,
          },
        ],
        totals: { calories: 300 },
      };

      render(
        <ActionConfirmationCard
          card={maliciousCard}
          phase="pending"
          onConfirm={vi.fn()}
        />,
      );

      // Verify that the img tag is NOT created in DOM
      expect(document.querySelector('img[src="x"]')).toBeNull();
      expect(screen.getByText(/<img src=x onerror="window.malicious=true" \/>Phở gà/)).toBeInTheDocument();
      expect((window as unknown as { malicious?: boolean }).malicious).toBeUndefined();
    });
  });
});
