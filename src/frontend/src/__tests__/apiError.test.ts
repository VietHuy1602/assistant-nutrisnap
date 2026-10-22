import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { ApiError, normalizeAxiosError, isApiError } from '../utils/apiError';

function createMockAxiosError({
  status,
  data,
  isNetwork = false,
}: {
  status?: number;
  data?: unknown;
  isNetwork?: boolean;
}): AxiosError {
  const error = new AxiosError(
    isNetwork ? 'Network Error' : 'Request failed with status code ' + status,
    isNetwork ? 'ERR_NETWORK' : 'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    {},
    isNetwork
      ? undefined
      : ({
          status,
          statusText: 'Error',
          data,
          headers: {},
          config: { headers: new AxiosHeaders() },
        } as AxiosResponse),
  );
  return error;
}

describe('normalizeAxiosError & ApiError', () => {
  it('1. Lỗi mạng / timeout không có response: trả về ApiError có isNetworkError = true', () => {
    const error = createMockAxiosError({ isNetwork: true });
    const normalized = normalizeAxiosError(error);

    expect(isApiError(normalized)).toBe(true);
    expect(normalized.isNetworkError).toBe(true);
    expect(normalized.message).toBe('Không thể kết nối tới máy chủ. Kiểm tra mạng và thử lại.');
  });

  it('2. Lỗi 401 chuỗi: detail trả về string (HTTPException)', () => {
    const error = createMockAxiosError({
      status: 401,
      data: { detail: 'Phiên đăng nhập đã hết hạn.' },
    });
    const normalized = normalizeAxiosError(error);

    expect(normalized.status).toBe(401);
    expect(normalized.message).toBe('Phiên đăng nhập đã hết hạn.');
    expect(normalized.fieldErrors).toEqual({});
  });

  it('3. Lỗi 422 mảng: detail là danh sách các lỗi validation Pydantic', () => {
    const error = createMockAxiosError({
      status: 422,
      data: {
        detail: [
          { loc: ['body', 'email'], msg: 'Địa chỉ email không hợp lệ.', type: 'value_error' },
          { loc: ['body', 'age'], msg: 'Tuổi phải >= 10.', type: 'value_error' },
        ],
      },
    });
    const normalized = normalizeAxiosError(error);

    expect(normalized.status).toBe(422);
    expect(normalized.fieldErrors.email).toBe('Địa chỉ email không hợp lệ.');
    expect(normalized.fieldErrors.age).toBe('Tuổi phải >= 10.');
  });

  it('4. Lỗi có tiền tố "Value error, ": tiền tố được loại bỏ sạch sẽ', () => {
    const error = createMockAxiosError({
      status: 422,
      data: {
        detail: [
          {
            loc: ['body', 'password'],
            msg: 'Value error, Mật khẩu phải chứa ít nhất một chữ số.',
            type: 'value_error',
          },
        ],
      },
    });
    const normalized = normalizeAxiosError(error);

    expect(normalized.fieldErrors.password).toBe('Mật khẩu phải chứa ít nhất một chữ số.');
    expect(normalized.message).toBe('Mật khẩu phải chứa ít nhất một chữ số.');
  });

  it('5. Lỗi 500 server error: hiển thị thông điệp hệ thống đang bận', () => {
    const error = createMockAxiosError({
      status: 500,
      data: {},
    });
    const normalized = normalizeAxiosError(error);

    expect(normalized.status).toBe(500);
    expect(normalized.message).toBe('Hệ thống đang bận. Vui lòng thử lại sau.');
  });

  it('6. Ánh xạ field: loc[1] được trích xuất chính xác thành key trong fieldErrors', () => {
    const error = createMockAxiosError({
      status: 422,
      data: {
        detail: [
          {
            loc: ['body', 'target_weight_kg'],
            msg: 'Value error, Cân nặng mục tiêu phải thấp hơn cân nặng hiện tại',
            type: 'value_error',
          },
        ],
      },
    });
    const normalized = normalizeAxiosError(error);

    expect(normalized.fieldErrors.target_weight_kg).toBe(
      'Cân nặng mục tiêu phải thấp hơn cân nặng hiện tại',
    );
  });

  it('7. Trả về đúng khi đối tượng truyền vào đã là ApiError hoặc generic Error', () => {
    const customApiErr = new ApiError('Lỗi tùy chỉnh', { status: 400 });
    expect(normalizeAxiosError(customApiErr)).toBe(customApiErr);

    const normalErr = new Error('Lỗi JavaScript thông thường');
    const normalized = normalizeAxiosError(normalErr);
    expect(normalized.message).toBe('Lỗi JavaScript thông thường');
  });
});
