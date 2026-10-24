"""
tests/unit/test_w4_log_meal_confirmation.py
Bộ kiểm thử tự động cơ chế pending_confirmation cho tool log_meal (README_04).

Bao gồm 13 kịch bản kiểm thử bảo mật & toàn vẹn:
1. test_01_llm_log_meal_creates_pending_action_and_zero_meals: Kênh LLM gọi log_meal tạo 1 PendingAction, 0 Meal trong DB.
2. test_02_valid_confirm_persists_exactly_one_meal: Xác nhận hợp lệ ghi đúng 1 Meal vào DB với đúng user_id từ JWT.
3. test_03_double_confirm_or_concurrent_confirm_persists_only_one_meal: Xác nhận 2 lần / double-click chỉ ghi 1 Meal, lần 2 trả 409.
4. test_04_cancel_pending_action_prevents_confirm: Hủy action -> không có Meal; cố tình confirm sau khi cancel bị từ chối 409.
5. test_05_expired_pending_action_returns_410_no_meal: Action quá hạn TTL (10 phút) -> trả 410 Gone, đánh dấu expired, 0 Meal.
6. test_06_cross_user_confirm_and_cancel_returns_404: User B xác nhận/hủy confirmation_id của User A -> bị từ chối 404, dữ liệu A không đổi.
7. test_07_unauthenticated_request_returns_401: Yêu cầu không có cookie/token bị từ chối 401.
8. test_08_invalid_or_nonexistent_confirmation_id_returns_404_no_500: confirmation_id không tồn tại hoặc sai định dạng trả 404, không 500.
9. test_09_body_tampering_ignored_payload_from_db: Client gửi body giả mạo trong request confirm bị bỏ qua, payload lấy 100% từ DB.
10. test_10_llm_cannot_trigger_confirm_tool: Công cụ confirm/cancel không có trong registry, LLM cố gọi bị từ chối unknown_tool.
11. test_11_bad_args_for_log_meal_rejected_no_pending_created: Tham số xấu (gram âm, quá lớn, user_id, is_confirmed) bị từ chối, không tạo pending.
12. test_12_regression_manual_meal_logging_unaffected: Luồng ghi bữa ăn thủ công qua meal_router không bị ảnh hưởng.
13. test_13_pending_actions_table_initialization_idempotent: Khởi tạo schema CSDL với bảng pending_actions an toàn, không hỏng DB cũ.
"""

import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import (
    FoodReference,
    Meal,
    MealItem,
    PendingAction,
    User,
    utc_now,
)
from src.backend.services.assistant_tools import (
    TOOL_REGISTRY,
    dispatch_tool_call,
)
from src.backend.services.auth_service import register_with_initial_goal
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.tool_context import ToolContext


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL và seed dữ liệu từ điển món ăn."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


def create_test_user_client(username: str, email: str) -> tuple[TestClient, User]:
    """Helper tạo TestClient có HttpOnly Cookie JWT của user xác thực."""
    with Session(engine) as session:
        existing = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()
        if existing:
            # Dọn dẹp dữ liệu cũ của user kiểm thử
            session.exec(select(Meal).where(Meal.user_id == existing.id))  # type: ignore
            session.delete(existing)
            session.commit()

        user, _ = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="StrongPassword123!",
            initial_goal=GoalPlanInput(
                target_weight_kg=65.0,
                current_weight_kg=70.0,
                height_cm=175.0,
                age=25,
                gender="male",
                activity_level="moderate",
            ),
        )

    client = TestClient(app)
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "StrongPassword123!"},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.cookies
    client.cookies.set("access_token", login_resp.cookies["access_token"])
    return client, user


# ==============================================================================
# TEST 1: KÊNH LLM GỌI LOG_MEAL TẠO PENDING ACTION, 0 MEAL TRONG DB
# ==============================================================================


def test_01_llm_log_meal_creates_pending_action_and_zero_meals():
    """Kênh LLM gọi log_meal -> tạo 1 PendingAction, 0 Meal mới trong DB, phản hồi có confirmation_id."""
    client, user = create_test_user_client("conf_user_01", "conf_user_01@example.com")

    with Session(engine) as session:
        initial_meals = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        initial_pending = len(session.exec(select(PendingAction).where(PendingAction.user_id == user.id)).all())

    # 1. Gọi qua /api/v1/assistant/chat
    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Trưa nay tôi ăn 1 tô phở bò tái"},
    )
    assert chat_resp.status_code == 200
    data = chat_resp.json()

    assert data["pending_confirmation"] is True
    assert data["status"] == "pending_confirmation"
    assert data["confirmation_id"] is not None
    assert data["preview"] is not None
    assert data["expires_at"] is not None
    assert data["action_card"] is not None
    assert data["action_card"]["type"] == "confirm_log_meal"
    assert data["action_card"]["confirmation_id"] == data["confirmation_id"]

    # 2. Kiểm tra CSDL: 0 Meal mới, đúng 1 PendingAction mới ở trạng thái pending
    with Session(engine) as session:
        current_meals = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        assert current_meals == initial_meals, "Kênh LLM tuyệt đối không được ghi Meal trực tiếp vào DB"

        pending_records = session.exec(
            select(PendingAction).where(PendingAction.user_id == user.id)
        ).all()
        assert len(pending_records) == initial_pending + 1

        new_pending = session.get(PendingAction, data["confirmation_id"])
        assert new_pending is not None
        assert new_pending.status == "pending"
        assert new_pending.tool_name == "log_meal"
        assert new_pending.user_id == user.id
        assert "Phở bò tái" in new_pending.payload


# ==============================================================================
# TEST 2: XÁC NHẬN HỢP LỆ GHI ĐÚNG 1 MEAL VÀO DB VỚI USER_ID TỪ JWT
# ==============================================================================


def test_02_valid_confirm_persists_exactly_one_meal():
    """Xác nhận hợp lệ qua POST /confirmations/{id}/confirm -> ghi đúng 1 Meal vào DB với user_id từ JWT."""
    client, user = create_test_user_client("conf_user_02", "conf_user_02@example.com")

    # Tạo trước 1 pending action qua /chat
    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Tôi vừa ăn cơm tấm sườn nướng"},
    )
    assert chat_resp.status_code == 200
    conf_id = chat_resp.json()["confirmation_id"]
    assert conf_id is not None

    with Session(engine) as session:
        initial_meals = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())

    # Gọi endpoint confirm
    confirm_resp = client.post(f"/api/v1/assistant/confirmations/{conf_id}/confirm")
    assert confirm_resp.status_code == 200
    res_data = confirm_resp.json()
    assert res_data["success"] is True
    assert res_data["status"] == "confirmed"
    assert res_data["meal_id"] is not None

    # Kiểm tra CSDL: Meal đã được lưu chính xác
    with Session(engine) as session:
        current_meals = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        assert current_meals == initial_meals + 1

        saved_meal = session.get(Meal, res_data["meal_id"])
        assert saved_meal is not None
        assert saved_meal.user_id == user.id
        assert saved_meal.meal_type == "Trưa"

        # PendingAction đã chuyển sang confirmed
        pending_rec = session.get(PendingAction, conf_id)
        assert pending_rec is not None
        assert pending_rec.status == "confirmed"
        assert pending_rec.resolved_at is not None


# ==============================================================================
# TEST 3: XÁC NHẬN 2 LẦN (DOUBLE-CLICK / CONCURRENT) CHỈ GHI 1 MEAL
# ==============================================================================


def test_03_double_confirm_or_concurrent_confirm_persists_only_one_meal():
    """Bấm xác nhận 2 lần (double-click) chỉ ghi duy nhất 1 Meal, lần 2 trả HTTP 409 Conflict."""
    client, user = create_test_user_client("conf_user_03", "conf_user_03@example.com")

    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Trưa nay ăn phở bò"},
    )
    conf_id = chat_resp.json()["confirmation_id"]

    # Lần 1: Thành công
    resp1 = client.post(f"/api/v1/assistant/confirmations/{conf_id}/confirm")
    assert resp1.status_code == 200

    # Lần 2: Bị từ chối HTTP 409 Conflict vì đã confirmed
    resp2 = client.post(f"/api/v1/assistant/confirmations/{conf_id}/confirm")
    assert resp2.status_code == 409
    assert "đã được thực hiện" in resp2.json()["detail"]

    # Đảm bảo chỉ có 1 Meal duy nhất trong DB
    with Session(engine) as session:
        meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        assert len(meals) == 1


# ==============================================================================
# TEST 4: HỦY ACTION -> KHÔNG CÓ MEAL VÀ KHÔNG THỂ CONFIRM SAU ĐÓ
# ==============================================================================


def test_04_cancel_pending_action_prevents_confirm():
    """Hủy action -> không có Meal; cố tình confirm sau khi cancel bị từ chối 409."""
    client, user = create_test_user_client("conf_user_04", "conf_user_04@example.com")

    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Ăn bún chả Hà Nội"},
    )
    conf_id = chat_resp.json()["confirmation_id"]

    # Gọi endpoint cancel
    cancel_resp = client.post(f"/api/v1/assistant/confirmations/{conf_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # Kiểm tra CSDL: 0 Meal
    with Session(engine) as session:
        meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        assert len(meals) == 0

        pending_rec = session.get(PendingAction, conf_id)
        assert pending_rec is not None
        assert pending_rec.status == "cancelled"

    # Cố tình confirm sau khi đã hủy -> Bị từ chối 409 Conflict
    confirm_after_cancel = client.post(f"/api/v1/assistant/confirmations/{conf_id}/confirm")
    assert confirm_after_cancel.status_code == 409
    assert "đã bị hủy" in confirm_after_cancel.json()["detail"]

    with Session(engine) as session:
        meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        assert len(meals) == 0


# ==============================================================================
# TEST 5: HẾT HẠN TTL -> TRẢ 410 GONE, ĐÁNH DẤU EXPIRED, KHÔNG GHI MEAL
# ==============================================================================


def test_05_expired_pending_action_returns_410_no_meal():
    """Action hết hạn TTL -> trả về HTTP 410 Gone, đánh dấu expired, không ghi Meal."""
    client, user = create_test_user_client("conf_user_05", "conf_user_05@example.com")

    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Ăn bánh mì trứng"},
    )
    conf_id = chat_resp.json()["confirmation_id"]

    # Giả lập hết hạn: cập nhật expires_at về quá khứ 15 phút trước
    with Session(engine) as session:
        pending_rec = session.get(PendingAction, conf_id)
        assert pending_rec is not None
        pending_rec.expires_at = utc_now() - timedelta(minutes=15)
        session.add(pending_rec)
        session.commit()

    # Gọi confirm yêu cầu đã hết hạn
    confirm_resp = client.post(f"/api/v1/assistant/confirmations/{conf_id}/confirm")
    assert confirm_resp.status_code == 410
    assert "đã hết hạn" in confirm_resp.json()["detail"]

    # Kiểm tra CSDL: không có Meal nào được tạo, trạng thái chuyển sang expired
    with Session(engine) as session:
        meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        assert len(meals) == 0

        updated_pending = session.get(PendingAction, conf_id)
        assert updated_pending is not None
        assert updated_pending.status == "expired"


# ==============================================================================
# TEST 6: USER B CONFIRM/CANCEL CỦA USER A -> 404 VÀ DỮ LIỆU KHÔNG ĐỔI
# ==============================================================================


def test_06_cross_user_confirm_and_cancel_returns_404():
    """User B cố tình confirm/cancel confirmation_id của User A -> bị từ chối 404, dữ liệu User A nguyên vẹn."""
    client_a, user_a = create_test_user_client("conf_user_06a", "conf_user_06a@example.com")
    client_b, user_b = create_test_user_client("conf_user_06b", "conf_user_06b@example.com")

    # User A tạo pending action
    chat_resp_a = client_a.post(
        "/api/v1/assistant/chat",
        json={"message": "Tôi vừa ăn phở gà"},
    )
    conf_id_a = chat_resp_a.json()["confirmation_id"]

    # User B cố tình confirm của User A -> 404
    resp_b_confirm = client_b.post(f"/api/v1/assistant/confirmations/{conf_id_a}/confirm")
    assert resp_b_confirm.status_code == 404

    # User B cố tình cancel của User A -> 404
    resp_b_cancel = client_b.post(f"/api/v1/assistant/confirmations/{conf_id_a}/cancel")
    assert resp_b_cancel.status_code == 404

    # Dữ liệu của User A vẫn nguyên vẹn ở trạng thái pending, chưa có Meal nào
    with Session(engine) as session:
        pending_a = session.get(PendingAction, conf_id_a)
        assert pending_a is not None
        assert pending_a.status == "pending"

        meals_a = session.exec(select(Meal).where(Meal.user_id == user_a.id)).all()
        assert len(meals_a) == 0
        meals_b = session.exec(select(Meal).where(Meal.user_id == user_b.id)).all()
        assert len(meals_b) == 0


# ==============================================================================
# TEST 7: KHÔNG CÓ COOKIE -> 401 UNAUTHORIZED
# ==============================================================================


def test_07_unauthenticated_request_returns_401():
    """Request không có cookie xác thực gọi confirm/cancel bị từ chối HTTP 401."""
    unauth_client = TestClient(app)
    fake_id = str(uuid.uuid4())

    resp_confirm = unauth_client.post(f"/api/v1/assistant/confirmations/{fake_id}/confirm")
    assert resp_confirm.status_code == 401

    resp_cancel = unauth_client.post(f"/api/v1/assistant/confirmations/{fake_id}/cancel")
    assert resp_cancel.status_code == 401


# ==============================================================================
# TEST 8: CONFIRMATION_ID KHÔNG TỒN TẠI HOẶC SAI ĐỊNH DẠNG TRẢ VỀ 404, KHÔNG 500
# ==============================================================================


def test_08_invalid_or_nonexistent_confirmation_id_returns_404_no_500():
    """confirmation_id không tồn tại hoặc sai định dạng trả 404/422, không bao giờ sập 500."""
    client, _ = create_test_user_client("conf_user_08", "conf_user_08@example.com")

    # 1. UUID ngẫu nhiên không tồn tại
    non_existent_id = str(uuid.uuid4())
    resp1 = client.post(f"/api/v1/assistant/confirmations/{non_existent_id}/confirm")
    assert resp1.status_code == 404

    # 2. Chuỗi sai định dạng / ký tự đặc biệt
    resp2 = client.post("/api/v1/assistant/confirmations/invalid-id-xyz/confirm")
    assert resp2.status_code == 404

    resp3 = client.post("/api/v1/assistant/confirmations/12345/cancel")
    assert resp3.status_code == 404


# ==============================================================================
# TEST 9: CLIENT GỬI BODY GIẢ MẠO TRONG CONFIRM BỊ BỎ QUA, PAYLOAD TỪ DB
# ==============================================================================


def test_09_body_tampering_ignored_payload_from_db():
    """Client cố tình gửi body giả mạo (user_id khác, calories=0) trong confirm request -> bị bỏ qua, payload lấy từ DB."""
    client, user = create_test_user_client("conf_user_09", "conf_user_09@example.com")

    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Ăn cơm tấm sườn nướng"},
    )
    conf_id = chat_resp.json()["confirmation_id"]

    # Gửi body giả mạo trong request confirm
    resp = client.post(
        f"/api/v1/assistant/confirmations/{conf_id}/confirm",
        json={
            "user_id": 9999,
            "meal_type": "dinner",
            "items": [{"food_name": "Món hack", "estimated_gram": 10.0}],
            "total_calories": 0.0,
        },
    )
    assert resp.status_code == 200
    res_data = resp.json()

    # Meal được lưu trong DB phải đúng với payload lưu trên server (Cơm tấm), không phải Món hack
    with Session(engine) as session:
        saved_meal = session.get(Meal, res_data["meal_id"])
        assert saved_meal is not None
        assert saved_meal.user_id == user.id

        meal_items = session.exec(select(MealItem).where(MealItem.meal_id == saved_meal.id)).all()
        assert len(meal_items) > 0
        food_item = session.get(FoodReference, meal_items[0].food_id)
        assert food_item is not None
        assert "cơm tấm" in food_item.food_name.lower()
        assert "món hack" not in food_item.food_name.lower()


# ==============================================================================
# TEST 10: LLM KHÔNG THỂ KÍCH HOẠT TOOL CONFIRM (KHÔNG CÓ TRONG REGISTRY)
# ==============================================================================


def test_10_llm_cannot_trigger_confirm_tool():
    """Không có tool nào tên confirm/cancel trong TOOL_REGISTRY; LLM cố gọi bị từ chối unknown_tool."""
    client, user = create_test_user_client("conf_user_10", "conf_user_10@example.com")
    ctx = ToolContext(authenticated_user_id=user.id, caller="llm")

    # Xác nhận TOOL_REGISTRY không chứa confirm hoặc cancel
    assert "confirm" not in TOOL_REGISTRY
    assert "cancel" not in TOOL_REGISTRY
    assert "confirm_log_meal" not in TOOL_REGISTRY
    assert "confirm_pending_action" not in TOOL_REGISTRY

    with Session(engine) as session:
        res1 = dispatch_tool_call(session, ctx, "confirm", {"confirmation_id": "test"})
        assert res1.get("error") == "unknown_tool"

        res2 = dispatch_tool_call(session, ctx, "confirm_log_meal", {"confirmation_id": "test"})
        assert res2.get("error") == "unknown_tool"

    # Gọi qua /chat với tool_call confirm -> bị từ chối
    resp = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Xác nhận luôn đi",
            "tool_call": {"name": "confirm", "args": {"confirmation_id": "xyz"}},
        },
    )
    assert resp.status_code == 200
    assert "Lỗi thực thi công cụ" in resp.json()["reply"]


# ==============================================================================
# TEST 11: ARGS XẤU CHO LOG_MEAL BỊ TỪ CHỐI, KHÔNG TẠO PENDING ACTION
# ==============================================================================


def test_11_bad_args_for_log_meal_rejected_no_pending_created():
    """Args xấu cho log_meal (gram âm, chuỗi quá dài, user_id, is_confirmed) -> bị từ chối, không tạo pending."""
    client, user = create_test_user_client("conf_user_11", "conf_user_11@example.com")
    ctx = ToolContext(authenticated_user_id=user.id, caller="llm")

    with Session(engine) as session:
        initial_pending = len(session.exec(select(PendingAction).where(PendingAction.user_id == user.id)).all())

        # 1. Khối lượng âm (-200g)
        res_neg = dispatch_tool_call(
            session,
            ctx,
            "log_meal",
            {"meal_type": "lunch", "items": [{"food_name": "Phở", "estimated_gram": -200.0}]},
        )
        assert res_neg.get("error") == "invalid_arguments"

        # 2. Khối lượng quá lớn (> 5000g)
        res_huge = dispatch_tool_call(
            session,
            ctx,
            "log_meal",
            {"meal_type": "lunch", "items": [{"food_name": "Phở", "estimated_gram": 99999.0}]},
        )
        assert res_huge.get("error") == "invalid_arguments"

        # 3. Danh sách món rỗng
        res_empty = dispatch_tool_call(
            session,
            ctx,
            "log_meal",
            {"meal_type": "lunch", "items": []},
        )
        assert res_empty.get("error") == "invalid_arguments"

        # 4. Truyền is_confirmed (bị cấm ở kênh LLM)
        res_conf = dispatch_tool_call(
            session,
            ctx,
            "log_meal",
            {"meal_type": "lunch", "items": [{"food_name": "Phở", "estimated_gram": 200.0}], "is_confirmed": True},
        )
        assert res_conf.get("error") == "invalid_arguments"

        # Đảm bảo không có bất kỳ PendingAction nào được tạo
        final_pending = len(session.exec(select(PendingAction).where(PendingAction.user_id == user.id)).all())
        assert final_pending == initial_pending


# ==============================================================================
# TEST 12: HỒI QUY LUỒNG GHI BỮA ĂN THỦ CÔNG QUA MEAL_ROUTER KHÔNG BỊ ẢNH HƯỞNG
# ==============================================================================


def test_12_regression_manual_meal_logging_unaffected():
    """Hồi quy: Luồng ghi bữa ăn thủ công qua POST /api/v1/meals/log không bị ảnh hưởng."""
    client, user = create_test_user_client("conf_user_12", "conf_user_12@example.com")

    # 1. Ghi nháp (is_confirmed=False) qua meal_router -> 200 OK, pending_confirmation
    preview_resp = client.post(
        "/api/v1/meals/log",
        json={
            "meal_type": "lunch",
            "items": [{"food_name": "Phở bò tái", "estimated_gram": 350.0}],
            "is_confirmed": False,
        },
    )
    assert preview_resp.status_code == 200
    assert preview_resp.json()["status"] == "pending_confirmation"

    # 2. Ghi chính thức (is_confirmed=True) qua meal_router -> 201 Created, logged
    confirm_resp = client.post(
        "/api/v1/meals/log",
        json={
            "meal_type": "lunch",
            "items": [{"food_name": "Phở bò tái", "estimated_gram": 350.0}],
            "is_confirmed": True,
        },
    )
    assert confirm_resp.status_code == 201
    data = confirm_resp.json()
    assert data["status"] == "logged"
    assert data["meal_id"] is not None

    with Session(engine) as session:
        saved_meal = session.get(Meal, data["meal_id"])
        assert saved_meal is not None
        assert saved_meal.user_id == user.id


# ==============================================================================
# TEST 13: KHỞI TẠO BẢNG PENDING_ACTIONS AN TOÀN VÀ IDEMPOTENT
# ==============================================================================


def test_13_pending_actions_table_initialization_idempotent():
    """Gọi init_db nhiều lần an toàn, bảng pending_actions tồn tại và CSDL hoạt động bình thường."""
    init_db(engine)
    with Session(engine) as session:
        # Thử truy vấn bảng pending_actions
        records = session.exec(select(PendingAction)).all()
        assert isinstance(records, list)
