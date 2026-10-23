import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FoodSwapModal } from '../components/FoodSwapModal';
import { demoSwapProvider, type SwapPreview, type SwapProvider } from '../components/foodSwapDemo';
import { PortionEditor } from '../components/PortionEditor';
import type { NutritionAPI } from '../components/types';

function Harness({ provider, confirm = vi.fn() }: { provider?: SwapProvider; confirm?: (food: unknown) => void }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Ouvrir</button>{open && <FoodSwapModal foodName="Món đang sửa" provider={provider} onClose={() => setOpen(false)} onConfirm={f => { confirm(f); setOpen(false); }} />}</>;
}
async function setup(provider?: SwapProvider) {
  const user = userEvent.setup(); const confirm = vi.fn(); const view = render(<Harness provider={provider} confirm={confirm} />);
  await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
  return { user, confirm, ...view };
}
describe('FoodSwapModal — isolated demo data', () => {
  it('shows illustrative values and signed deltas; applies only after explicit selection', async () => {
    const { user, confirm } = await setup();
    expect(await screen.findByText(/Chênh lệch demo: -50 kcal/)).toHaveTextContent('-2.000 VNĐ');
    expect(screen.getByText(/không phải thông tin dinh dưỡng/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áp dụng vào bản nháp' })).toBeDisabled();
    await user.click(screen.getByRole('radio'));
    expect(screen.getByRole('radio')).toBeChecked();
    await user.dblClick(screen.getByRole('button', { name: 'Áp dụng vào bản nháp' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('requests each supported goal through the replaceable provider', async () => {
    const provider = vi.fn(demoSwapProvider); const { user } = await setup(provider);
    await screen.findByRole('radio');
    await user.selectOptions(screen.getByRole('combobox'), 'high_protein');
    expect(await screen.findByText(/Chênh lệch demo: 0 kcal/)).toHaveTextContent('+5 g đạm · +2.000 VNĐ');
    await user.selectOptions(screen.getByRole('combobox'), 'balanced_saver');
    await screen.findByText(/Chênh lệch demo: -20 kcal/);
    expect(provider.mock.calls.map(([goal]) => goal)).toEqual(['reduce_calories', 'high_protein', 'balanced_saver']);
  });
  it('ignores stale responses after the goal changes', async () => {
    let resolve!: (value: SwapPreview) => void;
    const provider: SwapProvider = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockImplementation(demoSwapProvider);
    const { user } = await setup(provider);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    await user.selectOptions(screen.getByRole('combobox'), 'high_protein');
    await screen.findByText(/Lựa chọn đạm minh họa/);
    await act(async () => resolve(await demoSwapProvider('reduce_calories')));
    expect(screen.queryByText('Lựa chọn nhẹ minh họa')).not.toBeInTheDocument();
  });
  it('shows empty state', async () => {
    const data = await demoSwapProvider('reduce_calories');
    await setup(async () => ({ ...data, alternatives: [] }));
    expect(await screen.findByText('Chưa có lựa chọn thay thế.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áp dụng vào bản nháp' })).toBeDisabled();
  });
  it.each(['rejected', 'invalid'])('shows %s data error and supports retry', async kind => {
    const data = await demoSwapProvider('reduce_calories');
    const provider = vi.fn<SwapProvider>().mockImplementationOnce(async () => {
      if (kind === 'rejected') throw new Error('Demo failure');
      return { ...data, current: { ...data.current, calories: NaN } };
    }).mockImplementation(demoSwapProvider);
    const { user } = await setup(provider);
    expect(await screen.findByRole('alert')).toHaveTextContent('hợp lệ');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('radio')).toBeInTheDocument();
  });
  it('restores focus on cancel/Escape and cleans up modal effects', async () => {
    const { user, confirm, unmount } = await setup();
    expect(screen.getByRole('button', { name: 'Đóng đổi món' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    await user.tab({ shift: true }); expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.tab(); expect(screen.getByRole('button', { name: 'Đóng đổi món' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' })); unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.querySelector('[inert]')).toBeNull();
  });
  it('updates the local draft without saving illustrative food as a real reference', async () => {
    const api = { search: vi.fn(), saveMeal: vi.fn() } as unknown as NutritionAPI;
    const user = userEvent.setup();
    render(<PortionEditor api={api} initial={[{ key: 'row', food_id: 7, food_name: 'Món gốc', grams: '100', per100: [200, 10, 25, 6] }]} meal="lunch" image="" demo={false} onBack={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Mô phỏng đổi món Món gốc' }));
    await screen.findByRole('radio'); await user.click(screen.getByRole('radio'));
    await user.click(screen.getByRole('button', { name: 'Áp dụng vào bản nháp' }));
    expect(screen.getByText('Lựa chọn nhẹ minh họa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận lưu bữa ăn' })).toBeDisabled();
    expect(api.saveMeal).not.toHaveBeenCalled(); expect(api.search).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
