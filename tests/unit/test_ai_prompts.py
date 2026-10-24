"""tests/unit/test_ai_prompts.py
Unit tests for NutriSnap AI Coach system prompts and templates (Task T3).
"""

from __future__ import annotations

from src.ai.orchestrator import UserProfileContext
from src.ai.prompts import (
    FEW_SHOT_EXAMPLES,
    SYSTEM_PROMPT_VERSION,
    build_system_prompt,
)


def test_system_prompt_version_and_structure():
    """System prompt must have defined version and few-shot examples."""
    assert SYSTEM_PROMPT_VERSION == "v1"
    assert len(FEW_SHOT_EXAMPLES) >= 8


def test_system_prompt_contains_safety_rules_and_metrics():
    """System prompt must enforce non-starvation, medical disclaimer, and metrics."""
    profile = UserProfileContext(
        user_id=101,
        username="ThanhDat",
        gender="male",
        age=26,
        height_cm=175.0,
        current_weight_kg=72.0,
        target_weight_kg=68.0,
        goal_type="lose_weight",
        target_calories=1900.0,
        target_protein_g=130.0,
        daily_budget_vnd=70000,
    )

    prompt = build_system_prompt(profile, current_date_vn="2026-10-24")

    # Metrics injection
    assert "ThanhDat" in prompt
    assert "175.0 cm" in prompt
    assert "72.0 kg" in prompt
    assert "1900 kcal/ngày" in prompt
    assert "70,000 VNĐ/ngày" in prompt

    # Safety rules
    assert "KHÔNG KHUYÊN NHỊN ĂN" in prompt
    assert "1.200 KCAL" in prompt
    assert "KHÔNG TƯ VẤN Y KHOA" in prompt
    assert "ZERO-TRUST" in prompt
    assert "DETERMINISTIC NUTRITION MATH" in prompt

    # Off-topic / Irrelevant flexibility
    assert "CÂU HỎI KHÔNG LIÊN QUAN" in prompt
    assert "TỪ CHỐI TRẢ LỜI NỘI DUNG NGOÀI LỀ" in prompt

    # Must NOT expose account ID in schema or prompt
    assert "user_id" not in prompt
