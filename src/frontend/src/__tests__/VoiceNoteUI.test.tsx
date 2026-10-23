import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VoiceNoteUI } from '../components/VoiceNoteUI';
import { MealCaptureFlow } from '../components/MealCaptureFlow';
import type { NutritionAPI } from '../components/types';
function Harness() { const [note, setNote] = useState(''); return <VoiceNoteUI note={note} onChange={setNote} />; }
describe('Voice-note UI — no recording or transcription', () => {
  it('supports typed notes and clearly simulated recording, stop and cancel', async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.type(screen.getByRole('textbox'), 'Ít dầu');
    await user.click(screen.getByRole('button', { name: 'Thử giao diện ghi âm (demo)' }));
    expect(screen.getByRole('status')).toHaveTextContent('Không thu âm thật');
    await user.click(screen.getByRole('button', { name: 'Dừng demo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Không có bản chép lời tự động');
    await user.click(screen.getByRole('button', { name: 'Thử giao diện ghi âm (demo)' }));
    await user.click(screen.getByRole('button', { name: 'Hủy demo' }));
    expect(screen.getByRole('textbox')).toHaveValue('Ít dầu');
    expect(screen.getByRole('status')).toHaveTextContent('Đã hủy demo');
  });
  it.each(['permission-denied', 'unsupported'] as const)('provides typed fallback for %s', availability => {
    render(<VoiceNoteUI note="" onChange={vi.fn()} availability={availability} />);
    expect(screen.getByRole('button')).toBeDisabled(); expect(screen.getByRole('textbox')).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('nhập ghi chú');
  });
  it('preserves notes into the editor and discards only after explicit confirmation, without API calls', async () => {
    const api = { search: vi.fn(), preview: vi.fn(), saveMeal: vi.fn() } as unknown as NutritionAPI;
    const user = userEvent.setup(); render(<MealCaptureFlow api={api} demo={false} />);
    await user.type(screen.getByRole('textbox', { name: 'Ghi chú gia vị (bản nháp)' }), 'Nước chấm riêng');
    await user.click(screen.getByRole('button', { name: 'Chọn món thủ công' }));
    expect(screen.getByRole('textbox', { name: /Ghi chú thêm/ })).toHaveValue('Nước chấm riêng');
    await user.click(screen.getByRole('button', { name: 'Chọn lại' }));
    await user.click(screen.getByRole('button', { name: 'Bỏ bản nháp và quay lại' }));
    expect(screen.getByRole('textbox', { name: 'Ghi chú gia vị (bản nháp)' })).toHaveValue('');
    expect(api.preview).not.toHaveBeenCalled(); expect(api.saveMeal).not.toHaveBeenCalled();
  });
});
