"""
tests/unit/test_w4_tool_data_isolation.py
Bộ kiểm thử tự động Data Isolation cho AI Tool Calling (README_03).

Kiểm thử toàn diện 12 kịch bản bảo mật:
1. test_01_schema_no_user_id_or_owner_id_recursive: Schema gửi LLM không chứa user_id/owner_id/account_id/is_admin.
2. test_02_schema_and_argument_model_sync: Đồng bộ hóa schema LLM và Pydantic Argument Models.
3. test_03_llm_tool_call_is_confirmed_true_rejected: /chat với tool_call is_confirmed=True bị từ chối và DB không đổi.
4. test_04_user_action_tools_execute_confirmed_succeeds: /tools/execute (caller=user_action) với is_confirmed=True ghi DB thành công.
5. test_05_identity_keys_stripped_and_foreign_fields_rejected: Khóa danh tính bị tước + log warning, trường lạ bị từ chối invalid_arguments.
6. test_06_caller_field_tampering_blocked: Tham số caller trong body/args không thể ghi đè caller='llm' ở /chat.
7. test_07_cross_user_isolation_user_a_and_b: Dữ liệu giữa User A và User B cô lập tuyệt đối (dashboard, progress, meals).
8. test_08_cross_user_session_access_forbidden: Truy cập session của user khác bị chặn (PermissionError và HTTP 403).
9. test_09_cross_user_meal_ownership_verified: verify_meal_ownership từ chối truy cập chéo bữa ăn giữa hai user.
10. test_10_unauthenticated_requests_return_401: Yêu cầu thiếu cookie/token không hợp lệ bị từ chối 401, không tool nào được chạy.
11. test_11_production_call_sites_pass_tool_context: Xác nhận mọi call site production đều truyền ToolContext tường minh.
12. test_12_regression_valid_user_flow_succeeds: Kiểm thử hồi quy các công cụ hoạt động chuẩn xác cho người dùng hợp lệ.
"""

import ast
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlmodel import Session, select

from src.ai.tool_definitions import (
    get_gemini_tool_declarations,
    get_tool_by_name,
    get_tool_definitions,
)
from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import (
    FoodReference,
    Meal,
    User,
    WeightLog,
    get_vn_today,
)
from src.backend.schemas.assistant_tools import (
    LogMealLLMArgs,
    LogMealUserActionArgs,
)
from src.backend.services.assistant_tools import (
    create_or_get_chat_session,
    dispatch_tool_call,
    exec_get_daily_nutrition,
    exec_get_progress_summary,
    exec_log_meal,
    get_chat_history,
    save_chat_message,
)
from src.backend.services.auth_service import (
    create_access_token,
    register_with_initial_goal,
)
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.tool_context import ToolContext
from src.backend.services.tool_security import (
    verify_meal_ownership,
)

FORBIDDEN_IDENTITY_KEYS = {
    "user_id",
    "authenticated_user_id",
    "account_id",
    "owner_id",
    "is_admin",
}


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
            password="SecurePassword123",
            initial_goal=GoalPlanInput(
                gender="male",
                age=26,
                height_cm=172.0,
                current_weight_kg=68.0,
                target_weight_kg=65.0,
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                activity_level="moderate",
                daily_budget_vnd=70000,
            ),
        )

    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    client = TestClient(app)
    client.cookies.set("access_token", token)
    return client, user


def _recursive_find_forbidden_keys(node: Any) -> list[str]:
    """Duyệt đệ quy tìm các khóa danh tính cấm trong schema dict/list."""
    found: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if str(k).lower() in FORBIDDEN_IDENTITY_KEYS:
                found.append(str(k))
            found.extend(_recursive_find_forbidden_keys(v))
    elif isinstance(node, list):
        for item in node:
            found.extend(_recursive_find_forbidden_keys(item))
    return found


# ==============================================================================
# TEST 1 & 2: KIỂM TRA SCHEMA GỬI LLM VÀ ĐỒNG BỘ PYDANTIC MODELS
# ==============================================================================


def test_01_schema_no_user_id_or_owner_id_recursive():
    """Kiểm tra schema của MỌI tool gửi cho LLM không chứa bất kỳ trường định danh nào."""
    openai_schemas = get_tool_definitions()
    gemini_schemas = get_gemini_tool_declarations()

    assert len(openai_schemas) == 4
    assert len(gemini_schemas) == 4

    leaked_openai = _recursive_find_forbidden_keys(openai_schemas)
    leaked_gemini = _recursive_find_forbidden_keys(gemini_schemas)

    assert leaked_openai == [], f"Phát hiện trường danh tính bị lộ trong OpenAI Schema: {leaked_openai}"
    assert leaked_gemini == [], f"Phát hiện trường danh tính bị lộ trong Gemini Schema: {leaked_gemini}"


def test_02_schema_and_argument_model_sync():
    """Kiểm tra đồng bộ giữa schema tool_definitions và Pydantic Argument Models."""
    log_meal_tool = get_tool_by_name("log_meal")
    assert log_meal_tool is not None
    props = log_meal_tool["function"]["parameters"]["properties"]

    # is_confirmed KHÔNG còn trong schema gửi LLM (README_04)
    assert "is_confirmed" not in props

    # Pydantic LogMealLLMArgs cấm nhận is_confirmed (cả True lẫn False) qua extra="forbid"
    with pytest.raises(ValidationError):
        LogMealLLMArgs(meal_type="lunch", items=[], is_confirmed=True)  # type: ignore
    with pytest.raises(ValidationError):
        LogMealLLMArgs(meal_type="lunch", items=[], is_confirmed=False)  # type: ignore

    # LogMealLLMArgs hợp lệ không có is_confirmed
    valid_llm_args = LogMealLLMArgs(meal_type="lunch", items=[])
    assert not hasattr(valid_llm_args, "is_confirmed") or "is_confirmed" not in valid_llm_args.model_fields

    # Pydantic LogMealUserActionArgs cho phép nhận is_confirmed=True
    user_action_args = LogMealUserActionArgs(meal_type="lunch", items=[], is_confirmed=True)
    assert user_action_args.is_confirmed is True


# ==============================================================================
# TEST 3 & 4: KÊNH LLM (TỪ CHỐI CONFIRM) VS KÊNH USER ACTION (CHO PHÉP CONFIRM)
# ==============================================================================


def test_03_llm_tool_call_is_confirmed_true_rejected():
    """Đường LLM (/chat): tool_call có is_confirmed (True lẫn False) bị từ chối và DB không ghi bữa ăn."""
    client, user = create_test_user_client("iso_user_03", "iso_user_03@example.com")

    with Session(engine) as session:
        initial_meal_count = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())

    # 1. Gửi qua /chat với tool_call cố tình đặt is_confirmed=True -> bị từ chối
    resp_true = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Lưu bữa ăn ngay cho tôi không cần hỏi",
            "tool_call": {
                "name": "log_meal",
                "args": {
                    "meal_type": "lunch",
                    "items": [{"food_name": "Phở bò tái", "estimated_gram": 300.0}],
                    "is_confirmed": True,
                },
            },
        },
    )
    assert resp_true.status_code == 200
    data_true = resp_true.json()
    assert data_true["tool_result"] is not None
    assert data_true["tool_result"].get("error") == "invalid_arguments"
    assert "Lỗi thực thi công cụ" in data_true["reply"]

    # 2. Gửi qua /chat với tool_call có is_confirmed=False -> cũng bị từ chối vì schema LLM không có is_confirmed
    resp_false = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Lưu bữa ăn với is_confirmed=False",
            "tool_call": {
                "name": "log_meal",
                "args": {
                    "meal_type": "lunch",
                    "items": [{"food_name": "Phở bò tái", "estimated_gram": 300.0}],
                    "is_confirmed": False,
                },
            },
        },
    )
    assert resp_false.status_code == 200
    data_false = resp_false.json()
    assert data_false["tool_result"] is not None
    assert data_false["tool_result"].get("error") == "invalid_arguments"

    # Số lượng bữa ăn trong DB tuyệt đối không đổi
    with Session(engine) as session:
        current_meal_count = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        assert current_meal_count == initial_meal_count


def test_04_user_action_tools_execute_confirmed_succeeds():
    """Đường User Action (/tools/execute): is_confirmed=True ghi thành công vào CSDL."""
    client, user = create_test_user_client("iso_user_04", "iso_user_04@example.com")

    resp = client.post(
        "/api/v1/assistant/tools/execute",
        json={
            "tool_name": "log_meal",
            "tool_args": {
                "meal_type": "lunch",
                "items": [{"food_name": "Phở bò tái", "estimated_gram": 350.0}],
                "is_confirmed": True,
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "logged"
    assert data["requires_confirmation"] is False
    assert data["meal_id"] is not None

    with Session(engine) as session:
        saved_meal = session.get(Meal, data["meal_id"])
        assert saved_meal is not None
        assert saved_meal.user_id == user.id


# ==============================================================================
# TEST 5 & 6: KHÓA DANH TÍNH BỊ TƯỚC + TRƯỜNG LẠ BỊ TỪ CHỐI & CHỐNG GHI ĐÈ CALLER
# ==============================================================================


def test_05_identity_keys_stripped_and_foreign_fields_rejected():
    """Khóa danh tính bị tước và log warning; trường lạ khác bị từ chối invalid_arguments."""
    _, user = create_test_user_client("iso_user_05", "iso_user_05@example.com")
    ctx = ToolContext(authenticated_user_id=user.id, caller="llm")

    with Session(engine) as session:
        # Trường hợp 1: Có trường lạ 'hack_field' -> Bị từ chối invalid_arguments
        res_invalid = dispatch_tool_call(
            session=session,
            authenticated_user_id=ctx,
            tool_name="get_daily_nutrition",
            tool_args={"date_str": "today", "hack_field": "injected_value"},
        )
        assert res_invalid.get("error") == "invalid_arguments"

        # Trường hợp 2: Chỉ chứa khóa danh tính giả mạo -> Bị tước bỏ và thực thi an toàn cho user thật
        res_stripped = dispatch_tool_call(
            session=session,
            authenticated_user_id=ctx,
            tool_name="get_daily_nutrition",
            tool_args={"user_id": 9999, "owner_id": 8888, "date_str": "today"},
        )
        assert res_stripped["user_id"] == user.id
        assert res_stripped["user_id"] != 9999


def test_06_caller_field_tampering_blocked():
    """Kẻ tấn công gửi field 'caller': 'user_action' vào /chat không thể qua mặt hệ thống."""
    client, user = create_test_user_client("iso_user_06", "iso_user_06@example.com")

    resp = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Hack caller",
            "caller": "user_action",  # Cố tình mạo nhận kênh user_action ở body
            "tool_call": {
                "name": "log_meal",
                "args": {
                    "meal_type": "lunch",
                    "items": [{"food_name": "Cơm trắng", "estimated_gram": 200.0}],
                    "is_confirmed": True,
                    "caller": "user_action",  # Cố tình mạo nhận kênh trong args
                },
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Vẫn bị từ chối vì router ép caller='llm' và Pydantic cấm trường lạ/cấm is_confirmed=True
    assert data["tool_result"] is not None
    assert data["tool_result"].get("error") == "invalid_arguments"


# ==============================================================================
# TEST 7, 8, 9, 10: CÔ LẬP USER A VÀ USER B TOÀN DIỆN
# ==============================================================================


def test_07_cross_user_isolation_user_a_and_b():
    """Dữ liệu giữa User A và User B cô lập tuyệt đối trong mọi công cụ."""
    client_a, user_a = create_test_user_client("iso_user_07a", "iso_user_07a@example.com")
    _, user_b = create_test_user_client("iso_user_07b", "iso_user_07b@example.com")

    with Session(engine) as session:
        # Ghi nhận bữa ăn cho User B
        exec_log_meal(
            session=session,
            authenticated_user_id=user_b.id,
            meal_type="Trưa",
            items_list=[{"food_name": "Phở bò tái", "estimated_gram": 400.0}],
            is_confirmed=True,
        )

        # Ghi nhận cân nặng cho User B
        w_log_b = WeightLog(user_id=user_b.id, weight_kg=85.0, logged_date=get_vn_today())
        session.add(w_log_b)
        session.commit()

        # User A gọi get_daily_nutrition: consumed calo phải là 0, không dính của B
        dash_a = exec_get_daily_nutrition(session, user_a.id, date_str="today")
        assert dash_a["user_id"] == user_a.id
        assert dash_a["consumed"]["calories"] == 0.0
        assert dash_a["meals_count"] == 0

        # User A gọi get_progress_summary: cân nặng của B không xuất hiện
        prog_a = exec_get_progress_summary(session, user_a.id, days_range=7)
        assert prog_a["user_id"] == user_a.id
        assert prog_a["latest_weight_kg"] != 85.0


def test_08_cross_user_session_access_forbidden():
    """Truy cập session của user khác bị chặn (PermissionError và HTTP 403 Forbidden)."""
    _, user_a = create_test_user_client("iso_user_08a", "iso_user_08a@example.com")
    client_b, user_b = create_test_user_client("iso_user_08b", "iso_user_08b@example.com")

    with Session(engine) as session:
        session_a = create_or_get_chat_session(session, user_a.id)

        # Service level: ném PermissionError
        with pytest.raises(PermissionError):
            get_chat_history(session, user_b.id, session_a.id)  # type: ignore

        with pytest.raises(PermissionError):
            save_chat_message(session, user_b.id, session_a.id, "user", "Attack!")  # type: ignore

    # API level: Client B gọi API lấy tin nhắn session của A -> HTTP 403 Forbidden
    resp = client_b.get(f"/api/v1/assistant/sessions/{session_a.id}/messages")
    assert resp.status_code == 403


def test_09_cross_user_meal_ownership_verified():
    """Xác minh quyền sở hữu bữa ăn: User B không thể truy cập meal_id của User A."""
    _, user_a = create_test_user_client("iso_user_09a", "iso_user_09a@example.com")
    _, user_b = create_test_user_client("iso_user_09b", "iso_user_09b@example.com")

    with Session(engine) as session:
        meal_res = exec_log_meal(
            session=session,
            authenticated_user_id=user_a.id,
            meal_type="Tối",
            items_list=[{"food_name": "Cơm tấm sườn nướng", "estimated_gram": 300.0}],
            is_confirmed=True,
        )
        meal_id_a = meal_res["meal_id"]

        assert verify_meal_ownership(session, meal_id_a, user_a.id) is True
        assert verify_meal_ownership(session, meal_id_a, user_b.id) is False

        with pytest.raises(PermissionError):
            verify_meal_ownership(session, meal_id_a, user_b.id, raise_exception=True)


def test_10_unauthenticated_requests_return_401():
    """Request không có Cookie hợp lệ bị chặn 401 Unauthorized, không tool nào được chạy."""
    unauth_client = TestClient(app)

    r1 = unauth_client.post("/api/v1/assistant/chat", json={"message": "Xem calo"})
    assert r1.status_code == 401

    r2 = unauth_client.post(
        "/api/v1/assistant/tools/execute",
        json={"tool_name": "log_meal", "tool_args": {"meal_type": "lunch", "items": []}},
    )
    assert r2.status_code == 401

    r3 = unauth_client.get("/api/v1/assistant/sessions")
    assert r3.status_code == 401


# ==============================================================================
# TEST 11 & 12: CALL SITE PRODUCTION AUDIT & REGRESSION
# ==============================================================================


def test_11_production_call_sites_pass_tool_context():
    """Kiểm tra AST toàn bộ src/ (gồm backend và ai) để chứng minh không có call site production nào truyền int cho dispatch_tool_call."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    src_dir = repo_root / "src"

    python_files = list(src_dir.rglob("*.py"))
    assert len(python_files) > 0

    call_sites_found = 0
    for p_file in python_files:
        code = p_file.read_text(encoding="utf-8")
        if "dispatch_tool_call(" not in code:
            continue

        tree = ast.parse(code, filename=str(p_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = None
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr

                if func_name == "dispatch_tool_call":
                    # Không kiểm tra định nghĩa hàm dispatch_tool_call
                    if p_file.name == "assistant_tools.py":
                        continue
                    call_sites_found += 1
                    # Kiểm tra tham số thứ 2 (hoặc keyword authenticated_user_id)
                    second_arg = None
                    if len(node.args) >= 2:
                        second_arg = node.args[1]
                    else:
                        for kw in node.keywords:
                            if kw.arg in ("authenticated_user_id", "context"):
                                second_arg = kw.value
                                break

                    assert second_arg is not None, f"Call site thiếu tham số user trong {p_file}"
                    # Xác nhận tham số không phải là hằng số nguyên (Constant int)
                    if isinstance(second_arg, ast.Constant):
                        assert not isinstance(second_arg.value, int), f"Call site truyền int tại {p_file}"
                    # Xác nhận nếu là Name thì không mang tên 'user_id' (biến int nguyên bản)
                    if isinstance(second_arg, ast.Name):
                        assert second_arg.id != "user_id", f"Call site truyền trực tiếp biến user_id (int) tại {p_file}:{node.lineno}"

    assert call_sites_found >= 7, f"Không tìm đủ call site production của dispatch_tool_call (tìm thấy {call_sites_found})"


def test_12_regression_valid_user_flow_succeeds():
    """Kiểm thử hồi quy toàn bộ 4 công cụ chạy đúng chuẩn cho người dùng hợp lệ."""
    _, user = create_test_user_client("iso_user_12", "iso_user_12@example.com")
    ctx = ToolContext(authenticated_user_id=user.id, caller="llm")

    with Session(engine) as session:
        # 1. get_daily_nutrition
        res_nutr = dispatch_tool_call(session, ctx, "get_daily_nutrition", {"date_str": "today"})
        assert res_nutr["tool_name"] == "get_daily_nutrition"
        assert res_nutr["user_id"] == user.id

        # 2. log_meal (preview)
        res_meal = dispatch_tool_call(
            session,
            ctx,
            "log_meal",
            {
                "meal_type": "lunch",
                "items": [{"food_name": "Phở bò tái", "estimated_gram": 300.0}],
            },
        )
        assert res_meal["status"] == "pending_confirmation"
        assert res_meal["requires_confirmation"] is True
        assert res_meal["meal_id"] is None

        # 3. recommend_meals
        res_rec = dispatch_tool_call(
            session,
            ctx,
            "recommend_meals",
            {"remaining_calories": 500.0, "budget_vnd": 50000},
        )
        assert res_rec["tool_name"] == "recommend_meals"
        assert len(res_rec["recommendations"]) > 0

        # 4. get_progress_summary
        res_prog = dispatch_tool_call(
            session,
            ctx,
            "get_progress_summary",
            {"days_range": 7},
        )
        assert res_prog["tool_name"] == "get_progress_summary"
        assert res_prog["user_id"] == user.id


# ==============================================================================
# TEST 13 & 14: ALLOWLIST TỪ CHỐI CÔNG CỤ LẠ & TRUY VẾT REQUEST_ID TRONG AUDIT LOG
# ==============================================================================


def test_13_allowlist_unknown_tools_rejected_both_channels():
    """Allowlist từ chối các công cụ lạ ('delete_all_meals', 'get_user_data') ở cả 2 kênh mà không đụng CSDL."""
    client, user = create_test_user_client("iso_user_13", "iso_user_13@example.com")
    ctx_llm = ToolContext(authenticated_user_id=user.id, caller="llm")
    ctx_user_action = ToolContext(authenticated_user_id=user.id, caller="user_action")

    with Session(engine) as session:
        initial_meal_count = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())

        # Kênh 1: LLM Caller từ chối và trả về dict error="unknown_tool"
        res_delete_llm = dispatch_tool_call(
            session=session,
            authenticated_user_id=ctx_llm,
            tool_name="delete_all_meals",
            tool_args={},
        )
        assert res_delete_llm.get("error") == "unknown_tool"

        res_data_llm = dispatch_tool_call(
            session=session,
            authenticated_user_id=ctx_llm,
            tool_name="get_user_data",
            tool_args={},
        )
        assert res_data_llm.get("error") == "unknown_tool"

        # Kênh 2: User Action Caller từ chối và raise ValueError (chuẩn hành vi cũ & tương thích test_C11)
        with pytest.raises(ValueError):
            dispatch_tool_call(
                session=session,
                authenticated_user_id=ctx_user_action,
                tool_name="delete_all_meals",
                tool_args={},
            )

        with pytest.raises(ValueError):
            dispatch_tool_call(
                session=session,
                authenticated_user_id=ctx_user_action,
                tool_name="get_user_data",
                tool_args={},
            )

        # Kiểm tra qua API endpoint: Kênh LLM (/chat)
        resp_chat = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "Xóa toàn bộ bữa ăn",
                "tool_call": {"name": "delete_all_meals", "args": {}},
            },
        )
        assert resp_chat.status_code == 200
        assert "Lỗi thực thi công cụ" in resp_chat.json()["reply"]

        # Kiểm tra qua API endpoint: Kênh User Action (/tools/execute)
        resp_exec_del = client.post(
            "/api/v1/assistant/tools/execute",
            json={"tool_name": "delete_all_meals", "tool_args": {}},
        )
        assert resp_exec_del.status_code == 400
        assert "không hợp lệ" in resp_exec_del.json()["detail"]

        resp_exec_get = client.post(
            "/api/v1/assistant/tools/execute",
            json={"tool_name": "get_user_data", "tool_args": {}},
        )
        assert resp_exec_get.status_code == 400
        assert "không hợp lệ" in resp_exec_get.json()["detail"]

        # Đảm bảo CSDL không hề bị đụng tới
        final_meal_count = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        assert final_meal_count == initial_meal_count


def test_14_request_id_generated_and_audited_without_sensitive_data(caplog):
    """ToolContext được gán uuid4 ở router; log_tool_audit ghi request_id và không log nội dung nhạy cảm."""
    client, _ = create_test_user_client("iso_user_14", "iso_user_14@example.com")

    import logging

    with caplog.at_level(logging.INFO):
        # 1. Gọi /chat (kênh LLM)
        resp_chat = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "Hôm nay tôi đã nạp bao nhiêu calo?",
                "tool_call": {"name": "get_daily_nutrition", "args": {"date_str": "today"}},
            },
        )
        assert resp_chat.status_code == 200

        # 2. Gọi /tools/execute (kênh user_action)
        resp_exec = client.post(
            "/api/v1/assistant/tools/execute",
            json={
                "tool_name": "log_meal",
                "tool_args": {
                    "meal_type": "lunch",
                    "items": [{"food_name": "Cơm gà nướng", "estimated_gram": 250.0}],
                    "is_confirmed": True,
                },
            },
        )
        assert resp_exec.status_code == 200

    # Kiểm tra log kiểm toán
    audit_records = [rec for rec in caplog.records if "TOOL_AUDIT:" in rec.message]
    assert len(audit_records) >= 2

    for record in audit_records:
        msg = record.message
        # Xác nhận có chứa request_id hợp lệ dạng uuid4
        assert "request_id=" in msg
        parts = msg.split()
        req_id_part = next(p for p in parts if p.startswith("request_id="))
        req_id_val = req_id_part.split("=")[1]
        assert req_id_val != "none"
        parsed_uuid = uuid.UUID(req_id_val)
        assert parsed_uuid.version == 4

        # Xác nhận tuyệt đối không log token, cookie, password hay nội dung chi tiết món ăn trong audit log
        assert "access_token" not in msg
        assert "jwt" not in msg.lower()
        assert "cookie" not in msg.lower()
        assert "password" not in msg.lower()
        assert "Cơm gà nướng" not in msg


def test_15_orchestrator_passes_caller_llm_rejects_is_confirmed():
    """Chứng minh AIOrchestrator truyền ToolContext(caller='llm'), do đó nếu LLM trả tool_args có is_confirmed=True thì bị từ chối."""
    from unittest.mock import MagicMock, patch

    from src.ai.orchestrator import AIOrchestrator

    _, user = create_test_user_client("iso_user_15", "iso_user_15@example.com")
    orchestrator = AIOrchestrator(api_key="mock_key_test_15", use_mock_fallback=False)

    # Giả lập GenerativeModel trả về function_call log_meal cố tình đặt is_confirmed=True
    mock_part = MagicMock()
    mock_part.function_call.name = "log_meal"
    mock_part.function_call.args = {
        "meal_type": "lunch",
        "items": [{"food_name": "Phở bò tái", "estimated_gram": 300.0}],
        "is_confirmed": True,
    }

    mock_candidate = MagicMock()
    mock_candidate.content.parts = [mock_part]
    mock_response = MagicMock()
    mock_response.candidates = [mock_candidate]

    mock_chat = MagicMock()
    mock_chat.send_message.return_value = mock_response
    mock_model = MagicMock()
    mock_model.start_chat.return_value = mock_chat

    with (
        patch.object(orchestrator, "_is_api_key_valid", return_value=True),
        patch.object(orchestrator, "_init_gemini_model", return_value=mock_model),
        Session(engine) as session,
    ):
        resp = orchestrator.process_message(
            session=session,
            user_id=user.id,
            message="Lưu bữa ăn ngay cho tôi",
        )

    assert resp.tool_called == "log_meal"
    assert resp.tool_result is not None
    # Vì caller="llm", tham số is_confirmed bị cấm và trả lỗi invalid_arguments
    assert resp.tool_result.get("error") == "invalid_arguments"


