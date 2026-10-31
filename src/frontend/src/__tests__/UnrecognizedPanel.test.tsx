import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnrecognizedPanel } from '../components/meal/UnrecognizedPanel';

describe('UnrecognizedPanel', () => {
  it('tells the user the photo is not food and asks for a retake', () => {
    render(<UnrecognizedPanel reason="not_food" message="ignored" onRetake={vi.fn()} onManualEntry={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Đây không phải là món ăn');
    expect(screen.getByText(/Xin vui lòng chụp lại ảnh món ăn/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chụp lại ảnh món ăn' })).toBeInTheDocument();
  });

  it('shows the service message when the AI is unavailable', () => {
    render(<UnrecognizedPanel reason="service_error" message="Dịch vụ đang bận." onRetake={vi.fn()} onManualEntry={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Chưa kết nối được AI nhận diện');
    expect(screen.getByText('Dịch vụ đang bận.')).toBeInTheDocument();
  });

  it('keeps the generic copy when no reason is given', () => {
    render(<UnrecognizedPanel onRetake={vi.fn()} onManualEntry={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Chưa nhận diện được món ăn');
  });
});
