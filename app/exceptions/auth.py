"""Re-export src.backend.exceptions.auth for app namespace compatibility."""
from src.backend.exceptions.auth import (
    EmailAlreadyExistsError,
    InactiveUserError,
    InvalidCredentialsError,
    InvalidTokenError,
    TokenExpiredError,
)

__all__ = [
    "InvalidTokenError",
    "TokenExpiredError",
    "EmailAlreadyExistsError",
    "InvalidCredentialsError",
    "InactiveUserError",
]
