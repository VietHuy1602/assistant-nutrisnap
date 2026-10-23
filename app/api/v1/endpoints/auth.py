"""Re-export src.backend.api.v1.endpoints.auth for app namespace compatibility."""
from src.backend.api.v1.endpoints.auth import router

__all__ = ["router"]
