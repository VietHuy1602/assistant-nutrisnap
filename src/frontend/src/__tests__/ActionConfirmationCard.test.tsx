import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionConfirmationCard } from '../chat/components/ActionConfirmationCard';
import type { ActionCardModel } from '../chat/types';

const sampleCard: ActionCardModel = {
  id: 'card-123',
  kind: 'log_meal',
  state: 'pending',
  mealType: 'lunch',
  items: [
    {
      food_id: 10,
      food_name: 'Cơm tấm sườn bì chả',
      estimated_gram: 350,
      calories: 650,
      protein_g: 25,
      carbs_g: 80,
      fat_g: 22,
    },
    {
      food_id: 11,
      food_name: 'Canh chua cá',
      estimated_gram: 200,
      calories: 120,
      protein_g: 10,
      carbs_g: 8,
      fat_g: 3,
    },
  ],
  totals: {
    calories: 770,
    protein: 35,
    carbs: 88,
    fat: 25,
  },
};

describe('ActionConfirmationCard & ActionCardEditor (Step 6)', () => {
  it('renders pending state with meal info, items, totals and action buttons', () => {
    const onConfirm = vi.fn();
    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="pending"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Kiểm tra trước khi lưu')).toBeInTheDocument();
    expect(screen.getByText('Bữa trưa')).toBeInTheDocument();
    expect(screen.getByText('Cơm tấm sườn bì chả')).toBeInTheDocument();
    expect(screen.getByText('Canh chua cá')).toBeInTheDocument();
    expect(screen.getByText('770 kcal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xác nhận lưu bữa ăn gồm 2 món/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chỉnh sửa/ })).toBeInTheDocument();
    expect(screen.getByText(/Chờ bạn xác nhận · Chưa gửi yêu cầu lưu./)).toBeInTheDocument();
  });

  it('calls onConfirm when user clicks Xác nhận lưu button', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="pending"
        onConfirm={onConfirm}
      />,
    );

    const confirmBtn = screen.getByRole('button', { name: /Xác nhận lưu/ });
    await user.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith(sampleCard);
  });

  it('locks confirm button when in confirming phase (anti double-submit)', () => {
    const onConfirm = vi.fn();
    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="confirming"
        onConfirm={onConfirm}
      />,
    );

    const section = screen.getByRole('region', { name: 'Thẻ xác nhận bữa ăn' });
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Đang lưu bữa ăn…')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /Xác nhận lưu/ });
    expect(confirmBtn).toBeDisabled();
  });

  it('removes all action buttons and shows confirmation badge when confirmed', () => {
    const onConfirm = vi.fn();
    const onNavigateDashboard = vi.fn();

    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="confirmed"
        savedCalories={770}
        onConfirm={onConfirm}
        onNavigateDashboard={onNavigateDashboard}
      />,
    );

    expect(
      screen.getByText(/Đã lưu vào nhật ký · 770 kcal \(máy chủ xác nhận\)\./),
    ).toBeInTheDocument();
    // Buttons must NOT exist in confirmed state
    expect(screen.queryByRole('button', { name: /Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chỉnh sửa/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem Dashboard' })).toBeInTheDocument();
  });

  it('shows error alert and retry button on failed phase', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="failed"
        error="Lỗi kết nối máy chủ"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Chưa xác nhận lưu thành công')).toBeInTheDocument();
    expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Thử lưu lại/ });
    await user.click(retryBtn);
    expect(onConfirm).toHaveBeenCalledWith(sampleCard);
  });

  it('handles uncertain phase: requires checking dashboard before allowing retry', async () => {
    const onConfirm = vi.fn();
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="uncertain"
        onConfirm={onConfirm}
        onNavigateDashboard={onNavigate}
      />,
    );

    expect(screen.getByText('Kết quả lưu chưa rõ ràng')).toBeInTheDocument();
    // Retry button is hidden until dashboard check is clicked
    expect(screen.queryByRole('button', { name: /Thử lưu lại/ })).not.toBeInTheDocument();

    const checkDashBtn = screen.getByRole('button', { name: 'Kiểm tra Dashboard' });
    await user.click(checkDashBtn);

    expect(onNavigate).toHaveBeenCalled();
    // Now retry button appears
    expect(screen.getByRole('button', { name: /Thử lưu lại/ })).toBeInTheDocument();
  });

  it('shows readonly message and no buttons when card is expired or readonly', () => {
    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="readonly"
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Thẻ này chưa hỗ trợ lưu tại đây/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xác nhận lưu/ })).not.toBeInTheDocument();
  });

  it('does not use preview calories as saved calories, including a confirmed zero', () => {
    const { rerender } = render(<ActionConfirmationCard card={sampleCard} phase="confirmed" />);
    expect(screen.getByText(/Chưa có số liệu kcal đã lưu/)).toBeInTheDocument();
    rerender(<ActionConfirmationCard card={sampleCard} phase="confirmed" savedCalories={0} />);
    expect(screen.getByText(/Đã lưu vào nhật ký · 0 kcal/)).toBeInTheDocument();
  });

  it.each(['readonly', 'expired', 'confirmed'] as const)('cannot override terminal model state %s with pending props', state => {
    render(<ActionConfirmationCard card={{ ...sampleCard, state }} phase="pending" onConfirm={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Xác nhận lưu/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).not.toBeInTheDocument();
  });

  it('switches to ActionCardEditor when Chỉnh sửa is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ActionConfirmationCard
        card={sampleCard}
        phase="pending"
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Chỉnh sửa/ }));

    expect(screen.getByRole('region', { name: 'Chỉnh sửa khẩu phần bữa ăn' })).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn loại bữa ăn')).toHaveValue('lunch');
    const gramInput = screen.getByLabelText('Số gam cho Cơm tấm sườn bì chả');
    expect(gramInput).toHaveAttribute('value', '350');
  });
});
