import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from '../pages/RegisterPage';
import { ApiError } from '../utils/apiError';

const mockRegister = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    register: mockRegister,
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Báo lỗi khi mật khẩu yếu (thiếu chữ số hoặc dưới 8 ký tự)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const usernameInput = screen.getByLabelText(/Tên đăng nhập/i);
    const emailInput = screen.getByLabelText(/Địa chỉ Email/i);
    const passInput = screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' });
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });

    await user.type(usernameInput, 'newuser');
    await user.type(emailInput, 'user@example.com');
    await user.type(passInput, 'abcdefgh'); // không có số
    await user.type(confirmInput, 'abcdefgh');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Mật khẩu phải chứa ít nhất một chữ số')).toBeInTheDocument();
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('2. Báo lỗi khi confirmPassword không khớp với password', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const passInput = screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' });
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });

    await user.type(passInput, 'Password123');
    await user.type(confirmInput, 'Password456');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('3. Payload gửi đi chỉ gồm username, email, password — KHÔNG có confirmPassword', async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const usernameInput = screen.getByLabelText(/Tên đăng nhập/i);
    const emailInput = screen.getByLabelText(/Địa chỉ Email/i);
    const passInput = screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' });
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });

    await user.type(usernameInput, 'validuser');
    await user.type(emailInput, 'valid@example.com');
    await user.type(passInput, 'Secret123');
    await user.type(confirmInput, 'Secret123');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        username: 'validuser',
        email: 'valid@example.com',
        password: 'Secret123',
      });
    });

    const callArgs = mockRegister.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('confirmPassword');
  });

  it('4. Luồng thành công: gọi register rồi điều hướng sang /goal-setup', async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const usernameInput = screen.getByLabelText(/Tên đăng nhập/i);
    const emailInput = screen.getByLabelText(/Địa chỉ Email/i);
    const passInput = screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' });
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });

    await user.type(usernameInput, 'thanhdat');
    await user.type(emailInput, 'dat@example.com');
    await user.type(passInput, 'Password123');
    await user.type(confirmInput, 'Password123');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/goal-setup',
        expect.objectContaining({ replace: true }),
      );
    });
  });

  it('5. Xử lý lỗi 409 trùng tài khoản hoặc email', async () => {
    mockRegister.mockRejectedValueOnce(
      new ApiError('Tên đăng nhập hoặc địa chỉ email đã được sử dụng.', { status: 409 }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const usernameInput = screen.getByLabelText(/Tên đăng nhập/i);
    const emailInput = screen.getByLabelText(/Địa chỉ Email/i);
    const passInput = screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' });
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });

    await user.type(usernameInput, 'existinguser');
    await user.type(emailInput, 'exist@example.com');
    await user.type(passInput, 'Password123');
    await user.type(confirmInput, 'Password123');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Tên đăng nhập hoặc địa chỉ email đã được sử dụng.',
      );
    });
  });

  it('6. Double-submit bị chặn: nút bị vô hiệu hóa khi đang xử lý', async () => {
    let resolveRegister: () => void;
    const registerPromise = new Promise<void>((resolve) => {
      resolveRegister = resolve;
    });
    mockRegister.mockReturnValueOnce(registerPromise);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const usernameInput = screen.getByLabelText(/Tên đăng nhập/i);
    const emailInput = screen.getByLabelText(/Địa chỉ Email/i);
    const passInput = screen.getByLabelText(/^Mật khẩu/i, { selector: 'input' });
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i });

    await user.type(usernameInput, 'doubleuser');
    await user.type(emailInput, 'double@example.com');
    await user.type(passInput, 'Password123');
    await user.type(confirmInput, 'Password123');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
      expect(submitBtn).toHaveTextContent('Đang tạo tài khoản...');
    });

    // Cleanup promise
    await act(async () => {
      resolveRegister!();
    });
  });
});
