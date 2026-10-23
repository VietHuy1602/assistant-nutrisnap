"""Re-export auth schemas for app namespace compatibility."""
from src.backend.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

__all__ = ["RegisterRequest", "LoginRequest", "TokenResponse"]
