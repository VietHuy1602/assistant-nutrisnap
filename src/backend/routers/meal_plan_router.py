"""
src/backend/routers/meal_plan_router.py
API Thực đơn gợi ý: tạo thực đơn, đổi món không thích, lưu thực đơn đã đồng ý.
"""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from src.backend.models.database import get_session
from src.backend.models.schema import MealPlan
from src.backend.services.api_security import rate_limit_dependency
from src.backend.services.auth_guard import AuthenticatedUser, get_current_user, verify_csrf_protection
from src.backend.services.meal_plan_service import REPLACE_REASONS, generate_plan, regenerate_days, replace_item
from src.backend.services.recipe_service import RecipeUnavailable, get_recipe

router = APIRouter(prefix="/api/v1/meal-plan", tags=["Meal Plan"])
VN_TZ = timezone(timedelta(hours=7))


def _today() -> date:
    return datetime.now(VN_TZ).date()


class GenerateRequest(BaseModel):
    days: int = Field(default=1, ge=1, le=7)
    start_date: date | None = None


class ReplaceRequest(BaseModel):
    plan: dict[str, Any]
    day_index: int = Field(..., ge=0, le=6)
    meal_type: str = Field(..., pattern="^(breakfast|lunch|dinner|snack)$")
    food_id: int
    reason: str = Field(default="taste", max_length=40)
    note: str | None = Field(default=None, max_length=200)


class RegenerateDaysRequest(BaseModel):
    plan: dict[str, Any]
    day_indexes: list[int] = Field(..., min_length=1, max_length=7)


class AcceptRequest(BaseModel):
    plan: dict[str, Any]


def _check_plan(plan: dict[str, Any]) -> None:
    days = plan.get("plan")
    if not isinstance(days, list) or not 1 <= len(days) <= 7:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Thực đơn không hợp lệ.")


@router.post("/generate", summary="Tạo thực đơn gợi ý (chưa lưu)",
             dependencies=[Depends(verify_csrf_protection), Depends(rate_limit_dependency("meal_plan", max_requests=20, window_seconds=60))])
def generate(req: GenerateRequest, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return generate_plan(session, user.id, req.start_date or _today(), req.days)


@router.post("/replace", summary="Đổi một món người dùng không thích",
             dependencies=[Depends(verify_csrf_protection), Depends(rate_limit_dependency("meal_plan", max_requests=40, window_seconds=60))])
def replace(req: ReplaceRequest, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    _check_plan(req.plan)
    try:
        return replace_item(session, user.id, req.plan, req.day_index, req.meal_type, req.food_id, reason=req.reason, note=req.note)
    except (StopIteration, IndexError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Không tìm thấy món cần đổi.") from exc


@router.post("/regenerate-days", summary="Tạo lại một hoặc vài ngày, giữ nguyên các ngày khác",
             dependencies=[Depends(verify_csrf_protection), Depends(rate_limit_dependency("meal_plan", max_requests=20, window_seconds=60))])
def regenerate(req: RegenerateDaysRequest, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    _check_plan(req.plan)
    try:
        return regenerate_days(session, user.id, req.plan, req.day_indexes)
    except (IndexError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ngày cần đổi không hợp lệ.") from exc


@router.post("/accept", summary="Lưu thực đơn người dùng đã đồng ý", status_code=201,
             dependencies=[Depends(verify_csrf_protection)])
def accept(req: AcceptRequest, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    _check_plan(req.plan)
    row = MealPlan(user_id=user.id, start_date=str(req.plan.get("start_date", _today().isoformat())),
                   days=len(req.plan["plan"]), plan_json=json.dumps(req.plan, ensure_ascii=False))
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"id": row.id, "status": "accepted", "plan": req.plan}


@router.get("/current", summary="Thực đơn đã đồng ý gần nhất")
def current(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    row = session.exec(select(MealPlan).where(MealPlan.user_id == user.id).order_by(col(MealPlan.id).desc())).first()
    if not row:
        return {"plan": None}
    return {"id": row.id, "status": row.status, "plan": json.loads(row.plan_json)}


@router.get("/reasons", summary="Danh sách lý do đổi món")
def reasons(user: AuthenticatedUser = Depends(get_current_user)):
    return [{"key": k, "label": v} for k, v in REPLACE_REASONS.items()]


@router.get("/recipe/{food_id}", summary="Nguyên liệu và cách nấu (1 khẩu phần)",
            dependencies=[Depends(rate_limit_dependency("recipe", max_requests=30, window_seconds=60))])
def recipe(food_id: int, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)):
    try:
        return get_recipe(session, food_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RecipeUnavailable as exc:
        raise HTTPException(status_code=503, detail="Chưa tạo được công thức lúc này, vui lòng thử lại sau.") from exc
