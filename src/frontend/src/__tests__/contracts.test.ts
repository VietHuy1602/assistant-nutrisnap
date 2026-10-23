/**
 * src/frontend/src/__tests__/contracts.test.ts
 * Suite kiểm thử tự động cho Contract Guard (Zod Schemas & parseResponse).
 * Kiểm tra tính đúng đắn theo nguyên lý Postel (Tolerant Reader), bảo mật PII,
 * và sự phân biệt giữa chế độ 'warn' và 'strict'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  userPublicSchema,
  authResponseSchema,
  goalResponseSchema,
  baseResponseSchema,
} from '../api/contracts';
import { parseResponse } from '../api/parseResponse';
import { ContractError, isContractError } from '../utils/apiError';
import {
  validRegisterFixture,
  validLoginFixture,
  validGoalFixture,
  validBaseResponseFixture,
  authWithoutCreatedAtFixture,
  authWithoutHasGoalFixture,
  authWithExtraFieldsFixture,
  goalWithExtraFieldsFixture,
  invalidGoalMissingTdeeFixture,
  invalidGoalWrongMacroTypeFixture,
  invalidUserMissingUsernameFixture,
} from './fixtures/contracts';

describe('Contract Guard — Zod Schemas & Tolerant Reader', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('1. Fixture docs/02 §4.1 register hợp lệ và has_goal tự fallback về false', () => {
    const result = authResponseSchema.safeParse(validRegisterFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.has_goal).toBe(false);
      expect(result.data.user.username).toBe('thanhdat');
      expect(result.data.user.created_at).toBe('2026-10-20T21:45:00Z');
    }
  });

  it('2. Fixture docs/02 §4.1 login hợp lệ dù user KHÔNG có created_at (Tolerant Reader)', () => {
    const result = authResponseSchema.safeParse(validLoginFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.has_goal).toBe(true);
      expect(result.data.user.id).toBe(1);
      expect(result.data.user.created_at).toBeUndefined();
    }
  });

  it('2b. Auth response thiếu has_goal tự động fallback về false', () => {
    const result = authResponseSchema.safeParse(authWithoutHasGoalFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.has_goal).toBe(false);
      expect(result.data.user.username).toBe('minhduc');
    }
  });

  it('3. Fixture docs/02 §4.2 goal hợp lệ đầy đủ TDEE, BMR và Macro', () => {
    const result = goalResponseSchema.safeParse(validGoalFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tdee_calories).toBe(2150.0);
      expect(result.data.target_protein_g).toBe(125.0);
      expect(result.data.target_carbs_g).toBe(185.0);
      expect(result.data.target_fat_g).toBe(45.0);
    }
  });

  it('4. baseResponseSchema parse thành công phản hồi chuẩn BaseResponse', () => {
    const result = baseResponseSchema.safeParse(validBaseResponseFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(true);
      expect(result.data.message).toBe('Thao tác thành công.');
    }
  });

  it('5. Thiếu created_at trong userPublicSchema vẫn parse thành công (optional)', () => {
    const result = userPublicSchema.safeParse(authWithoutCreatedAtFixture.user);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('nguyenkhoi');
      expect(result.data.created_at).toBeUndefined();
    }
  });

  it('6. Thiếu tdee_calories (trường UI bắt buộc) trong goalResponseSchema gây lỗi validation', () => {
    const result = goalResponseSchema.safeParse(invalidGoalMissingTdeeFixture);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('tdee_calories');
    }
  });

  it('7. Sai kiểu target_protein_g (chuỗi thay vì số) trong goalResponseSchema gây lỗi validation', () => {
    const result = goalResponseSchema.safeParse(invalidGoalWrongMacroTypeFixture);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.filter((i) => i.path.includes('target_protein_g'));
      expect(issues.length).toBeGreaterThan(0);
    }
  });

  it('8. Tolerant Reader: Field thừa trong Auth và Goal bị bỏ qua không gây lỗi', () => {
    const authParsed = authResponseSchema.safeParse(authWithExtraFieldsFixture);
    expect(authParsed.success).toBe(true);
    if (authParsed.success) {
      expect((authParsed.data as Record<string, unknown>).server_load_ms).toBeUndefined();
    }

    const goalParsed = goalResponseSchema.safeParse(goalWithExtraFieldsFixture);
    expect(goalParsed.success).toBe(true);
  });

  it('9. Chế độ warn: parseResponse ghi log cảnh báo nhưng KHÔNG ném lỗi, trả về dữ liệu thô', () => {
    const parsed = parseResponse(
      goalResponseSchema,
      invalidGoalMissingTdeeFixture,
      'GET /goals',
      'warn',
    );
    // Vẫn trả về dữ liệu thô để không chặn ứng dụng ở chế độ warn
    expect(parsed).toEqual(invalidGoalMissingTdeeFixture);
    expect(warnSpy).toHaveBeenCalled();
    const warnCall = warnSpy.mock.calls[0];
    expect(warnCall[0]).toContain('[contract] GET /goals');
  });

  it('10. Chế độ strict: parseResponse ném ContractError với mã CONTRACT_MISMATCH', () => {
    expect(() => {
      parseResponse(
        goalResponseSchema,
        invalidGoalMissingTdeeFixture,
        'GET /goals',
        'strict',
      );
    }).toThrowError(ContractError);

    try {
      parseResponse(
        goalResponseSchema,
        invalidGoalMissingTdeeFixture,
        'GET /goals',
        'strict',
      );
    } catch (err) {
      expect(isContractError(err)).toBe(true);
      if (isContractError(err)) {
        expect(err.code).toBe('CONTRACT_MISMATCH');
        expect(err.context).toBe('GET /goals');
        expect(err.issues).toContain('tdee_calories: invalid_type');
      }
    }
  });

  it('11. Bảo mật & Quyền riêng tư: Console warning trong parseResponse KHÔNG chứa giá trị PII', () => {
    parseResponse(
      authResponseSchema,
      invalidUserMissingUsernameFixture,
      'POST /auth/register',
      'warn',
    );

    expect(warnSpy).toHaveBeenCalled();
    const loggedArgs = warnSpy.mock.calls[0];
    const issuesString = JSON.stringify(loggedArgs);

    // Kiểm tra không có email hay giá trị nhạy cảm nằm trong log cảnh báo
    expect(issuesString).not.toContain('missing_username@example.com');
    // Chỉ chứa đường dẫn thuộc tính và mã lỗi Zod
    expect(issuesString).toContain('user.username: invalid_type');
  });

  it('12. ContractError hiển thị thông điệp thân thiện với người dùng và che giấu chi tiết kỹ thuật', () => {
    const error = new ContractError('CONTRACT_MISMATCH', 'GET /goals', ['tdee_calories: invalid_type']);
    expect(error.message).toBe(
      'Máy chủ trả về dữ liệu không đúng định dạng (mã CONTRACT_MISMATCH). Vui lòng thử lại hoặc liên hệ nhóm phát triển.',
    );
    expect(error.name).toBe('ContractError');
  });
});
