"""Re-export src.backend.api.deps for app namespace compatibility."""
from src.backend.api.deps import (
    get_current_active_user,
    get_current_user,
    get_db,
    security,
)

__all__ = ["security", "get_db", "get_current_user", "get_current_active_user"]
