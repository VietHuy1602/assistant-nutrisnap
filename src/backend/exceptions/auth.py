"""
src/backend/exceptions/auth.py
Các lớp ngoại lệ nghiệp vụ (Business Exceptions) dành riêng cho Module Xác thực & JWT.
Lưu ý: Không import HTTPException tại đây để giữ tính phân tách tầng kiến trúc (Clean Architecture).
Tầng API Router sẽ chịu trách nhiệm bắt các ngoại lệ này và ánh xạ sang mã HTTP Status tương ứng.
"""


class InvalidTokenError(Exception):
    """Ném ra khi token JWT không hợp lệ, sai chữ ký, sai thuật toán, hoặc thiếu claim bắt buộc."""

    pass


class TokenExpiredError(Exception):
    """Ném ra khi token JWT đã quá hạn sử dụng (exp claim expired)."""

    pass


class EmailAlreadyExistsError(Exception):
    """Ném ra khi email đăng ký đã tồn tại trong cơ sở dữ liệu."""

    pass


class InvalidCredentialsError(Exception):
    """Ném ra khi email hoặc mật khẩu đăng nhập không chính xác."""

    pass


class InactiveUserError(Exception):
    """Ném ra khi tài khoản người dùng đã bị khóa hoặc vô hiệu hóa (is_active = False)."""

    pass
