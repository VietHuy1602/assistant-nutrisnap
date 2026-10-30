import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { CapturePreview } from '../components/meal/CapturePreview';
import { CameraView } from '../components/meal/CameraView';
import { RecognitionProgress } from '../components/meal/RecognitionProgress';
import { ManualEntryPanel } from '../components/meal/ManualEntryPanel';

describe('Capture presentation and existing interactions', () => {
  it('keeps meal choice and photo confirmation callbacks connected, including processing locks', async () => {
    const user = userEvent.setup();
    const choose = vi.fn();
    const confirm = vi.fn();
    const retake = vi.fn();
    const blob = new Blob([], { type: 'image/png' });
    const props = { blob, mealType: 'lunch', onMealTypeChange: choose, onConfirmPhoto: confirm, onRetake: retake };
    const view = render(<CapturePreview {...props} />);
    expect(screen.getByRole('img', { name: 'Đĩa thức ăn đã chụp' })).toHaveClass('object-contain');
    await user.click(screen.getByRole('button', { name: /Bữa Sáng/ }));
    expect(choose).toHaveBeenCalledWith('breakfast');
    await user.click(screen.getByRole('button', { name: 'Nhận diện món ăn' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Chụp lại' }));
    expect(retake).toHaveBeenCalledTimes(1);
    view.rerender(<CapturePreview {...props} isProcessing />);
    expect(screen.getByRole('button', { name: 'Đang xử lý...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chụp lại' })).toBeDisabled();
  });

  it('announces camera errors and preserves the upload alternative', async () => {
    const user = userEvent.setup();
    const upload = vi.fn();
    render(<CameraView videoRef={createRef<HTMLVideoElement>()} status="error" error="Không truy cập được máy ảnh" onCapture={vi.fn()} onSwitchToUpload={upload} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không truy cập được máy ảnh');
    expect(screen.getByRole('button', { name: 'Chụp ảnh đĩa thức ăn' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Tải ảnh từ thiết bị' }));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('keeps slow recognition cancellable with understandable progress text', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    render(<RecognitionProgress slow onCancel={cancel} />);
    expect(screen.getByRole('status')).toHaveTextContent('Bạn sẽ kiểm tra kết quả trước khi lưu');
    await user.click(screen.getByRole('button', { name: 'Hủy nhận diện' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('exposes manual meal selection state without enabling an empty meal', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<ManualEntryPanel mealType="lunch" items={[]} dispatch={dispatch} onProceedToReview={vi.fn()} onSwitchToCamera={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Bữa Trưa/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /Bữa Sáng/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MEAL_TYPE', mealType: 'breakfast' });
    expect(screen.getByRole('button', { name: 'Tiếp tục kiểm tra khẩu phần' })).toBeDisabled();
  });
});
