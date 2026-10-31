import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealReviewList } from '../components/meal/MealReviewList';
import { initialDraftState } from '../components/meal/mealDraftReducer';

vi.mock('../hooks/useMealPreview', () => ({
  useMealPreview: () => ({ preview: null, status: 'idle', error: null, retry: vi.fn() }),
}));
afterEach(cleanup);

describe('Capture review without optional seasoning notes', () => {
  it('removes the complete notes section even when a draft retains an existing note', () => {
    const { container } = render(<MealReviewList state={{ ...initialDraftState, voiceNote: 'Nước chấm riêng' }} dispatch={vi.fn()} onConfirmSave={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.queryByText(/Ghi chú gia vị|Chế biến|Nói ghi chú|Áp dụng vào bữa ăn|Nước chấm riêng/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /giọng nói/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' })).toBeDisabled();
  });

  it('preserves confirmation, cancellation, portion editing and add-food controls', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const cancel = vi.fn();
    const dispatch = vi.fn();
    render(<MealReviewList state={{ ...initialDraftState, items: [{ key: 'test-food', food_id: 1, food_name: 'Phở bò tái', estimated_gram: 400, source: 'manual' }] }} dispatch={dispatch} onConfirmSave={confirm} onCancel={cancel} />);
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm món khác' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
