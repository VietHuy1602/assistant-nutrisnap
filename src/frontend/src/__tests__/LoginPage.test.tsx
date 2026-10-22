import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { ApiError } from '../utils/apiError';

// Mock AuthContext
const mockLogin = vi.fn();
let mockSessionExpired = false;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    sessionExpired: mockSessionExpired,
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionExpired = false;
  });

  it('1. Render đầy đủ các trường rỗng và các thành phần giao diện', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const userInput = screen.getByLabelText(/Tên đăng nhập hoặc Email/i);
    const passInput = screen.getByLabelText(/Mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i });
    const registerLink = screen.getByRole('link', { name: /Đăng ký/i });

    expect(userInput).toBeInTheDocument();
    expect(userInput).toHaveValue('');
    expect(passInput).toBeInTheDocument();
    expect(passInput).toHaveValue('');
    expect(submitBtn).toBeInTheDocument();
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('2. Validate rỗng: bấm submit khi để trống sẽ hiển thị thông báo lỗi và không gọi login', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Vui lòng nhập tên đăng nhập hoặc email')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('3. Submit thành công: gọi login() và điều hướng sang trang tương ứng', async () => {
    mockLogin.mockResolvedValueOnce(true); // hasGoal = true
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const userInput = screen.getByLabelText(/Tên đăng nhập hoặc Email/i);
    const passInput = screen.getByLabelText(/Mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i });

    await user.type(userInput, 'testuser');
    await user.type(passInput, 'Password123');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        username_or_email: 'testuser',
        password: 'Password123',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('4. Submit lỗi 401: hiển thị thông báo "Tên đăng nhập hoặc mật khẩu không đúng."', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError('Unauthorized', { status: 401 }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const userInput = screen.getByLabelText(/Tên đăng nhập hoặc Email/i);
    const passInput = screen.getByLabelText(/Mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i });

    await user.type(userInput, 'wronguser');
    await user.type(passInput, 'wrongpass');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Tên đăng nhập hoặc mật khẩu không đúng.',
      );
    });
  });

  it('5. Trạng thái hết hạn phiên: hiển thị cảnh báo khi sessionExpired = true', () => {
    mockSessionExpired = true;

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
    );
  });

  it('6. Bảo mật: Không bao giờ gọi localStorage hoặc sessionStorage', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockLogin.mockResolvedValueOnce(false);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const userInput = screen.getByLabelText(/Tên đăng nhập hoặc Email/i);
    const passInput = screen.getByLabelText(/Mật khẩu/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i });

    await user.type(userInput, 'myuser');
    await user.type(passInput, 'Pass1234');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
