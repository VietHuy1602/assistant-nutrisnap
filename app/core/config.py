"""Re-export src.backend.core.config for app namespace compatibility."""
from src.backend.core.config import Settings, get_settings, settings

__all__ = ["Settings", "get_settings", "settings"]
