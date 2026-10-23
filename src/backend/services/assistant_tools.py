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

from datetime import date, datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import (
    ChatMessage,
    ChatSession,
    FoodReference,
    Meal,
    MealItem,
    WeightLog,
    get_vn_today,
    utc_now,
)
from src.backend.services.nutrition_service import (
    DISCLAIMER_TEXT,
    MealItemInput,
    MealLogRequest,
    get_daily_dashboard_data,
    log_user_meal,
)
from src.backend.services.tool_security import (
    sanitize_llm_tool_arguments,
    verify_session_ownership,
)

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
    authenticated_user_id: int,
    date_str: str | date | None = None,
) -> dict[str, Any]:
    """Lấy tổng hợp dinh dưỡng và so sánh với mục tiêu hàng ngày của người dùng.

    Hỗ trợ các biến thể thời gian: None / "" / "today" / "hom_nay" / "yesterday" / "hom_qua" / "YYYY-MM-DD".
    """
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
        authenticated_user_id=authenticated_user_id,
        target_date=target_date,
    )

    return {
        "tool_name": "get_daily_nutrition",
        "user_id": authenticated_user_id,
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
    authenticated_user_id: int,
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
        grams = item.get("estimated_gram")
        if grams is None:
            grams = item.get("estimated_grams")
        if grams is None:
            grams = item.get("grams")
        if grams is None:
            grams = item.get("gram", 100.0)

        eaten_ratio = float(item.get("eaten_ratio", 1.0))
        converted_items.append(
            MealItemInput(
                food_id=food_id,
                food_name=food_name,
                estimated_gram=float(grams),
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
        authenticated_user_id=authenticated_user_id,
        req=req,
    )

    action_card = {
        "type": "confirm_log_meal",
        "status": "pending_user_action" if not is_confirmed else "confirmed",
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
        "requires_confirmation": not is_confirmed,
        "meal_id": response.meal_id,
        "meal_type": db_meal_type,
        "logged_at": (
            response.logged_at.isoformat()
            if hasattr(response.logged_at, "isoformat")
            else str(response.logged_at)
        ),
        "nutrition": response.nutrition.model_dump(),
        "action_card": action_card,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_recommend_meals(
    session: Session,
    authenticated_user_id: int,
    remaining_calories: float | None = None,
    budget_vnd: int | None = None,
    meal_portion_gram: float = 250.0,
    limit: int = 5,
) -> dict[str, Any]:
    """Gợi ý các món ăn Việt Nam từ food_references thỏa mãn hạn mức calo và ngân sách VNĐ."""
    gentle_note: str | None = None

    if remaining_calories is None or budget_vnd is None:
        dash = get_daily_dashboard_data(session, authenticated_user_id)
        if remaining_calories is None:
            remaining_calories = float(dash["remaining"]["calories"])
        if budget_vnd is None:
            budget_vnd = int(dash["remaining"]["budget_vnd"])

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
    else:
        effective_budget_vnd = int(budget_vnd)

    portion_factor = meal_portion_gram / 100.0
    all_foods = session.exec(select(FoodReference)).all()

    eligible: list[tuple[FoodReference, float, int]] = []
    for f in all_foods:
        name_lower = f.food_name.lower()
        # Bỏ qua nguyên liệu thô USDA hoặc dầu ăn thuần túy
        if "(usda)" in name_lower or "dầu ăn" in name_lower:
            continue

        dish_calo = round(f.calories_per_100g * portion_factor, 2)
        dish_price = round(f.avg_price_vnd * portion_factor)

        if dish_calo <= effective_max_calo and dish_price <= effective_budget_vnd:
            eligible.append((f, dish_calo, dish_price))

    # Ưu tiên món giàu đạm (protein_per_100g giảm dần) và calo cân bằng
    eligible.sort(
        key=lambda x: (x[0].protein_per_100g, -abs(x[1] - (effective_max_calo * 0.7))),
        reverse=True,
    )

    recommendations: list[dict[str, Any]] = []
    for food, d_cal, d_price in eligible[:limit]:
        recommendations.append(
            {
                "food_id": food.id,
                "food_name": food.food_name,
                "suggested_gram": meal_portion_gram,
                "estimated_calories": d_cal,
                "protein_g": round(food.protein_per_100g * portion_factor, 2),
                "carbs_g": round(food.carbs_per_100g * portion_factor, 2),
                "fat_g": round(food.fat_per_100g * portion_factor, 2),
                "avg_price_vnd": d_price,
            }
        )

    return {
        "tool_name": "recommend_meals",
        "user_id": authenticated_user_id,
        "remaining_calories": remaining_calories,
        "budget_vnd": budget_vnd,
        "effective_max_calo": effective_max_calo,
        "effective_budget_vnd": effective_budget_vnd,
        "recommendations": recommendations,
        "gentle_note": gentle_note,
        "disclaimer": DISCLAIMER_TEXT,
    }


def exec_get_progress_summary(
    session: Session,
    authenticated_user_id: int,
    days_range: int = 7,
) -> dict[str, Any]:
    """Tổng hợp lịch sử cân nặng, làm mịn xu hướng EMA và chuỗi ngày duy trì nhật ký ăn uống."""
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
            WeightLog.user_id == authenticated_user_id,
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
        .where(Meal.user_id == authenticated_user_id)
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
        "user_id": authenticated_user_id,
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


def dispatch_tool_call(
    session: Session,
    authenticated_user_id: int,
    tool_name: str,
    tool_args: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Điều phối thực thi Tool Calling an toàn tuyệt đối (Zero-Trust):

    - Xóa bỏ triệt để user_id và authenticated_user_id nếu LLM/client cố tình gửi vào.
    - Ép buộc sử dụng authenticated_user_id xác thực từ phiên đăng nhập backend.
    """
    safe_args = sanitize_llm_tool_arguments(tool_args)

    clean_name = tool_name.strip()

    if clean_name == "get_daily_nutrition":
        if "date" in safe_args and "date_str" not in safe_args:
            safe_args["date_str"] = safe_args.pop("date")
        return exec_get_daily_nutrition(
            session=session,
            authenticated_user_id=authenticated_user_id,
            **safe_args,
        )

    if clean_name == "log_meal":
        if "items" in safe_args and "items_list" not in safe_args:
            safe_args["items_list"] = safe_args.pop("items")
        return exec_log_meal(
            session=session,
            authenticated_user_id=authenticated_user_id,
            **safe_args,
        )

    if clean_name == "recommend_meals":
        return exec_recommend_meals(
            session=session,
            authenticated_user_id=authenticated_user_id,
            **safe_args,
        )

    if clean_name == "get_progress_summary":
        return exec_get_progress_summary(
            session=session,
            authenticated_user_id=authenticated_user_id,
            **safe_args,
        )

    raise ValueError(f"Công cụ không hợp lệ: {tool_name}")


# ==============================================================================
# NHÓM 3: DỊCH VỤ QUẢN LÝ VÀ LƯU TRỮ HỘI THOẠI (CHAT SESSIONS & MESSAGES)
# ==============================================================================


def create_or_get_chat_session(
    session: Session,
    authenticated_user_id: int,
    session_id: int | None = None,
) -> ChatSession:
    """Tạo mới hoặc kiểm tra quyền sở hữu phiên chat (WHERE user_id == authenticated_user_id)."""
    if session_id is not None:
        verify_session_ownership(
            session=session,
            session_id=session_id,
            authenticated_user_id=authenticated_user_id,
            raise_exception=True,
        )
        chat_session = session.get(ChatSession, session_id)
        if not chat_session:
            raise ValueError("Không tìm thấy phiên hội thoại")
        return chat_session

    chat_session = ChatSession(user_id=authenticated_user_id, started_at=utc_now())
    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)
    return chat_session


get_or_create_chat_session = create_or_get_chat_session


def save_chat_message(
    session: Session,
    authenticated_user_id: int,
    session_id: int,
    sender_role: str,
    content: str,
    tool_name: str | None = None,
) -> ChatMessage:
    """Lưu tin nhắn chi tiết sau khi xác minh phiên hội thoại thuộc về authenticated_user_id."""
    # Kiểm tra quyền sở hữu phiên trước khi ghi
    create_or_get_chat_session(session, authenticated_user_id, session_id)

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
    authenticated_user_id: int,
    session_id: int,
    limit: int = 10,
) -> list[ChatMessage]:
    """Đọc lịch sử tin nhắn của session_id, sắp xếp theo thứ tự thời gian tăng dần."""
    # Kiểm tra quyền sở hữu phiên
    create_or_get_chat_session(session, authenticated_user_id, session_id)

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
    authenticated_user_id: int,
) -> list[ChatSession]:
    """Lấy danh sách các phiên chat của authenticated_user_id."""
    stmt = (
        select(ChatSession)
        .where(ChatSession.user_id == authenticated_user_id)
        .order_by(ChatSession.started_at.desc(), ChatSession.id.desc())
    )
    return list(session.exec(stmt).all())


def delete_user_chat_session(
    session: Session,
    authenticated_user_id: int,
    session_id: int,
) -> bool:
    """Xóa một phiên chat sau khi xác nhận quyền sở hữu."""
    chat_session = create_or_get_chat_session(session, authenticated_user_id, session_id)
    session.delete(chat_session)
    session.commit()
    return True
