"""Shared pytest fixtures for NutriSnap unit tests."""

import pytest


@pytest.fixture
def sample_meal():
    """Synthetic meal data; not a measured nutrition result."""
    return {"name": "rice", "estimated_calories": 200.0}
