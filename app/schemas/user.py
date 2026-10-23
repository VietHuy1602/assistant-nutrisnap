"""Re-export user schema for app namespace compatibility."""
from src.backend.schemas.user import UserPublic

__all__ = ["UserPublic"]
