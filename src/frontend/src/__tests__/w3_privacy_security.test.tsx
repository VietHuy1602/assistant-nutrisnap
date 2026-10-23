/**
 * src/frontend/src/__tests__/w3_privacy_security.test.tsx
 * Security, Zero-Trust & Privacy compliance test suite for W3 Meal Capture & Dashboard.
 * Adheres strictly to ADR-W3-05 (Image privacy & Zero storage leakage) and Zero-Trust architecture.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MealCaptureFlow } from '../pages/MealCaptureFlow';
import { prepareImageForUpload } from '../utils/image';
import { mealApi } from '../api/mealApi';
import { apiClient } from '../api/client';

describe('W3 Security & Privacy — Zero-Trust & Zero Storage (ADR-W3-05)', () => {
  let localStorageSetSpy: MockInstance;
  let sessionStorageSetSpy: MockInstance;
  let revokeObjectURLSpy: MockInstance;
  let createObjectURLSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    sessionStorageSetSpy = vi.spyOn(sessionStorage, 'setItem');
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    localStorageSetSpy.mockRestore();
    sessionStorageSetSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('1. Storage.prototype.setItem và sessionStorage.setItem KHÔNG BAO GIỜ được gọi trong luồng chụp ảnh', () => {
    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    expect(localStorageSetSpy).not.toHaveBeenCalled();
    expect(sessionStorageSetSpy).not.toHaveBeenCalled();
  });

  it('2. Tuyệt đối không lưu ảnh, blob, hoặc chuỗi base64 vào localStorage hoặc sessionStorage', async () => {
    const rawBlob = new Blob(['raw-image-bytes'], { type: 'image/jpeg' });
    await prepareImageForUpload(rawBlob);

    expect(localStorageSetSpy).not.toHaveBeenCalled();
    expect(sessionStorageSetSpy).not.toHaveBeenCalled();
  });

  it('3. Thu hồi ObjectURL (URL.revokeObjectURL) sau khi hoàn tất xử lý ảnh', async () => {
    const rawBlob = new Blob(['raw-image-bytes'], { type: 'image/jpeg' });
    await prepareImageForUpload(rawBlob);

    expect(createObjectURLSpy).toHaveBeenCalledWith(rawBlob);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('4. Dừng toàn bộ MediaStreamTrack (track.stop) khi người dùng rời khỏi màn hình /capture', async () => {
    const stopTrack = vi.fn();
    const mockTrack = { stop: stopTrack, kind: 'video' };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    } as unknown as MediaStream;

    const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: mockGetUserMedia,
      },
    });

    const { unmount } = render(
      <MemoryRouter>
        <MealCaptureFlow initialMode="cameraLive" />
      </MemoryRouter>,
    );

    // Chờ camera khởi tạo xong và track đã gán
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // Chờ UI CameraView xuất hiện
    expect(await screen.findByRole('button', { name: /Chụp ảnh đĩa thức ăn/ })).toBeInTheDocument();

    expect(stopTrack).not.toHaveBeenCalled();

    // Người dùng rời màn hình (unmount)
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('5. Payload gửi lên POST /meals/log TUYỆT ĐỐI KHÔNG chứa user_id (Zero-Trust Security)', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        status: 'logged',
        meal_id: 1,
        meal_type: 'lunch',
        logged_at: '2026-10-23T12:00:00Z',
        nutrition: {
          items: [],
          total_weight_g: 200,
          total_calories: 500,
          total_protein_g: 20,
          total_carbs_g: 60,
          total_fat_g: 10,
          total_estimated_price_vnd: 40000,
          disclaimer: 'Ước tính',
        },
        disclaimer: 'Ước tính',
        success: true,
        total_calories: 500,
      },
    });

    await mealApi.logMeal({
      meal_type: 'lunch',
      items: [{ food_id: 1, food_name: 'Cơm', estimated_gram: 200 }],
      notes: 'Bữa trưa',
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const sentPayload = postSpy.mock.calls[0][1] as Record<string, unknown>;

    // Kiểm tra không có user_id
    expect(sentPayload['user_id']).toBeUndefined();
    expect(sentPayload['userId']).toBeUndefined();
    expect(sentPayload['is_confirmed']).toBe(true);
  });

  it('6. Request config gửi đi KHÔNG chứa Authorization header thủ công (chỉ dựa vào HttpOnly Cookie)', () => {
    const headers = apiClient.defaults.headers;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers.common?.['Authorization']).toBeUndefined();
  });

  it('7. Không log dữ liệu nhạy cảm hoặc payload ảnh ra console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <MealCaptureFlow />
      </MemoryRouter>,
    );

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/data:image|base64|password|token/i),
    );

    consoleSpy.mockRestore();
  });
});
