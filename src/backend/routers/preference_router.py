"""
src/backend/routers/preference_router.py
API bộ câu hỏi khi tạo tài khoản: lưu câu trả lời, AI tổng hợp hồ sơ ăn uống.
"""

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.backend.models.database import get_session
from src.backend.services.api_security import rate_limit_dependency
from src.backend.services.auth_guard import AuthenticatedUser, get_current_user, verify_csrf_protection
from src.backend.services.preference_service import analyze_needs, get_analysis, get_preferences, refresh_ai_summary, save_preferences, to_dict

router = APIRouter(prefix="/api/v1/preferences", tags=["Preferences"])
Choice = Literal["A", "B", "C", "D"]


class PreferenceAnswers(BaseModel):
    age_group: Choice
    activity: Choice
    goal: Choice
    pace: Choice
    diet: Choice
    taste: Choice
    protein: Choice
    allergies: str = Field(default="", max_length=300)
    cooking: Choice
    meals: Choice
    daily_budget_vnd: int = Field(..., ge=0, le=10_000_000)


@router.get("", summary="Hồ sơ ăn uống từ bộ câu hỏi (null nếu chưa làm)")
def read(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return {"preferences": to_dict(get_preferences(session, user.id))}


@router.put("", summary="Lưu câu trả lời và để AI tổng hợp hồ sơ",
            dependencies=[Depends(verify_csrf_protection), Depends(rate_limit_dependency("preferences", max_requests=10, window_seconds=60))])
def save(req: PreferenceAnswers, background: BackgroundTasks, user: AuthenticatedUser = Depends(get_current_user),
         session: Session = Depends(get_session)):
    row = save_preferences(session, user.id, req.model_dump())
    if row.summary_source != "ai":
        background.add_task(refresh_ai_summary, user.id)
    return {"preferences": to_dict(row)}


@router.get("/analysis", summary="Phân tích nhu cầu đã lưu (null nếu chưa có)")
def read_analysis(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return {"analysis": get_analysis(get_preferences(session, user.id))}


@router.post("/analysis", summary="AI phân tích nhu cầu từ khảo sát + mục tiêu cá nhân",
             dependencies=[Depends(verify_csrf_protection), Depends(rate_limit_dependency("needs_analysis", max_requests=6, window_seconds=60))])
def create_analysis(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    try:
        return {"analysis": analyze_needs(session, user.id)}
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
