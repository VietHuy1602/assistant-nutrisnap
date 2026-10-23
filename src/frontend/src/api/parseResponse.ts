/**
 * src/frontend/src/api/parseResponse.ts
 * Contract Guard response parser enforcing Tolerant Reader pattern.
 * Hỗ trợ 2 chế độ:
 * - 'warn' (mặc định): ghi log cảnh báo ở dev, không ném lỗi làm sập ứng dụng.
 * - 'strict': ném ContractError nếu phản hồi từ server không khớp cấu trúc bắt buộc.
 * Tuyệt đối không đưa dữ liệu nhạy cảm / PII vào log cảnh báo.
 */

import type { ZodTypeAny, z } from 'zod';
import { ContractError } from '../utils/apiError';

export type ContractMode = 'warn' | 'strict';

export function getContractMode(): ContractMode {
  return (import.meta.env.VITE_CONTRACT_MODE as ContractMode) || 'warn';
}

export function parseResponse<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  ctx: string,
  modeOverride?: ContractMode,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  // KHÔNG đưa giá trị PII hay dữ liệu sức khỏe vào log (chỉ đường dẫn trường và mã lỗi Zod)
  const issues = result.error.issues.map((issue) => {
    const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${pathStr}: ${issue.code}`;
  });

  if (import.meta.env.DEV) {
    console.warn(`[contract] ${ctx}`, issues);
  }

  const mode = modeOverride ?? getContractMode();
  if (mode === 'strict') {
    throw new ContractError('CONTRACT_MISMATCH', ctx, issues);
  }

  // Chế độ warn: chấp nhận dữ liệu thô tạm thời để không chặn luồng tích hợp
  return data as z.infer<S>;
}
