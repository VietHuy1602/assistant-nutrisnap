import axios, { AxiosError } from 'axios';

export interface ApiErrorOptions {
  status?: number;
  fieldErrors?: Record<string, string>;
  isNetworkError?: boolean;
}

export class ApiError extends Error {
  status?: number;
  fieldErrors: Record<string, string>;
  isNetworkError: boolean;

  constructor(message: string, options?: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.fieldErrors = options?.fieldErrors ?? {};
    this.isNetworkError = options?.isNetworkError ?? false;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export class ContractError extends ApiError {
  readonly code: string;
  readonly context: string;
  readonly issues: string[];

  constructor(code = 'CONTRACT_MISMATCH', context = '', issues: string[] = []) {
    super('Máy chủ trả về dữ liệu không đúng định dạng (mã CONTRACT_MISMATCH). Vui lòng thử lại hoặc liên hệ nhóm phát triển.');
    this.name = 'ContractError';
    this.code = code;
    this.context = context;
    this.issues = issues;
  }
}

export function isContractError(e: unknown): e is ContractError {
  return e instanceof ContractError;
}


interface PydanticErrorDetail {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
}

export function normalizeAxiosError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) {
      return new ApiError(error.message);
    }
    return new ApiError('Đã có lỗi không xác định xảy ra.');
  }

  const axiosError = error as AxiosError<{ detail?: string | PydanticErrorDetail[]; message?: string }>;

  // Trường hợp mất mạng hoặc timeout (không nhận được response)
  if (!axiosError.response) {
    return new ApiError('Không thể kết nối tới máy chủ. Kiểm tra mạng và thử lại.', {
      isNetworkError: true,
    });
  }

  const { status, data } = axiosError.response;
  const fieldErrors: Record<string, string> = {};

  // Xử lý FastAPI HTTPException: detail là string
  if (typeof data?.detail === 'string') {
    return new ApiError(data.detail, {
      status,
      fieldErrors,
    });
  }

  // Xử lý FastAPI / Pydantic validation error: detail là mảng
  if (Array.isArray(data?.detail)) {
    for (const item of data.detail) {
      if (!item || typeof item !== 'object') continue;
      const rawMsg = item.msg || 'Giá trị không hợp lệ.';
      // Bỏ tiền tố "Value error, " do Pydantic sinh ra
      const cleanedMsg = rawMsg.replace(/^Value error,\s*/i, '');
      const field = item.loc && item.loc.length > 1
        ? String(item.loc[1])
        : item.loc && item.loc.length > 0
          ? String(item.loc[item.loc.length - 1])
          : 'non_field_errors';

      fieldErrors[field] = cleanedMsg;
    }

    const firstMsg = Object.values(fieldErrors)[0];
    return new ApiError(firstMsg || 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.', {
      status,
      fieldErrors,
    });
  }

  // Trường hợp mã lỗi chuẩn khi detail không có hoặc rỗng
  let defaultMessage = 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  if (status === 400 || status === 409) {
    defaultMessage = data?.message || 'Dữ liệu không hợp lệ hoặc đã tồn tại.';
  } else if (status === 401) {
    defaultMessage = 'Tên đăng nhập hoặc mật khẩu không đúng.';
  } else if (status === 403) {
    defaultMessage = 'Yêu cầu bị từ chối. Vui lòng tải lại trang.';
  } else if (status === 422) {
    defaultMessage = 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
  } else if (status === 429) {
    defaultMessage = 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.';
  } else if (status >= 500) {
    defaultMessage = 'Hệ thống đang bận. Vui lòng thử lại sau.';
  }

  return new ApiError(defaultMessage, {
    status,
    fieldErrors,
  });
}
