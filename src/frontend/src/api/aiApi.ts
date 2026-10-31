/**
 * src/frontend/src/api/aiApi.ts
 * AI Vision Recognition API client communicating with Backend /api/v1/ai/recognize-food.
 */

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { recognizeFoodResponseSchema } from './contracts';
import { parseResponse } from './parseResponse';
import type { RecognizeFoodResponse } from '../types/api';

export const aiApi = {
  /**
   * Gửi ảnh đĩa ăn dạng multipart/form-data lên server để bóc tách món ăn và ước lượng calo.
   * Timeout 15s lớn hơn ngưỡng xử lý 5s của server.
   */
  async recognizeFood(
    imageBlob: Blob,
    mealType = 'lunch',
    signal?: AbortSignal,
  ): Promise<RecognizeFoodResponse> {
    const formData = new FormData();
    formData.append('file', imageBlob, 'meal_photo.jpg');
    formData.append('meal_type', mealType);

    const response = await apiClient.post<RecognizeFoodResponse>(
      ENDPOINTS.RECOGNIZE_FOOD,
      formData,
      {
        signal,
        // Nhận diện ảnh có thể phải thử model dự phòng khi Gemini quá tải
        timeout: 45_000,
        // Bắt buộc ghi đè header mặc định 'application/json' của apiClient: nếu giữ nguyên, axios sẽ
        // chuyển FormData thành JSON và làm mất ảnh. Với 'multipart/form-data', axios/trình duyệt
        // tự gắn boundary đúng.
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );

    return parseResponse(
      recognizeFoodResponseSchema,
      response.data,
      'POST /ai/recognize-food',
    ) as RecognizeFoodResponse;
  },
};
