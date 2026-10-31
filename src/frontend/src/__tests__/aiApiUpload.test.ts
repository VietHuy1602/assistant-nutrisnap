import { afterEach, describe, expect, it } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../api/client';
import { aiApi } from '../api/aiApi';

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe('aiApi.recognizeFood upload', () => {
  it('sends the photo as multipart FormData, not JSON', async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    apiClient.defaults.adapter = async (config) => {
      sent = config;
      return {
        data: { success: true, status: 'unrecognized', reason: 'not_food', detected_items: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const photo = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    await aiApi.recognizeFood(photo, 'lunch');

    // Với header mặc định 'application/json', axios từng chuyển FormData thành chuỗi JSON và làm mất ảnh
    expect(sent?.data).toBeInstanceOf(FormData);
    const file = (sent?.data as FormData).get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).size).toBe(photo.size);
    expect(String(sent?.headers?.['Content-Type'] ?? '')).not.toContain('application/json');
  });
});
