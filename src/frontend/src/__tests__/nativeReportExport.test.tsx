import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { normalizeMonthlyReport } from '../api/reportContract';

const saveAndShare = vi.fn().mockResolvedValue(true);
const canvasToPdfBlob = vi.fn().mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));

vi.mock('../export/saveNativeFile', () => ({
  isNativeApp: () => true,
  saveAndShareNativeFile: (...args: unknown[]) => saveAndShare(...args),
}));
vi.mock('../export/exportPdf', () => ({ canvasToPdfBlob: (...args: unknown[]) => canvasToPdfBlob(...args) }));
vi.mock('../export/renderReportCanvas', () => ({ renderReportCanvas: () => document.createElement('canvas') }));

import { ExportMenu } from '../components/report/ExportMenu';

const report = normalizeMonthlyReport({ month: '2026-10', insufficient: false });

describe('ExportMenu trong app Android/iOS', () => {
  beforeEach(() => {
    saveAndShare.mockClear();
    canvasToPdfBlob.mockClear();
  });

  it('tạo file PDF và mở bảng chia sẻ thay vì window.print (WebView không hỗ trợ in)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ExportMenu report={report} />);

    await user.click(screen.getByRole('button', { name: /In \/ Lưu PDF/ }));

    expect(print).not.toHaveBeenCalled();
    expect(canvasToPdfBlob).toHaveBeenCalledTimes(1);
    expect(saveAndShare).toHaveBeenCalledWith(expect.any(Blob), 'NutriSnap_BaoCao_2026-10.pdf', expect.any(String));
    expect(await screen.findByText('Đã tạo file PDF thành công!')).toBeInTheDocument();
    print.mockRestore();
  });
});
