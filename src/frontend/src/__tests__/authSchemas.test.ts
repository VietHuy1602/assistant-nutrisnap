import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '../schemas/authSchemas';

describe('authSchemas validation', () => {
  describe('loginSchema', () => {
    it('1. Hợp lệ với username_or_email và password', () => {
      const res = loginSchema.safeParse({
        username_or_email: 'thanhdat',
        password: 'Password123',
      });
      expect(res.success).toBe(true);
    });

    it('2. Báo lỗi khi để trống username_or_email hoặc password', () => {
      expect(loginSchema.safeParse({ username_or_email: '', password: '123' }).success).toBe(
        false,
      );
      expect(loginSchema.safeParse({ username_or_email: 'user', password: '' }).success).toBe(
        false,
      );
    });
  });

  describe('registerSchema', () => {
    it('3. Hợp lệ khi các trường đầy đủ, đúng định dạng và khớp confirmPassword', () => {
      const res = registerSchema.safeParse({
        username: 'nguyenvana',
        email: 'vana@example.com',
        password: 'SecurePassword1',
        confirmPassword: 'SecurePassword1',
      });
      expect(res.success).toBe(true);
    });

    it('4. Báo lỗi khi username < 3 hoặc > 50 ký tự', () => {
      expect(
        registerSchema.safeParse({
          username: 'ab',
          email: 'ab@example.com',
          password: 'Pass1234',
          confirmPassword: 'Pass1234',
        }).success,
      ).toBe(false);

      expect(
        registerSchema.safeParse({
          username: 'a'.repeat(51),
          email: 'long@example.com',
          password: 'Pass1234',
          confirmPassword: 'Pass1234',
        }).success,
      ).toBe(false);
    });

    it('5. Báo lỗi khi email sai định dạng', () => {
      expect(
        registerSchema.safeParse({
          username: 'user123',
          email: 'invalid-email',
          password: 'Pass1234',
          confirmPassword: 'Pass1234',
        }).success,
      ).toBe(false);
    });

    it('6. Báo lỗi khi mật khẩu thiếu chữ cái hoặc thiếu chữ số hoặc < 8 ký tự', () => {
      // < 8 ký tự
      expect(
        registerSchema.safeParse({
          username: 'user123',
          email: 'u@example.com',
          password: 'Pass1',
          confirmPassword: 'Pass1',
        }).success,
      ).toBe(false);

      // Thiếu chữ số
      expect(
        registerSchema.safeParse({
          username: 'user123',
          email: 'u@example.com',
          password: 'PasswordOnly',
          confirmPassword: 'PasswordOnly',
        }).success,
      ).toBe(false);

      // Thiếu chữ cái
      expect(
        registerSchema.safeParse({
          username: 'user123',
          email: 'u@example.com',
          password: '1234567890',
          confirmPassword: '1234567890',
        }).success,
      ).toBe(false);
    });

    it('7. Báo lỗi khi confirmPassword không khớp với password', () => {
      const res = registerSchema.safeParse({
        username: 'user123',
        email: 'u@example.com',
        password: 'Password123',
        confirmPassword: 'Password456',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Mật khẩu xác nhận không khớp');
      }
    });
  });
});
