"""
src/backend/services/assistant_tools.py
Bộ 4 hàm thực thi Tool Calling và dịch vụ quản lý/lưu trữ hội thoại bảo mật (Zero-Trust).

Tuân thủ nghiêm ngặt các nguyên tắc:
1. Zero-Trust Tool Calling:
   - Cấm tin tưởng `user_id` từ LLM / client. Luôn ép sử dụng `authenticated_user_id` từ JWT.
   - `dispatch_tool_call` loại bỏ triệt để các tham số giả mạo.
2. Two-step Confirmation:
   - `exec_log_meal` chỉ tính nháp khi `is_confirmed=False` (không ghi DB).
   - Chỉ lưu vào `meals` & `meal_items` khi `is_confirmed=True`.
3. Cô lập dữ liệu hội thoại 2 cấp:
   - Kiểm tra quyền sở hữu phiên cha `chat_sessions` trước mọi thao tác trên `chat_messages`.
   - Chặn tuyệt đối truy cập chéo tài khoản (ném PermissionError / HTTP 403).
4. Tính toán dinh dưỡng tất định (Zero-Hallucination):
   - Tính toán đại số dựa trên bảng `food_references`, kèm tuyên bố miễn trừ trách nhiệm y khoa.
"""

import json
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlmodel import Session, select, update

from src.backend.core.config import get_settings
from src.backend.models.schema import (
    ChatMessage,
    ChatSession,
    FoodReference,
    Goal,
    Meal,
    MealItem,
    PendingAction,
    WeightLog,
    get_vn_today,
    utc_now,
)
from src.backend.schemas.assistant_tools import (
    GetDailyNutritionArgs,
    GetProgressSummaryArgs,
    LogMealLLMArgs,
    LogMealUserActionArgs,
    RecommendMealsArgs,
)
from src.backend.services.nutrition_service import (
    DISCLAIMER_TEXT,
    MealItemInput,
    MealLogRequest,
    get_daily_dashboard_data,
    log_user_meal,
    resolve_food_reference,
)
from src.backend.services.tool_context import ToolContext, log_tool_audit
from src.backend.services.tool_security import (
    sanitize_llm_tool_arguments,
    verify_session_ownership,
)

logger = logging.getLogger(__name__)


def _extract_user_id(authenticated_user_id: ToolContext | int) -> int:
    """Helper trích xuất user_id từ ToolContext hoặc int."""
    if isinstance(authenticated_user_id, ToolContext):
        return authenticated_user_id.authenticated_user_id
    return int(authenticated_user_id)


MEAL_TYPE_MAPPING = {
    "breakfast": "Sáng",
    "sang": "Sáng",
    "sáng": "Sáng",
    "bữa sáng": "Sáng",
    "lunch": "Trưa",
    "trua": "Trưa",
    "trưa": "Trưa",
    "bữa trưa": "Trưa",
    "dinner": "Tối",
    "toi": "Tối",
    "tối": "Tối",
    "bữa tối": "Tối",
    "snack": "Phụ",
    "phu": "Phụ",
    "phụ": "Phụ",
    "bữa phụ": "Phụ",
}


# ==============================================================================
# NHÓM 1: 4 HÀM THỰC THI TOOL CALLING (CORE BACKEND TOOL EXECUTORS)
# ==============================================================================


def exec_get_daily_nutrition(
    session: Session,
    authenticated_user_id: ToolContext | int,
    date_str: str | date | None = None,
) -> dict[str, Any]:
    """Lấy tổng hợp dinh dưỡng và so sánh với mục tiêu hàng ngày của người dùng.

    Hỗ trợ các biến thể thời gian: None / "" / "today" / "hom_nay" / "yesterday" / "hom_qua" / "YYYY-MM-DD".
    """
    uid = _extract_user_id(authenticated_user_id)
    target_date: date
    if date_str is None or date_str == "":
        target_date = get_vn_today()
    elif isinstance(date_str, date):
        target_date = date_str
    elif isinstance(date_str, str):
        clean_str = date_str.strip().lower()
        if clean_str in ("today", "hom_nay", "hôm nay"):
            target_date = get_vn_today()
        elif clean_str in ("yesterday", "hom_qua", "hôm qua"):
            target_date = get_vn_today() - timedelta(days=1)
        else:
            try:
                target_date = date.fromisoformat(clean_str)
            except Exception as exc:
                raise ValueError(
                    f"Định dạng ngày không hợp lệ: '{date_str}'. Vui lòng sử dụng 'YYYY-MM-DD'."
                ) from exc
    else:
        raise ValueError(f"Định dạng ngày không hợp lệ: {date_str}")

    dash_data = get_daily_dashboard_data(
        session=session,
        authenticated_user_id=uid,
        target_date=target_date,
    )

    return {
        "tool_name": "get_daily_nutrition",
        "user_id": uid,
        "date": target_date.isoformat(),
        "targets": dash_data["targets"],
        "consumed": dash_data["consumed"],
        "remaining": dash_data["remaining"],
        "meals_count": dash_data["meals_count"],
        "meals": dash_data["meals"],
        "target_calories": dash_data["target_calories"],
        "consumed_calories": dash_data["consumed_calories"],
        "remaining_calories": dash_data["remaining_calories"],
        "calories_progress_percent": dash_data["calories_progress_percent"],
        "macros": dash_data["macros"],
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_log_meal(
    session: Session,
    authenticated_user_id: ToolContext | int,
    meal_type: str,
    items_list: list[dict[str, Any]],
    is_confirmed: bool = False,
    image_path: str | None = None,
    logged_at: datetime | str | None = None,
) -> dict[str, Any]:
    """Ghi nhận hoặc xem trước bữa ăn tuân thủ Two-step Confirmation.

    - is_confirmed = False: Chỉ tính nháp calo/macro, không ghi CSDL, trả về pending_confirmation.
    - is_confirmed = True: Ghi nguyên tử vào bảng meals và meal_items.
    """
    uid = _extract_user_id(authenticated_user_id)
    clean_meal_type_key = meal_type.strip().lower()
    db_meal_type = MEAL_TYPE_MAPPING.get(clean_meal_type_key)
    if not db_meal_type:
        if meal_type.strip() in {"Sáng", "Trưa", "Tối", "Phụ"}:
            db_meal_type = meal_type.strip()
        else:
            raise ValueError(
                f"Loại bữa ăn không hợp lệ: '{meal_type}'. Hỗ trợ: Sáng, Trưa, Tối, Phụ."
            )

    if not items_list:
        raise ValueError("Danh sách món ăn không được để trống.")

    converted_items: list[MealItemInput] = []
    for item in items_list:
        if isinstance(item, MealItemInput):
            converted_items.append(item)
            continue

        food_id = item.get("food_id")
        food_name = item.get("food_name") or item.get("name")
        if food_name and len(str(food_name).strip()) > 200:
            raise ValueError(f"Tên món ăn quá dài (tối đa 200 ký tự): {food_name}")

        grams = item.get("estimated_gram")
        if grams is None:
            grams = item.get("estimated_grams")
        if grams is None:
            grams = item.get("grams")
        if grams is None:
            grams = item.get("gram", 100.0)

        try:
            val_gram = float(grams)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Khối lượng món ăn không hợp lệ: {grams}") from exc

        if val_gram <= 0:
            raise ValueError(f"Khối lượng món ăn phải lớn hơn 0 gram: {val_gram}")
        if val_gram > 5000:
            raise ValueError(f"Khối lượng món ăn vượt quá giới hạn tối đa 5000g: {val_gram}")

        eaten_ratio = float(item.get("eaten_ratio", 1.0))
        if eaten_ratio <= 0 or eaten_ratio > 5.0:
            raise ValueError(f"Tỷ lệ khẩu phần ăn không hợp lệ: {eaten_ratio}")

        converted_items.append(
            MealItemInput(
                food_id=food_id,
                food_name=food_name,
                estimated_gram=val_gram,
                eaten_ratio=eaten_ratio,
            )
        )

    logged_time: datetime | None = None
    if isinstance(logged_at, str):
        logged_time = datetime.fromisoformat(logged_at)
    elif isinstance(logged_at, datetime):
        logged_time = logged_at

    req = MealLogRequest(
        meal_type=db_meal_type,
        items=converted_items,
        is_confirmed=is_confirmed,
        image_path=image_path,
        logged_at=logged_time,
    )

    response = log_user_meal(
        session=session,
        authenticated_user_id=uid,
        req=req,
    )

    confirmation_id: str | None = None
    expires_at_iso: str | None = None
    if not is_confirmed:
        # Tạo bản ghi PendingAction (README_04)
        now = utc_now()
        ttl_minutes = get_settings().PENDING_ACTION_TTL_MINUTES
        expires_at = now + timedelta(minutes=ttl_minutes)
        action_id = str(uuid.uuid4())

        payload_items = [
            {
                "food_id": ci.food_id,
                "food_name": ci.food_name,
                "estimated_gram": ci.estimated_gram,
                "eaten_ratio": ci.eaten_ratio,
            }
            for ci in converted_items
        ]
        payload_data = {
            "meal_type": db_meal_type,
            "items": payload_items,
            "image_path": image_path,
            "logged_at": logged_time.isoformat() if logged_time else None,
        }
        pending_act = PendingAction(
            id=action_id,
            user_id=uid,
            tool_name="log_meal",
            payload=json.dumps(payload_data, ensure_ascii=False),
            status="pending",
            created_at=now,
            expires_at=expires_at,
        )
        session.add(pending_act)
        session.commit()
        session.refresh(pending_act)
        confirmation_id = pending_act.id
        expires_at_iso = pending_act.expires_at.isoformat()

    action_card = {
        "type": "confirm_log_meal",
        "status": "pending_user_action" if not is_confirmed else "confirmed",
        "confirmation_id": confirmation_id,
        "data": {
            "meal_type": db_meal_type,
            "items": [
                {
                    "food_id": ci.food_id,
                    "food_name": ci.food_name,
                    "estimated_gram": ci.effective_gram,
                    "calories": ci.calories,
                    "protein_g": ci.protein_g,
                    "carbs_g": ci.carbs_g,
                    "fat_g": ci.fat_g,
                }
                for ci in response.nutrition.items
            ],
            "total_calories": response.nutrition.total_calories,
        },
    }

    return {
        "tool_name": "log_meal",
        "status": response.status,
        "confirmation_id": confirmation_id,
        "expires_at": expires_at_iso,
        "requires_confirmation": not is_confirmed,
        "meal_id": response.meal_id,
        "meal_type": db_meal_type,
        "logged_at": (
            response.logged_at.isoformat()
            if hasattr(response.logged_at, "isoformat")
            else str(response.logged_at)
        ),
        "nutrition": response.nutrition.model_dump(),
        "preview": response.nutrition.model_dump(),
        "action_card": action_card,
        "llm_instruction": (
            "Bữa ăn đang ở trạng thái chờ người dùng bấm xác nhận trên giao diện. "
            "Chưa được lưu vào nhật ký bữa ăn."
            if not is_confirmed
            else "Đã lưu vào nhật ký bữa ăn."
        ),
        "disclaimer": DISCLAIMER_TEXT,
    }


def confirm_pending_action(
    session: Session,
    authenticated_user_id: ToolContext | int,
    confirmation_id: str,
) -> dict[str, Any]:
    """Xác nhận thực thi hành động chờ (PendingAction) an toàn và nguyên tử (README_04):

    - Tìm theo id VÀ user_id đang đăng nhập (chống IDOR). Không có hoặc không phải chủ -> 404 Not Found.
    - Hết hạn -> đánh dấu expired, trả 410 Gone.
    - Đã confirmed hoặc cancelled -> trả 409 Conflict (ngăn chặn double-commit).
    - UPDATE nguyên tử với rowcount check để đảm bảo 2 request song song chỉ có duy nhất 1 request thành công.
    - Ghi Meal và cập nhật trạng thái trong cùng một transaction.
    """
    uid = _extract_user_id(authenticated_user_id)
    clean_id = confirmation_id.strip()

    pending = session.exec(
        select(PendingAction).where(
            PendingAction.id == clean_id,
            PendingAction.user_id == uid,
        )
    ).first()

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy yêu cầu xác nhận hoặc bạn không có quyền truy cập",
        )

    now = utc_now()
    exp = pending.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)

    # 1. Kiểm tra hết hạn
    if pending.status == "pending" and now >= exp:
        pending.status = "expired"
        pending.resolved_at = now
        session.add(pending)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Yêu cầu xác nhận đã hết hạn. Vui lòng thực hiện lại.",
        )

    # 2. Kiểm tra trạng thái đã giải quyết
    if pending.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu xác nhận này đã bị hủy trước đó.",
        )
    if pending.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu xác nhận này đã được thực hiện trước đó.",
        )
    if pending.status == "expired":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Yêu cầu xác nhận đã hết hạn.",
        )

    # 3. Chuyển trạng thái pending -> confirmed bằng UPDATE nguyên tử kiểm tra rowcount
    stmt = (
        update(PendingAction)
        .where(
            PendingAction.id == clean_id,
            PendingAction.status == "pending",
        )
        .values(
            status="confirmed",
            resolved_at=now,
        )
    )
    result = session.exec(stmt)
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu xác nhận đang được xử lý hoặc đã được thực hiện bởi một tiến trình khác.",
        )

    # 4. Ghi nhận Meal từ payload đã lưu phía server (không nhận từ client)
    try:
        payload = json.loads(pending.payload)
    except Exception as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dữ liệu payload của yêu cầu xác nhận bị lỗi: {exc}",
        ) from exc

    raw_items = payload.get("items", [])
    converted_items: list[MealItemInput] = []
    for item in raw_items:
        converted_items.append(
            MealItemInput(
                food_id=item.get("food_id"),
                food_name=item.get("food_name"),
                estimated_gram=float(item.get("estimated_gram", 100.0)),
                eaten_ratio=float(item.get("eaten_ratio", 1.0)),
            )
        )

    logged_time: datetime | None = None
    if payload.get("logged_at"):
        try:
            logged_time = datetime.fromisoformat(payload["logged_at"])
        except Exception:
            logged_time = None

    req = MealLogRequest(
        meal_type=payload.get("meal_type", "Trưa"),
        items=converted_items,
        is_confirmed=True,
        image_path=payload.get("image_path"),
        logged_at=logged_time,
    )

    meal_response = log_user_meal(
        session=session,
        authenticated_user_id=uid,
        req=req,
    )
    session.commit()

    return {
        "success": True,
        "status": "confirmed",
        "confirmation_id": clean_id,
        "meal_id": meal_response.meal_id,
        "total_calories": meal_response.total_calories,
        "message": f"Đã ghi nhận bữa ăn thành công! Mã bữa ăn: {meal_response.meal_id}.",
        "disclaimer": DISCLAIMER_TEXT,
    }


def cancel_pending_action(
    session: Session,
    authenticated_user_id: ToolContext | int,
    confirmation_id: str,
) -> dict[str, Any]:
    """Hủy hành động chờ xác nhận (README_04)."""
    uid = _extract_user_id(authenticated_user_id)
    clean_id = confirmation_id.strip()

    pending = session.exec(
        select(PendingAction).where(
            PendingAction.id == clean_id,
            PendingAction.user_id == uid,
        )
    ).first()

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy yêu cầu xác nhận hoặc bạn không có quyền truy cập",
        )

    now = utc_now()
    exp = pending.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)

    if pending.status == "pending" and now >= exp:
        pending.status = "expired"
        pending.resolved_at = now
        session.add(pending)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Yêu cầu xác nhận đã hết hạn.",
        )

    if pending.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu xác nhận này đã bị hủy trước đó.",
        )
    if pending.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể hủy yêu cầu đã được xác nhận lưu.",
        )
    if pending.status == "expired":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Yêu cầu xác nhận đã hết hạn.",
        )

    stmt = (
        update(PendingAction)
        .where(
            PendingAction.id == clean_id,
            PendingAction.status == "pending",
        )
        .values(
            status="cancelled",
            resolved_at=now,
        )
    )
    result = session.exec(stmt)
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu xác nhận đang được xử lý hoặc đã thay đổi trạng thái.",
        )

    session.commit()
    return {
        "success": True,
        "status": "cancelled",
        "confirmation_id": clean_id,
        "message": "Đã hủy yêu cầu ghi nhận bữa ăn thành công.",
    }


def exec_recommend_meals(
    session: Session,
    authenticated_user_id: ToolContext | int,
    remaining_calories: float | None = None,
    budget_vnd: int | None = None,
    meal_portion_gram: float | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Gợi ý các món ăn Việt Nam từ food_references thỏa mãn hạn mức calo và ngân sách VNĐ."""
    uid = _extract_user_id(authenticated_user_id)
    gentle_note: str | None = None
    budget_exceeded = False

    if remaining_calories is None or budget_vnd is None:
        dash = get_daily_dashboard_data(session, uid)
        if remaining_calories is None:
            remaining_calories = float(dash["remaining"]["calories"])
        if budget_vnd is None:
            raw_budget = int(dash["remaining"]["budget_vnd"])
            if raw_budget <= 0:
                budget_exceeded = True
                budget_vnd = 50000
            else:
                budget_vnd = raw_budget

    if remaining_calories <= 150.0:
        effective_max_calo = 300.0
        gentle_note = (
            "Hôm nay bạn đã nạp gần đủ năng lượng mục tiêu. "
            "Dưới đây là các món nhẹ nhàng, giàu đạm và chất xơ."
        )
    else:
        effective_max_calo = float(remaining_calories)

    if budget_vnd is None or budget_vnd <= 0:
        effective_budget_vnd = 50000
        budget_exceeded = True
        display_budget_vnd = 50000
    else:
        effective_budget_vnd = int(budget_vnd)
        display_budget_vnd = effective_budget_vnd

    all_foods = session.exec(select(FoodReference)).all()

    eligible: list[tuple[FoodReference, float, int, float, str]] = []
    for f in all_foods:
        name_lower = f.food_name.lower()
        # Bỏ qua nguyên liệu thô USDA hoặc dầu ăn thuần túy
        if "(usda)" in name_lower or "dầu ăn" in name_lower:
            continue

        if meal_portion_gram is not None:
            portion = float(meal_portion_gram)
            label = f"{portion:.0f}g"
        else:
            portion = float(getattr(f, "default_serving_g", 100.0) or 100.0)
            label = str(getattr(f, "serving_label", "100g") or f"{portion:.0f}g")

        factor = portion / 100.0
        dish_calo = round(f.calories_per_100g * factor, 2)
        dish_price = round(f.avg_price_vnd * factor)

        if dish_calo <= effective_max_calo and dish_price <= effective_budget_vnd:
            eligible.append((f, dish_calo, dish_price, portion, label))

    # Ưu tiên món giàu đạm (protein_per_100g giảm dần) và calo cân bằng
    eligible.sort(
        key=lambda x: (x[0].protein_per_100g, -abs(x[1] - (effective_max_calo * 0.7))),
        reverse=True,
    )

    recommendations: list[dict[str, Any]] = []
    for food, d_cal, d_price, portion, label in eligible[:limit]:
        factor = portion / 100.0
        recommendations.append(
            {
                "food_id": food.id,
                "food_name": food.food_name,
                "suggested_gram": portion,
                "serving_label": label,
                "estimated_calories": d_cal,
                "protein_g": round(food.protein_per_100g * factor, 2),
                "carbs_g": round(food.carbs_per_100g * factor, 2),
                "fat_g": round(food.fat_per_100g * factor, 2),
                "avg_price_vnd": d_price,
            }
        )

    return {
        "tool_name": "recommend_meals",
        "user_id": uid,
        "remaining_calories": remaining_calories,
        "budget_vnd": display_budget_vnd,
        "effective_max_calo": effective_max_calo,
        "effective_budget_vnd": effective_budget_vnd,
        "budget_exceeded": budget_exceeded,
        "recommendations": recommendations,
        "gentle_note": gentle_note,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_list_meals(
    session: Session,
    authenticated_user_id: ToolContext | int,
    date_str: str | date | None = None,
) -> dict[str, Any]:
    """Liệt kê danh sách chi tiết các bữa ăn và món ăn đã ăn trong ngày của người dùng từ CSDL."""
    uid = _extract_user_id(authenticated_user_id)
    target_date: date
    if date_str is None or date_str == "":
        target_date = get_vn_today()
    elif isinstance(date_str, date):
        target_date = date_str
    elif isinstance(date_str, str):
        clean_str = date_str.strip().lower()
        if clean_str in ("today", "hom_nay", "hôm nay"):
            target_date = get_vn_today()
        elif clean_str in ("yesterday", "hom_qua", "hôm qua"):
            target_date = get_vn_today() - timedelta(days=1)
        else:
            try:
                target_date = date.fromisoformat(clean_str)
            except Exception as exc:
                raise ValueError(
                    f"Định dạng ngày không hợp lệ: '{date_str}'. Vui lòng sử dụng 'YYYY-MM-DD'."
                ) from exc
    else:
        raise ValueError(f"Định dạng ngày không hợp lệ: {date_str}")

    dash = get_daily_dashboard_data(session=session, authenticated_user_id=uid, target_date=target_date)
    raw_meals = dash.get("meals", [])

    meals_list = []
    total_cal = 0.0
    for m in raw_meals:
        m_items = []
        for it in m.get("items", []):
            m_items.append({
                "food_id": it.get("food_id"),
                "food_name": it.get("food_name"),
                "estimated_gram": it.get("estimated_gram"),
                "calories": it.get("calories"),
                "protein_g": it.get("protein_g"),
                "carbs_g": it.get("carbs_g"),
                "fat_g": it.get("fat_g"),
                "estimated_price_vnd": it.get("estimated_price_vnd"),
            })
            total_cal += it.get("calories", 0.0)
        meals_list.append({
            "meal_id": m.get("id"),
            "meal_type": m.get("meal_type"),
            "logged_at": m.get("logged_at"),
            "items": m_items,
        })

    return {
        "tool_name": "list_meals",
        "user_id": uid,
        "date": target_date.isoformat(),
        "meals_count": len(meals_list),
        "meals": meals_list,
        "total_calories": round(total_cal, 1),
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_get_food_info(
    session: Session,
    food_name: str,
    gram: float | None = None,
) -> dict[str, Any]:
    """Tra cứu thông tin dinh dưỡng 1 món ăn từ bảng food_references."""
    ref = resolve_food_reference(session, food_name=food_name)
    portion = float(gram) if gram is not None and gram > 0 else float(getattr(ref, "default_serving_g", 100.0) or 100.0)
    label = str(getattr(ref, "serving_label", "100g") or f"{portion:.0f}g")
    factor = portion / 100.0

    cal = round(ref.calories_per_100g * factor, 1)
    p = round(ref.protein_per_100g * factor, 1)
    c = round(ref.carbs_per_100g * factor, 1)
    f = round(ref.fat_per_100g * factor, 1)
    cost = round(ref.avg_price_vnd * factor)

    return {
        "tool_name": "get_food_info",
        "food_id": ref.id,
        "food_name": ref.food_name,
        "gram": portion,
        "serving_label": label,
        "calories": cal,
        "protein_g": p,
        "carbs_g": c,
        "fat_g": f,
        "avg_price_vnd": cost,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_compare_foods(
    session: Session,
    food_a: str,
    food_b: str,
    gram: float | None = None,
) -> dict[str, Any]:
    """So sánh giá trị dinh dưỡng giữa hai món ăn."""
    info_a = exec_get_food_info(session, food_name=food_a, gram=gram)
    info_b = exec_get_food_info(session, food_name=food_b, gram=gram)
    cal_diff = round(info_a["calories"] - info_b["calories"], 1)
    prot_diff = round(info_a["protein_g"] - info_b["protein_g"], 1)

    return {
        "tool_name": "compare_foods",
        "food_a": info_a,
        "food_b": info_b,
        "calories_diff": cal_diff,
        "protein_diff": prot_diff,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_get_goal_summary(
    session: Session,
    authenticated_user_id: ToolContext | int,
) -> dict[str, Any]:
    """Tra cứu mục tiêu cá nhân đã thiết lập của người dùng từ CSDL goals."""
    uid = _extract_user_id(authenticated_user_id)
    goal = session.exec(select(Goal).where(Goal.user_id == uid)).first()
    if not goal:
        return {
            "tool_name": "get_goal_summary",
            "user_id": uid,
            "has_goal": False,
            "message": "Bạn chưa thiết lập mục tiêu cá nhân. Hãy dùng Smart Goal Planner để thiết lập nhé!",
            "disclaimer": DISCLAIMER_TEXT,
        }
    return {
        "tool_name": "get_goal_summary",
        "user_id": uid,
        "has_goal": True,
        "goal_type": goal.goal_type,
        "target_calories": goal.target_calories or goal.tdee_calories,
        "tdee_calories": goal.tdee_calories,
        "bmr_calories": goal.bmr_calories,
        "target_protein_g": goal.target_protein_g,
        "target_carbs_g": goal.target_carbs_g,
        "target_fat_g": goal.target_fat_g,
        "daily_budget_vnd": goal.daily_budget_vnd,
        "current_weight_kg": goal.current_weight_kg,
        "target_weight_kg": goal.target_weight_kg,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_suggest_swap(
    session: Session,
    food_name: str,
) -> dict[str, Any]:
    """Gợi ý món ăn thay thế ít calo / lành mạnh hơn từ CSDL food_references."""
    orig = resolve_food_reference(session, food_name=food_name)
    all_foods = session.exec(select(FoodReference)).all()
    candidates = [
        f for f in all_foods
        if f.id != orig.id
        and "(usda)" not in f.food_name.lower()
        and "dầu ăn" not in f.food_name.lower()
        and f.calories_per_100g < orig.calories_per_100g * 0.85
    ]
    candidates.sort(key=lambda x: (x.protein_per_100g, -x.calories_per_100g), reverse=True)
    swaps = []
    for c in candidates[:3]:
        swaps.append({
            "food_id": c.id,
            "food_name": c.food_name,
            "calories_per_100g": c.calories_per_100g,
            "saved_calories_per_100g": round(orig.calories_per_100g - c.calories_per_100g, 1),
            "serving_label": getattr(c, "serving_label", "100g"),
        })

    return {
        "tool_name": "suggest_swap",
        "original_food": orig.food_name,
        "original_calories_per_100g": orig.calories_per_100g,
        "suggested_swaps": swaps,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_get_progress_summary(
    session: Session,
    authenticated_user_id: ToolContext | int,
    days_range: int = 7,
) -> dict[str, Any]:
    """Tổng hợp lịch sử cân nặng, làm mịn xu hướng EMA và chuỗi ngày duy trì nhật ký ăn uống."""
    uid = _extract_user_id(authenticated_user_id)
    if days_range <= 0:
        raise ValueError("Khoảng ngày (days_range) phải lớn hơn 0.")
    if days_range > 90:
        days_range = 90

    today = get_vn_today()
    start_date = today - timedelta(days=days_range - 1)

    # 1. Truy vấn lịch sử cân nặng
    weight_stmt = (
        select(WeightLog)
        .where(
            WeightLog.user_id == uid,
            WeightLog.logged_date >= start_date,
            WeightLog.logged_date <= today,
        )
        .order_by(WeightLog.logged_date.asc(), WeightLog.id.asc())
    )
    weight_records = session.exec(weight_stmt).all()

    start_weight_kg: float | None = None
    latest_weight_kg: float | None = None
    weight_change_kg: float = 0.0
    latest_ema_weight_kg: float | None = None
    ema_list: list[dict[str, Any]] = []

    if weight_records:
        start_weight_kg = weight_records[0].weight_kg
        latest_weight_kg = weight_records[-1].weight_kg
        weight_change_kg = round(latest_weight_kg - start_weight_kg, 2)

        ema = weight_records[0].weight_kg
        for i, w_log in enumerate(weight_records):
            if i == 0:
                ema = w_log.weight_kg
            else:
                ema = round(0.1 * w_log.weight_kg + 0.9 * ema, 2)
            ema_list.append(
                {
                    "date": (
                        w_log.logged_date.isoformat()
                        if hasattr(w_log.logged_date, "isoformat")
                        else str(w_log.logged_date)
                    ),
                    "weight_kg": w_log.weight_kg,
                    "ema_weight_kg": ema,
                }
            )
        latest_ema_weight_kg = ema

    # 2. Truy vấn các bữa ăn trong khoảng thời gian để tính số ngày duy trì (streak)
    all_user_meals = session.exec(
        select(Meal)
        .where(Meal.user_id == uid)
        .order_by(Meal.logged_at.asc())
    ).all()

    unique_dates: set[date] = set()
    total_meals_logged = 0
    total_calories_in_range = 0.0

    for meal in all_user_meals:
        m_date = (
            meal.logged_at.date()
            if hasattr(meal.logged_at, "date")
            else date.fromisoformat(str(meal.logged_at)[:10])
        )
        if start_date <= m_date <= today:
            unique_dates.add(m_date)
            total_meals_logged += 1
            items = session.exec(
                select(MealItem, FoodReference)
                .join(FoodReference, MealItem.food_id == FoodReference.id)
                .where(MealItem.meal_id == meal.id)
            ).all()
            for mi, ref in items:
                total_calories_in_range += (mi.estimated_gram / 100.0) * ref.calories_per_100g

    logged_days_count = len(unique_dates)
    avg_daily_calories = (
        round(total_calories_in_range / logged_days_count, 2)
        if logged_days_count > 0
        else 0.0
    )

    return {
        "tool_name": "get_progress_summary",
        "user_id": uid,
        "days_range": days_range,
        "start_date": start_date.isoformat(),
        "end_date": today.isoformat(),
        "logged_days_count": logged_days_count,
        "total_meals_logged": total_meals_logged,
        "avg_daily_calories": avg_daily_calories,
        "start_weight_kg": start_weight_kg,
        "latest_weight_kg": latest_weight_kg,
        "weight_change_kg": weight_change_kg,
        "latest_ema_weight_kg": latest_ema_weight_kg,
        "weight_logs": ema_list,
        "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế chỉ định y khoa.",
    }


# ==============================================================================
# NHÓM 2: BỘ ĐIỀU PHỐI CÔNG CỤ ZERO-TRUST (DISPATCH TOOL CALL)
# ==============================================================================


TOOL_REGISTRY: frozenset[str] = frozenset({
    "get_daily_nutrition",
    "log_meal",
    "recommend_meals",
    "get_progress_summary",
    "list_meals",
    "get_food_info",
    "compare_foods",
    "get_goal_summary",
    "suggest_swap",
})


def dispatch_tool_call(
    session: Session,
    authenticated_user_id: ToolContext | int,
    tool_name: str,
    tool_args: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Điều phối thực thi Tool Calling an toàn tuyệt đối (Zero-Trust):

    - authenticated_user_id: Nhận ToolContext chứa authenticated_user_id và caller ("llm" hoặc "user_action").
      LƯU Ý: Đường truyền int thay vì ToolContext chỉ dành riêng cho các unit test cũ để tương thích ngược.
      Mọi call site production (routers, services) bắt buộc phải truyền ToolContext tường minh.
    - Xóa bỏ triệt để user_id, authenticated_user_id, account_id, owner_id, is_admin nếu LLM/client cố tình gửi vào (ghi log cảnh báo an ninh).
    - Các trường lạ khác bị từ chối bằng {"error": "invalid_arguments"} qua Pydantic model extra="forbid".
    - LogMealLLMArgs dùng is_confirmed: Literal[False] cho caller="llm".
    - Ép buộc sử dụng authenticated_user_id xác thực từ phiên đăng nhập backend.
    """
    if isinstance(authenticated_user_id, ToolContext):
        ctx = authenticated_user_id
    elif isinstance(authenticated_user_id, int):
        # Đường int chỉ dành cho test cũ; caller mặc định 'user_action' để tương thích ngược
        ctx = ToolContext(authenticated_user_id=authenticated_user_id, caller="user_action")
    else:
        raise TypeError(f"Ngữ cảnh người dùng không hợp lệ: {type(authenticated_user_id)}")

    safe_args = sanitize_llm_tool_arguments(tool_args)
    clean_name = tool_name.strip()

    # 1. ALLOWLIST KIỂM TRA TÊN CÔNG CỤ (CENTRAL REGISTRY)
    if clean_name not in TOOL_REGISTRY:
        logger.warning(
            "Cảnh báo an ninh: Từ chối công cụ không xác định '%s' từ user_id=%s (caller=%s)",
            clean_name,
            ctx.authenticated_user_id,
            ctx.caller,
        )
        log_tool_audit(ctx, clean_name, "denied", detail="unknown_tool")
        if ctx.caller == "llm":
            return {
                "error": "unknown_tool",
                "detail": f"Công cụ '{tool_name}' không hợp lệ hoặc không nằm trong danh mục được phép",
                "tool_name": clean_name,
            }
        raise ValueError(f"Công cụ không hợp lệ: {tool_name}")

    # 2. XÁC THỰC THAM SỐ NGHIÊM NGẶT QUA PYDANTIC (extra="forbid")
    try:
        if clean_name == "get_daily_nutrition":
            GetDailyNutritionArgs.model_validate(safe_args)
        elif clean_name == "log_meal":
            if ctx.caller == "llm":
                LogMealLLMArgs.model_validate(safe_args)
            else:
                LogMealUserActionArgs.model_validate(safe_args)
        elif clean_name == "recommend_meals":
            RecommendMealsArgs.model_validate(safe_args)
        elif clean_name == "get_progress_summary":
            GetProgressSummaryArgs.model_validate(safe_args)
    except ValidationError as val_err:
        logger.warning(
            "Cảnh báo an ninh: Tham số không hợp lệ cho tool '%s' bởi user_id=%s (caller=%s): %s",
            clean_name,
            ctx.authenticated_user_id,
            ctx.caller,
            val_err,
        )
        log_tool_audit(ctx, clean_name, "denied", detail="invalid_arguments")
        return {
            "error": "invalid_arguments",
            "detail": str(val_err),
            "tool_name": clean_name,
        }

    # 3. THỰC THI CÔNG CỤ VỚI NGỮ CẢNH ĐÃ XÁC THỰC
    if clean_name == "get_daily_nutrition":
        call_kwargs = dict(safe_args)
        if "date" in call_kwargs and "date_str" not in call_kwargs:
            call_kwargs["date_str"] = call_kwargs.pop("date")
        call_kwargs.pop("date", None)
        res = exec_get_daily_nutrition(
            session=session,
            authenticated_user_id=ctx.authenticated_user_id,
            **call_kwargs,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "log_meal":
        call_kwargs = dict(safe_args)
        if "items" in call_kwargs and "items_list" not in call_kwargs:
            call_kwargs["items_list"] = call_kwargs.pop("items")
        call_kwargs.pop("items", None)
        call_kwargs.pop("note", None)
        call_kwargs.pop("notes", None)
        if ctx.caller == "llm":
            call_kwargs["is_confirmed"] = False
        try:
            res = exec_log_meal(
                session=session,
                authenticated_user_id=ctx.authenticated_user_id,
                **call_kwargs,
            )
            log_tool_audit(ctx, clean_name, "ok")
            return res
        except ValueError as exc:
            logger.warning(
                "Cảnh báo tham số log_meal không hợp lệ từ user_id=%s (caller=%s): %s",
                ctx.authenticated_user_id,
                ctx.caller,
                exc,
            )
            log_tool_audit(ctx, clean_name, "denied", detail=str(exc))
            return {
                "error": "invalid_arguments",
                "detail": str(exc),
                "tool_name": clean_name,
            }

    if clean_name == "list_meals":
        date_arg = safe_args.get("date") or safe_args.get("date_str")
        res = exec_list_meals(
            session=session,
            authenticated_user_id=ctx.authenticated_user_id,
            date_str=date_arg,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "recommend_meals":
        call_kwargs = {
            "remaining_calories": safe_args.get("remaining_calories"),
            "budget_vnd": safe_args.get("budget_vnd"),
            "meal_portion_gram": safe_args.get("meal_portion_gram"),
            "limit": safe_args.get("limit", 5),
        }
        filtered_kwargs = {k: v for k, v in call_kwargs.items() if v is not None}
        res = exec_recommend_meals(
            session=session,
            authenticated_user_id=ctx.authenticated_user_id,
            **filtered_kwargs,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "get_progress_summary":
        days = safe_args.get("days_range", 7)
        res = exec_get_progress_summary(
            session=session,
            authenticated_user_id=ctx.authenticated_user_id,
            days_range=days,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "get_food_info":
        fname = safe_args.get("food_name") or safe_args.get("food") or "ức gà"
        gram_val = safe_args.get("gram") or safe_args.get("grams")
        res = exec_get_food_info(
            session=session,
            food_name=str(fname),
            gram=float(gram_val) if gram_val is not None else None,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "compare_foods":
        f_a = safe_args.get("food_a") or safe_args.get("food_1") or "cơm trắng"
        f_b = safe_args.get("food_b") or safe_args.get("food_2") or "bún tươi"
        gram_val = safe_args.get("gram") or safe_args.get("grams")
        res = exec_compare_foods(
            session=session,
            food_a=str(f_a),
            food_b=str(f_b),
            gram=float(gram_val) if gram_val is not None else None,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "get_goal_summary":
        res = exec_get_goal_summary(
            session=session,
            authenticated_user_id=ctx.authenticated_user_id,
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    if clean_name == "suggest_swap":
        fname = safe_args.get("food_name") or safe_args.get("food") or "trà sữa"
        res = exec_suggest_swap(
            session=session,
            food_name=str(fname),
        )
        log_tool_audit(ctx, clean_name, "ok")
        return res

    raise ValueError(f"Công cụ không hợp lệ: {tool_name}")


# ==============================================================================
# NHÓM 3: DỊCH VỤ QUẢN LÝ VÀ LƯU TRỮ HỘI THOẠI (CHAT SESSIONS & MESSAGES)
# ==============================================================================


def create_or_get_chat_session(
    session: Session,
    authenticated_user_id: ToolContext | int,
    session_id: int | None = None,
) -> ChatSession:
    """Tạo mới hoặc kiểm tra quyền sở hữu phiên chat (WHERE user_id == authenticated_user_id)."""
    uid = _extract_user_id(authenticated_user_id)
    if session_id is not None:
        verify_session_ownership(
            session=session,
            session_id=session_id,
            authenticated_user_id=uid,
            raise_exception=True,
        )
        chat_session = session.get(ChatSession, session_id)
        if not chat_session:
            raise ValueError("Không tìm thấy phiên hội thoại")
        return chat_session

    chat_session = ChatSession(user_id=uid, started_at=utc_now())
    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)
    return chat_session


get_or_create_chat_session = create_or_get_chat_session


def save_chat_message(
    session: Session,
    authenticated_user_id: ToolContext | int,
    session_id: int,
    sender_role: str,
    content: str,
    tool_name: str | None = None,
) -> ChatMessage:
    """Lưu tin nhắn chi tiết sau khi xác minh phiên hội thoại thuộc về authenticated_user_id."""
    uid = _extract_user_id(authenticated_user_id)
    # Kiểm tra quyền sở hữu phiên trước khi ghi
    create_or_get_chat_session(session, uid, session_id)

    clean_role = sender_role.strip().lower()
    if clean_role not in {"user", "assistant", "tool"}:
        raise ValueError(
            f"Vai trò người gửi không hợp lệ: '{sender_role}'. Chấp nhận: 'user', 'assistant', 'tool'."
        )

    if not content or not content.strip():
        raise ValueError("Nội dung tin nhắn không được để trống.")

    msg = ChatMessage(
        session_id=session_id,
        sender_role=clean_role,
        content=content.strip(),
        tool_name=tool_name,
        created_at=utc_now(),
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return msg


def get_chat_history(
    session: Session,
    authenticated_user_id: ToolContext | int,
    session_id: int,
    limit: int = 10,
) -> list[ChatMessage]:
    """Đọc lịch sử tin nhắn của session_id, sắp xếp theo thứ tự thời gian tăng dần."""
    uid = _extract_user_id(authenticated_user_id)
    # Kiểm tra quyền sở hữu phiên
    create_or_get_chat_session(session, uid, session_id)

    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
        .limit(limit)
    )
    messages = list(session.exec(stmt).all())
    messages.reverse()
    return messages


def list_user_chat_sessions(
    session: Session,
    authenticated_user_id: ToolContext | int,
) -> list[ChatSession]:
    """Lấy danh sách các phiên chat của authenticated_user_id."""
    uid = _extract_user_id(authenticated_user_id)
    stmt = (
        select(ChatSession)
        .where(ChatSession.user_id == uid)
        .order_by(ChatSession.started_at.desc(), ChatSession.id.desc())
    )
    return list(session.exec(stmt).all())


def delete_user_chat_session(
    session: Session,
    authenticated_user_id: ToolContext | int,
    session_id: int,
) -> bool:
    """Xóa một phiên chat sau khi xác nhận quyền sở hữu."""
    uid = _extract_user_id(authenticated_user_id)
    chat_session = create_or_get_chat_session(session, uid, session_id)
    session.delete(chat_session)
    session.commit()
    return True

