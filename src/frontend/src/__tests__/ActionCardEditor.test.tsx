import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionCardEditor } from '../chat/components/ActionCardEditor';
import type { ActionCardModel } from '../chat/types';

const previewState = vi.hoisted(() => ({ status: 'error', error: 'Máy chủ chưa phản hồi', preview: null as null | { items: { food_id: number; estimated_gram: number }[]; total_calories: number } }));
vi.mock('../hooks/useMealPreview', () => ({ useMealPreview: () => previewState }));
const card: ActionCardModel = { id: 'editor', kind: 'log_meal', state: 'pending', mealType: 'lunch', items: [{ food_id: 4, food_name: 'Món kiểm thử', estimated_gram: 100 }] };
beforeEach(() => { previewState.status = 'error'; previewState.error = 'Máy chủ chưa phản hồi'; previewState.preview = null; });

describe('ActionCardEditor — presentation with simulated preview', () => {
  it('does not substitute old totals or permit saving on preview failure', () => {
    render(<ActionCardEditor card={card} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Chưa có bản xem trước hợp lệ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận lưu' })).toBeDisabled();
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument();
  });
  it('saves only the edited draft with fresh preview and locks all inputs when saving', async () => {
    previewState.status = 'ready'; previewState.preview = { items: [{ food_id: 4, estimated_gram: 100 }], total_calories: 120 };
    const save = vi.fn();
    const cancel = vi.fn();
    const { rerender } = render(<ActionCardEditor card={card} onSave={save} onCancel={cancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ food_id: 4, food_name: 'Món kiểm thử', estimated_gram: 100 }], 'lunch');
    rerender(<ActionCardEditor card={card} onSave={save} onCancel={cancel} isSaving />);
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
  });
  it('invalidates a stale preview immediately after changing grams and retains explicit cancellation', async () => {
    previewState.status = 'ready'; previewState.preview = { items: [{ food_id: 4, estimated_gram: 100 }], total_calories: 120 };
    const cancel = vi.fn();
    render(<ActionCardEditor card={card} onSave={vi.fn()} onCancel={cancel} />);
    const input = screen.getByRole('spinbutton');
    await userEvent.clear(input); await userEvent.type(input, '200');
    expect(screen.getByRole('button', { name: 'Xác nhận lưu' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(card.items[0].estimated_gram).toBe(100);
  });
});
