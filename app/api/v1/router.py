"""Re-export src.backend.api.v1.router for app namespace compatibility."""
from src.backend.api.v1.router import api_router

__all__ = ["api_router"]
