"""
src/backend/routers/admin_router.py
API quản trị người dùng: thống kê, danh sách, khoá/mở khoá và xoá tài khoản.

Nguyên tắc:
- Chỉ tài khoản có is_admin=True được gọi (403 với người dùng thường).
- Không bao giờ trả password_hash; chỉ trả số liệu tổng hợp (không trả nội dung bữa ăn/chat).
- Admin không thể tự khoá, tự xoá hoặc tự gỡ quyền của chính mình (tránh mất quyền quản trị).
- Các thao tác thay đổi dữ liệu đều qua kiểm tra CSRF (Origin/Referer).
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, col, func, or_, select

from src.backend.models.database import get_session
from src.backend.models.schema import ChatSession, Goal, Meal, User, utc_now
from src.backend.services.api_security import rate_limit_dependency
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_user,
    verify_csrf_protection,
)

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


def require_admin(current_user: AuthenticatedUser = Depends(get_current_user)) -> User:
    """Dependency: chỉ cho phép quản trị viên."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ quản trị viên mới được truy cập.")
    return current_user


class AdminStats(BaseModel):
    total_users: int
    active_users: int
    locked_users: int
    admin_users: int
    new_users_7d: int
    users_with_goal: int
    total_meals: int
    meals_7d: int
    active_loggers_7d: int = Field(description="Số người dùng có ghi bữa ăn trong 7 ngày qua")
    chat_sessions_7d: int
    signups_by_day: list[dict] = Field(description="Số đăng ký mới mỗi ngày trong 14 ngày gần nhất")


class AdminUserItem(BaseModel):
    id: int
    username: str
    email: str
    full_name: str | None = None
    is_active: bool
    is_admin: bool
    created_at: datetime
    has_goal: bool
    meal_count: int
    last_meal_at: datetime | None = None


class AdminUserList(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[AdminUserItem]


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None


def _count(session: Session, statement) -> int:
    return int(session.exec(statement).one() or 0)


@router.get(
    "/stats",
    response_model=AdminStats,
    summary="Thống kê tổng quan người dùng",
    dependencies=[Depends(rate_limit_dependency("admin_read", max_requests=60, window_seconds=60))],
)
def admin_stats(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> AdminStats:
    now = utc_now()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)

    signup_times = session.exec(select(User.created_at).where(User.created_at >= two_weeks_ago)).all()
    per_day: dict[str, int] = {}
    for created in signup_times:
        key = created.date().isoformat()
        per_day[key] = per_day.get(key, 0) + 1
    signups_by_day = [
        {"date": (two_weeks_ago + timedelta(days=i)).date().isoformat(),
         "count": per_day.get((two_weeks_ago + timedelta(days=i)).date().isoformat(), 0)}
        for i in range(14)
    ]

    total = _count(session, select(func.count(User.id)))
    active = _count(session, select(func.count(User.id)).where(User.is_active == True))  # noqa: E712
    return AdminStats(
        total_users=total,
        active_users=active,
        locked_users=total - active,
        admin_users=_count(session, select(func.count(User.id)).where(User.is_admin == True)),  # noqa: E712
        new_users_7d=_count(session, select(func.count(User.id)).where(User.created_at >= week_ago)),
        users_with_goal=_count(session, select(func.count(func.distinct(Goal.user_id)))),
        total_meals=_count(session, select(func.count(Meal.id))),
        meals_7d=_count(session, select(func.count(Meal.id)).where(Meal.logged_at >= week_ago)),
        active_loggers_7d=_count(
            session, select(func.count(func.distinct(Meal.user_id))).where(Meal.logged_at >= week_ago)
        ),
        chat_sessions_7d=_count(
            session, select(func.count(ChatSession.id)).where(ChatSession.started_at >= week_ago)
        ),
        signups_by_day=signups_by_day,
    )


@router.get(
    "/users",
    response_model=AdminUserList,
    summary="Danh sách người dùng (tìm kiếm, phân trang)",
    dependencies=[Depends(rate_limit_dependency("admin_read", max_requests=60, window_seconds=60))],
)
def admin_list_users(
    q: str | None = Query(default=None, max_length=100, description="Tìm theo tên đăng nhập, email, họ tên"),
    status_filter: str = Query(default="all", alias="status", pattern="^(all|active|locked|admin)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> AdminUserList:
    conditions = []
    if q and q.strip():
        pattern = f"%{q.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(User.username).like(pattern),
                func.lower(User.email).like(pattern),
                func.lower(func.coalesce(User.full_name, "")).like(pattern),
            )
        )
    if status_filter == "active":
        conditions.append(User.is_active == True)  # noqa: E712
    elif status_filter == "locked":
        conditions.append(User.is_active == False)  # noqa: E712
    elif status_filter == "admin":
        conditions.append(User.is_admin == True)  # noqa: E712

    total = _count(session, select(func.count(User.id)).where(*conditions))
    users = session.exec(
        select(User)
        .where(*conditions)
        .order_by(col(User.created_at).desc(), col(User.id).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    ids = [u.id for u in users]
    meal_stats: dict[int, tuple[int, datetime | None]] = {}
    goal_ids: set[int] = set()
    if ids:
        for user_id, count, last in session.exec(
            select(Meal.user_id, func.count(Meal.id), func.max(Meal.logged_at))
            .where(col(Meal.user_id).in_(ids))
            .group_by(Meal.user_id)
        ).all():
            meal_stats[user_id] = (int(count), last)
        goal_ids = set(session.exec(select(Goal.user_id).where(col(Goal.user_id).in_(ids))).all())

    items = [
        AdminUserItem(
            id=u.id,
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            is_admin=u.is_admin,
            created_at=u.created_at,
            has_goal=u.id in goal_ids,
            meal_count=meal_stats.get(u.id, (0, None))[0],
            last_meal_at=meal_stats.get(u.id, (0, None))[1],
        )
        for u in users
    ]
    return AdminUserList(total=total, page=page, page_size=page_size, items=items)


def _get_target(session: Session, user_id: int, admin: User) -> User:
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")
    if target.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khoá, tự xoá hoặc tự gỡ quyền quản trị của chính mình.",
        )
    return target


@router.patch(
    "/users/{user_id}",
    response_model=AdminUserItem,
    summary="Khoá/mở khoá hoặc cấp/gỡ quyền quản trị",
    dependencies=[
        Depends(verify_csrf_protection),
        Depends(rate_limit_dependency("admin_write", max_requests=30, window_seconds=60)),
    ],
)
def admin_update_user(
    user_id: int,
    req: AdminUserUpdate,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> AdminUserItem:
    target = _get_target(session, user_id, admin)
    if req.is_active is not None:
        target.is_active = req.is_active
    if req.is_admin is not None:
        target.is_admin = req.is_admin
    session.add(target)
    session.commit()
    session.refresh(target)
    meal_count, last = session.exec(
        select(func.count(Meal.id), func.max(Meal.logged_at)).where(Meal.user_id == target.id)
    ).one()
    has_goal = session.exec(select(Goal.id).where(Goal.user_id == target.id)).first() is not None
    return AdminUserItem(
        id=target.id,
        username=target.username,
        email=target.email,
        full_name=target.full_name,
        is_active=target.is_active,
        is_admin=target.is_admin,
        created_at=target.created_at,
        has_goal=has_goal,
        meal_count=int(meal_count or 0),
        last_meal_at=last,
    )


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Xoá vĩnh viễn tài khoản và toàn bộ dữ liệu liên quan",
    dependencies=[
        Depends(verify_csrf_protection),
        Depends(rate_limit_dependency("admin_write", max_requests=30, window_seconds=60)),
    ],
)
def admin_delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> None:
    target = _get_target(session, user_id, admin)
    # Mục tiêu, cân nặng, bữa ăn, chat... bị xoá theo ON DELETE CASCADE
    session.delete(target)
    session.commit()
