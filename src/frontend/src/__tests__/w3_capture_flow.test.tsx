/**
 * src/frontend/src/__tests__/w3_capture_flow.test.tsx
 * Component & Integration tests for FoodSearchCombobox and MealCaptureFlow orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FoodSearchCombobox } from '../components/meal/FoodSearchCombobox';
import { MealCaptureFlow } from '../pages/MealCaptureFlow';
import { foodApi } from '../api/foodApi';
import { aiApi } from '../api/aiApi';
import { mealApi } from '../api/mealApi';
import type { FoodReferenceItem, MealLogResponse, RecognizeFoodResponse } from '../types/api';

vi.mock('../api/foodApi');
vi.mock('../api/aiApi');
vi.mock('../api/mealApi');

const sampleFoods: FoodReferenceItem[] = [
  {
    id: 1,
    food_name: 'Phở bò tái',
    calories_per_100g: 135,
    protein_per_100g: 8.2,
    carbs_per_100g: 16.5,
    fat_per_100g: 3.8,
    avg_price_vnd: 50000,
  },
  {
    id: 2,
    food_name: 'Phở gà',
    calories_per_100g: 140,
    protein_per_100g: 10.5,
    carbs_per_100g: 15.2,
    fat_per_100g: 4.1,
    avg_price_vnd: 45000,
  },
];

const samplePreviewResponse: MealLogResponse = {
  status: 'pending_confirmation',
  meal_type: 'lunch',
  logged_at: '2026-10-23T12:00:00Z',
  nutrition: {
    items: [],
    total_weight_g: 400,
    total_calories: 540,
    total_protein_g: 32,
    total_carbs_g: 65,
    total_fat_g: 15,
    total_estimated_price_vnd: 50000,
    disclaimer: 'Ước tính',
  },
  disclaimer: 'Ước tính',
  success: true,
  total_calories: 540,
};

describe('W3 Component — FoodSearchCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Hiển thị ô tìm kiếm với thuộc tính ARIA combobox chuẩn', () => {
    render(<FoodSearchCombobox onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('2. Gõ từ khóa tìm kiếm hiển thị danh sách kết quả dạng listbox', async () => {
    vi.mocked(foodApi.searchFoods).mockResolvedValueOnce({ total: 2, items: sampleFoods });
    const user = userEvent.setup();

    render(<FoodSearchCombobox onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'phở');

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Phở bò tái');
  });

  it('3. Điều hướng kết quả bằng phím mũi tên và chọn bằng phím Enter', async () => {
    vi.mocked(foodApi.searchFoods).mockResolvedValueOnce({ total: 2, items: sampleFoods });
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    render(<FoodSearchCombobox onSelect={handleSelect} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'phở');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    // Nhấn ArrowDown để chọn mục đầu tiên
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // Nhấn Enter để xác nhận chọn
    await user.keyboard('{Enter}');
    expect(handleSelect).toHaveBeenCalledWith(sampleFoods[0]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('4. Đóng danh sách gợi ý khi bấm phím Escape', async () => {
    vi.mocked(foodApi.searchFoods).mockResolvedValueOnce({ total: 2, items: sampleFoods });
    const user = userEvent.setup();

    render(<FoodSearchCombobox onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'phở');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('5. Đóng danh sách gợi ý khi click ra ngoài combobox', async () => {
    vi.mocked(foodApi.searchFoods).mockResolvedValueOnce({ total: 2, items: sampleFoods });
    const user = userEvent.setup();

    render(
      <div>
        <div data-testid="outside">Bên ngoài</div>
        <FoodSearchCombobox onSelect={vi.fn()} />
      </div>,
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'phở');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('W3 Orchestrator — MealCaptureFlow (State Machine & Fallbacks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('6. Hiển thị màn hình chọn phương thức chụp (Camera hoặc Tải ảnh)', () => {
    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Tải ảnh đĩa ăn/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bật Camera/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Khu vực tải ảnh món ăn từ thiết bị/ })).toBeInTheDocument();
  });

  it('7. Luồng tải ảnh -> Nhận diện AI -> Màn hình xác nhận (Review UI)', async () => {
    const mockRecognize: RecognizeFoodResponse = {
      success: true,
      status: 'pending_confirmation',
      meal_type: 'lunch',
      detected_items: [
        {
          food_id: 1,
          food_name: 'Phở bò tái',
          estimated_gram: 400,
          confidence: 0.95,
          is_matched: true,
          estimated_calories: 540,
          protein_g: 32,
          carbs_g: 65,
          fat_g: 15,
        },
      ],
      total_estimated_calories: 540,
    };

    vi.mocked(aiApi.recognizeFood).mockResolvedValueOnce(mockRecognize);
    vi.mocked(mealApi.previewMeal).mockResolvedValue(samplePreviewResponse);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const sampleFile = new File(['fake-img'], 'meal.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, sampleFile);

    // Hiển thị xem lại ảnh trước khi gửi
    expect(await screen.findByRole('heading', { name: /Xem lại ảnh đã chụp/ })).toBeInTheDocument();

    // Nhấn "Nhận diện món ăn"
    await user.click(screen.getByRole('button', { name: /Nhận diện món ăn/ }));

    // Chuyển sang màn hình xác nhận khẩu phần
    expect(await screen.findByRole('heading', { name: /Kiểm tra & Sửa khẩu phần/ })).toBeInTheDocument();
    expect(screen.getByText('Phở bò tái')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xác nhận lưu bữa ăn/ })).toBeEnabled();
  });

  it('8. Xử lý khi AI không nhận diện được món ăn (Unrecognized Fallback)', async () => {
    const mockUnrecognized: RecognizeFoodResponse = {
      success: false,
      status: 'unrecognized',
      meal_type: 'lunch',
      detected_items: [],
      total_estimated_calories: 0,
      message: 'Không nhận diện được thức ăn',
    };

    vi.mocked(aiApi.recognizeFood).mockResolvedValueOnce(mockUnrecognized);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const sampleFile = new File(['fake-img'], 'desk.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, sampleFile);

    expect(await screen.findByRole('heading', { name: /Xem lại ảnh đã chụp/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nhận diện món ăn/ }));

    // Hiển thị panel unrecognized
    expect(await screen.findByRole('heading', { name: /Chưa nhận diện được món ăn/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chụp lại ảnh đĩa ăn/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chọn món thủ công từ CSDL/ })).toBeInTheDocument();
  });

  it('9. Cho phép chuyển sang nhập món thủ công khi nhận diện thất bại', async () => {
    vi.mocked(aiApi.recognizeFood).mockRejectedValueOnce(new Error('AI Server Down'));
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const sampleFile = new File(['fake-img'], 'meal.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, sampleFile);

    expect(await screen.findByRole('heading', { name: /Xem lại ảnh đã chụp/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nhận diện món ăn/ }));

    // Hiển thị màn hình nhập thủ công khi lỗi
    expect(await screen.findByRole('heading', { name: /Nhập món ăn thủ công/ })).toBeInTheDocument();
    expect(screen.getByText(/Không thể hoàn tất nhận diện AI do kết nối/)).toBeInTheDocument();
  });

  it('10. Lưu bữa ăn thành công hiển thị SaveSuccess', async () => {
    const mockRecognize: RecognizeFoodResponse = {
      success: true,
      status: 'pending_confirmation',
      meal_type: 'lunch',
      detected_items: [
        {
          food_id: 1,
          food_name: 'Phở bò tái',
          estimated_gram: 400,
          confidence: 0.95,
          is_matched: true,
          estimated_calories: 540,
          protein_g: 32,
          carbs_g: 65,
          fat_g: 15,
        },
      ],
      total_estimated_calories: 540,
    };

    vi.mocked(aiApi.recognizeFood).mockResolvedValueOnce(mockRecognize);
    vi.mocked(mealApi.previewMeal).mockResolvedValue(samplePreviewResponse);

    const mockLogResponse: MealLogResponse = {
      ...samplePreviewResponse,
      status: 'logged',
      meal_id: 101,
      total_calories: 540,
    };

    vi.mocked(mealApi.logMeal).mockResolvedValueOnce(mockLogResponse);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const sampleFile = new File(['fake-img'], 'meal.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, sampleFile);

    expect(await screen.findByRole('heading', { name: /Xem lại ảnh đã chụp/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nhận diện món ăn/ }));
    await screen.findByRole('heading', { name: /Kiểm tra & Sửa khẩu phần/ });

    // Bấm lưu
    await user.click(screen.getByRole('button', { name: /Xác nhận lưu bữa ăn/ }));

    // Hiển thị SaveSuccess
    expect(await screen.findByRole('heading', { name: /Ghi nhận bữa ăn thành công/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xem Dashboard dinh dưỡng/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ghi nhận bữa ăn khác/ })).toBeInTheDocument();
  });
});
