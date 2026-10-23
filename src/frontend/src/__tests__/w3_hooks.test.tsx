/**
 * src/frontend/src/__tests__/w3_hooks.test.tsx
 * Unit & Integration tests for W3 Custom Hooks:
 * - useRecognizeFood (with 5s slow indicator & abort support)
 * - useMealPreview (400ms debounce & in-flight abort)
 * - useFoodSearch (300ms debounce & min 2 chars)
 * - useCamera (stream lifecycle & unmount track stopping)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecognizeFood } from '../hooks/useRecognizeFood';
import { useMealPreview } from '../hooks/useMealPreview';
import { useFoodSearch } from '../hooks/useFoodSearch';
import { useCamera } from '../hooks/useCamera';
import { aiApi } from '../api/aiApi';
import { mealApi } from '../api/mealApi';
import { foodApi } from '../api/foodApi';
import type { MealItemInput, RecognizeFoodResponse } from '../types/api';

vi.mock('../api/aiApi');
vi.mock('../api/mealApi');
vi.mock('../api/foodApi');

describe('W3 Hooks — useRecognizeFood', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Khởi tạo ở trạng thái idle, không chậm (slow = false)', () => {
    const { result } = renderHook(() => useRecognizeFood());
    expect(result.current.status).toBe('idle');
    expect(result.current.slow).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('2. Gọi nhận diện thành công và cập nhật status = success', async () => {
    const mockResponse: RecognizeFoodResponse = {
      success: true,
      status: 'pending_confirmation',
      meal_type: 'breakfast',
      detected_items: [
        {
          food_id: 1,
          food_name: 'Phở bò',
          estimated_gram: 400,
          confidence: 0.95,
          is_matched: true,
          estimated_calories: 500,
          protein_g: 25,
          carbs_g: 60,
          fat_g: 12,
        },
      ],
      total_estimated_calories: 500,
      message: 'OK',
    };

    vi.mocked(aiApi.recognizeFood).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useRecognizeFood());
    const dummyBlob = new Blob(['sample'], { type: 'image/jpeg' });

    await act(async () => {
      await result.current.run(dummyBlob, 'breakfast');
    });

    expect(result.current.status).toBe('success');
    expect(result.current.result?.detected_items).toHaveLength(1);
    expect(result.current.slow).toBe(false);
  });

  it('3. Bật cờ slow = true sau 5 giây nếu API chưa phản hồi (fake timers)', async () => {
    vi.useFakeTimers();

    let resolvePromise!: (val: RecognizeFoodResponse) => void;
    vi.mocked(aiApi.recognizeFood).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result } = renderHook(() => useRecognizeFood());
    const dummyBlob = new Blob(['sample'], { type: 'image/jpeg' });

    let runPromise: Promise<unknown>;
    act(() => {
      runPromise = result.current.run(dummyBlob, 'lunch');
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.slow).toBe(false);

    // Tiến hành tua thời gian 5000ms
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.slow).toBe(true);

    // Giải phóng promise
    await act(async () => {
      resolvePromise({
        success: true,
        status: 'pending_confirmation',
        meal_type: 'lunch',
        detected_items: [
          {
            food_id: 1,
            food_name: 'Phở bò',
            estimated_gram: 400,
            confidence: 0.9,
            is_matched: true,
            estimated_calories: 500,
            protein_g: 25,
            carbs_g: 60,
            fat_g: 12,
          },
        ],
        total_estimated_calories: 500,
      });
      await runPromise;
    });

    expect(result.current.slow).toBe(false);
    expect(result.current.status).toBe('success');
  });

  it('4. Xử lý phản hồi unrecognized từ Backend', async () => {
    const mockUnrecognized: RecognizeFoodResponse = {
      success: false,
      status: 'unrecognized',
      meal_type: 'lunch',
      detected_items: [],
      total_estimated_calories: 0,
      message: 'Không phải đồ ăn',
    };

    vi.mocked(aiApi.recognizeFood).mockResolvedValueOnce(mockUnrecognized);

    const { result } = renderHook(() => useRecognizeFood());
    const dummyBlob = new Blob(['sample'], { type: 'image/jpeg' });

    await act(async () => {
      await result.current.run(dummyBlob);
    });

    expect(result.current.status).toBe('unrecognized');
    expect(result.current.result?.detected_items).toHaveLength(0);
  });

  it('5. Xử lý lỗi API hoặc kết nối mạng', async () => {
    vi.mocked(aiApi.recognizeFood).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRecognizeFood());
    const dummyBlob = new Blob(['sample'], { type: 'image/jpeg' });

    await act(async () => {
      await result.current.run(dummyBlob);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network error');
  });

  it('6. Hủy request nhận diện khi gọi cancel()', async () => {
    const { result } = renderHook(() => useRecognizeFood());
    const dummyBlob = new Blob(['sample'], { type: 'image/jpeg' });

    act(() => {
      void result.current.run(dummyBlob);
    });

    expect(result.current.status).toBe('pending');

    act(() => {
      result.current.cancel();
    });

    expect(result.current.status).toBe('idle');
  });
});

describe('W3 Hooks — useMealPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('7. Debounce 400ms trước khi gọi mealApi.previewMeal', async () => {
    vi.useFakeTimers();

    vi.mocked(mealApi.previewMeal).mockResolvedValue({
      status: 'pending_confirmation',
      meal_type: 'lunch',
      logged_at: '2026-10-23T12:00:00Z',
      nutrition: {
        items: [],
        total_weight_g: 200,
        total_calories: 450,
        total_protein_g: 15,
        total_carbs_g: 80,
        total_fat_g: 5,
        total_estimated_price_vnd: 30000,
        disclaimer: 'Ước tính',
      },
      disclaimer: 'Ước tính',
      success: true,
      total_calories: 450,
    });

    const items: MealItemInput[] = [
      { food_id: 1, food_name: 'Cơm', estimated_gram: 200 },
    ];

    const { result } = renderHook(() => useMealPreview(items, 'lunch'));

    // Ngay lúc đầu chưa gọi
    expect(mealApi.previewMeal).not.toHaveBeenCalled();

    // Tua 300ms: vẫn chưa gọi
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mealApi.previewMeal).not.toHaveBeenCalled();

    // Tua tiếp 100ms (tổng 400ms): gọi API
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mealApi.previewMeal).toHaveBeenCalledTimes(1);
    expect(result.current.preview?.total_calories).toBe(450);
  });

  it('8. Không gọi preview khi danh sách món chưa hợp lệ (chưa chọn món / 0g)', async () => {
    vi.useFakeTimers();

    const unlinkedItems: MealItemInput[] = [
      { food_id: null, food_name: 'Chưa chọn', estimated_gram: 100 },
    ];

    renderHook(() => useMealPreview(unlinkedItems, 'lunch'));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mealApi.previewMeal).not.toHaveBeenCalled();
  });
});

describe('W3 Hooks — useFoodSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('9. Không tìm kiếm khi từ khóa ít hơn 2 ký tự', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFoodSearch());

    act(() => {
      result.current.setQuery('p');
      vi.advanceTimersByTime(400);
    });

    expect(foodApi.searchFoods).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(0);
  });

  it('10. Debounce 300ms và trả về kết quả tìm kiếm món ăn', async () => {
    vi.useFakeTimers();

    vi.mocked(foodApi.searchFoods).mockResolvedValueOnce({
      total: 1,
      items: [
        {
          id: 1,
          food_name: 'Phở bò',
          calories_per_100g: 135,
          protein_per_100g: 8.2,
          carbs_per_100g: 16.5,
          fat_per_100g: 3.8,
          avg_price_vnd: 45000,
        },
      ],
    });

    const { result } = renderHook(() => useFoodSearch());

    act(() => {
      result.current.setQuery('phở');
    });

    expect(foodApi.searchFoods).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(foodApi.searchFoods).toHaveBeenCalledWith('phở', expect.anything());
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].food_name).toBe('Phở bò');
  });
});

describe('W3 Hooks — useCamera (ADR-W3-05 MediaStream lifecycle)', () => {
  it('11. Xử lý mở camera thành công và lưu stream vào state', async () => {
    const mockTrack = { stop: vi.fn(), kind: 'video' };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('live');
    expect(result.current.stream).toBe(mockStream);
    expect(result.current.error).toBeNull();
  });

  it('12. Xử lý khi người dùng từ chối cấp quyền camera (NotAllowedError)', async () => {
    const notAllowedError = new DOMException('Permission denied', 'NotAllowedError');

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(notAllowedError),
      },
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.error).toContain('bị từ chối');
  });

  it('13. Dừng toàn bộ MediaStreamTrack khi unmount hook', async () => {
    const stopTrack = vi.fn();
    const mockTrack = { stop: stopTrack, kind: 'video' };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    const { result, unmount } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(stopTrack).not.toHaveBeenCalled();

    // Unmount hook -> kiểm tra cleanup
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });
});
