
"""
tests/unit/test_voice_modifier_and_personalization.py
Bộ kiểm thử tự động toàn diện Tuần 5: Voice Modifier & Cá nhân hóa sâu AI Assistant.
Phân hệ phụ trách: Cặp 3 – AI Intelligence & QA/Benchmarking.

Bao gồm các kịch bản kiểm thử:
1. test_01_voice_modifier_added_olive_oil_and_mayonnaise: Bổ sung dầu ô-liu và sốt mayonnaise.
2. test_02_voice_modifier_sesame_sauce_and_butter: Bổ sung 2 thìa sốt mè rang và áp chảo bơ.
3. test_03_voice_modifier_scallion_oil_and_condensed_milk: Bổ sung mỡ hành và sữa đặc.
4. test_04_voice_modifier_leftovers_half_portion: Điều chỉnh ăn một nửa đĩa hoặc bớt nửa phần cơm.
5. test_05_voice_modifier_leftovers_fraction_one_third: Bỏ lại 1/3 bánh phở (giữ lại 2/3).
6. test_06_voice_modifier_leftovers_fraction_one_fourth: Bỏ lại 1/4 đĩa cơm (giữ lại 3/4).
7. test_07_voice_modifier_exact_gram_portion: Chỉ định khối lượng gam cụ thể (ăn 150g).
8. test_08_voice_modifier_removed_components: Loại bỏ thành phần ẩn (không húp nước béo, bỏ da gà).
9. test_09_voice_modifier_offline_deterministic_fallback: Chế độ tất định offline và kiểm tra wrapper re-export.
10. test_10_behavioral_patterns_loaded_into_user_profile_context: Nạp mẫu hành vi 7-14 ngày vào UserProfileContext.
11. test_11_system_instruction_injects_behavioral_patterns: Kiểm tra System Prompt chứa thông tin mẫu hành vi.
12. test_12_orchestrator_advice_addresses_user_behavior_patterns: AI Assistant phản hồi lời khuyên bám sát mẫu hành vi.
13. test_13_orchestrator_recommend_meals_budget_50k_to_80k: Gợi ý món ăn trong hạn mức calo và ngân sách 50k-80k.
14. test_14_orchestrator_recommend_meals_strict_budget_40k: Gợi ý món ăn thỏa mãn ngân sách chặt 40k và dưới 500 calo.
15. test_15_orchestrator_log_meal_with_voice_modifier: Điều phối log_meal kết hợp phân tích voice_modifier.
"""

import uuid
from datetime import UTC, datetime, time, timedelta

import pytest
from sqlmodel import Session, select

from src.ai.orchestrator import (
    UserProfileContext,
    build_system_instruction,
    fetch_user_profile_context,
    orchestrate_chat,
)
from src.ai.voice_modifier import (
    VoiceModifierResult,
    modify_dishes_with_voice,
    parse_voice_modifier,
)
from src.backend.models.database import engine, init_db
from src.backend.models.schema import (
    FoodReference,
    Meal,
    MealItem,
    User,
    get_vn_today,
)
from src.backend.services.auth_service import register_with_initial_goal
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.nutrition_service import resolve_food_reference
from src.backend.services.voice_modifier import (
    parse_voice_modifier as service_parse_voice_modifier,
)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL và nạp dữ liệu tham chiếu thực phẩm."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


@pytest.fixture(autouse=True)
def force_offline_voice_modifier(monkeypatch):
    """Đảm bảo kiểm thử tự động unit test chạy chế độ offline tất định, không gọi Gemini trực tiếp."""
    monkeypatch.setattr("src.ai.voice_modifier.VoiceModifier._is_api_key_valid", lambda self: False)


def create_w5_test_user(username: str, email: str) -> User:
    """Helper tạo tài khoản người dùng kiểm thử sạch có Goal."""
    rand = uuid.uuid4().hex[:6]
    unique_user = f"{username}_{rand}"
    unique_email = f"{rand}_{email}"
    with Session(engine) as session:
        user, _ = register_with_initial_goal(
            session=session,
            username=unique_user,
            email=unique_email,
            password="Password123",
            initial_goal=GoalPlanInput(
                gender="male",
                age=26,
                height_cm=175.0,
                current_weight_kg=72.0,
                target_weight_kg=68.0,
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                activity_level="moderate",
                daily_budget_vnd=70000,
            ),
        )
    return user


def add_test_meal(
    session: Session,
    user_id: int,
    meal_type: str,
    food_name: str,
    gram: float,
    logged_at: datetime,
) -> Meal:
    """Helper tạo bản ghi bữa ăn có liên kết FoodReference thực tế."""
    ref = resolve_food_reference(session, food_name=food_name)
    meal = Meal(
        user_id=user_id,
        meal_type=meal_type,
        logged_at=logged_at,
    )
    session.add(meal)
    session.flush()

    cal = round((gram / 100.0) * ref.calories_per_100g, 2)
    meal_item = MealItem(
        meal_id=meal.id,  # type: ignore
        food_id=ref.id,  # type: ignore
        estimated_gram=gram,
        estimated_calories=cal,
    )
    session.add(meal_item)
    session.commit()
    session.refresh(meal)
    return meal


# ==============================================================================
# PHẦN 1: KIỂM THỬ VOICE MODIFIER (MODULE & SERVICES)
# ==============================================================================


def test_01_voice_modifier_added_olive_oil_and_mayonnaise():
    """Kiểm tra bổ sung 1 thìa dầu ô-liu (~14g) và 1 thìa sốt mayonnaise (~15g)."""
    dishes = [{"dish_name": "Ức gà luộc", "estimated_weight_gram": 200.0}]
    transcript = "Ức gà áp chảo bằng 1 muỗng dầu ô-liu, thêm 1 thìa sốt mayonnaise"

    res = parse_voice_modifier(dishes, transcript)

    assert isinstance(res, VoiceModifierResult)
    assert len(res.added_modifiers) == 2

    # Kiểm tra dầu ô-liu
    olive_oil = next((m for m in res.added_modifiers if "dầu ô-liu" in m.name.lower()), None)
    assert olive_oil is not None
    assert olive_oil.weight_gram == 14.0
    assert olive_oil.estimated_calories > 100.0

    # Kiểm tra mayonnaise
    mayo = next((m for m in res.added_modifiers if "mayonnaise" in m.name.lower()), None)
    assert mayo is not None
    assert mayo.weight_gram == 15.0
    assert mayo.estimated_calories > 80.0

    # Kiểm tra to_meal_items
    meal_items = res.to_meal_items()
    assert len(meal_items) == 3
    names = [i["food_name"] for i in meal_items]
    assert "Ức gà luộc" in names
    assert "Dầu ô-liu" in names
    assert "Sốt mayonnaise" in names


def test_02_voice_modifier_sesame_sauce_and_butter():
    """Kiểm tra bổ sung 2 thìa sốt mè rang (~30g) và áp chảo bơ (~14g)."""
    dishes = [{"dish_name": "Salad xà lách", "estimated_weight_gram": 150.0}]
    transcript = "Thêm 2 thìa sốt mè rang và áp chảo bơ"

    res = modify_dishes_with_voice(dishes, transcript)

    sesame = next((m for m in res.added_modifiers if "mè rang" in m.name.lower()), None)
    assert sesame is not None
    assert sesame.weight_gram == 30.0

    butter = next((m for m in res.added_modifiers if "bơ" in m.name.lower()), None)
    assert butter is not None
    assert butter.weight_gram == 14.0


def test_03_voice_modifier_scallion_oil_and_condensed_milk():
    """Kiểm tra bổ sung 1 muỗng canh mỡ hành (~15g) và sữa đặc."""
    dishes = [{"dish_name": "Cơm tấm sườn", "estimated_weight_gram": 350.0}]
    transcript = "Ăn hết đĩa nhưng có chan thêm 1 muỗng canh mỡ hành, tráng miệng thêm 1 thìa sữa đặc"

    res = parse_voice_modifier(dishes, transcript)

    mo_hanh = next((m for m in res.added_modifiers if "mỡ hành" in m.name.lower()), None)
    assert mo_hanh is not None
    assert mo_hanh.weight_gram == 15.0
    assert mo_hanh.estimated_calories > 80.0

    milk = next((m for m in res.added_modifiers if "sữa đặc" in m.name.lower()), None)
    assert milk is not None
    assert milk.weight_gram == 15.0


def test_04_voice_modifier_leftovers_half_portion():
    """Kiểm tra ăn một nửa phần cơm (50%) trong khi món ức gà giữ nguyên 100%."""
    dishes = [
        {"dish_name": "Ức gà áp chảo", "estimated_weight_gram": 200.0},
        {"dish_name": "Cơm trắng", "estimated_weight_gram": 200.0},
    ]
    transcript = "Ức gà ăn hết, chỉ ăn nửa phần cơm"

    res = parse_voice_modifier(dishes, transcript)

    rice = next(d for d in res.adjusted_dishes if "cơm" in d["dish_name"].lower())
    assert rice["adjusted_weight_gram"] == 100.0
    assert rice["eaten_ratio"] == 0.5

    chicken = next(d for d in res.adjusted_dishes if "ức gà" in d["dish_name"].lower())
    assert chicken["adjusted_weight_gram"] == 200.0
    assert chicken["eaten_ratio"] == 1.0


def test_05_voice_modifier_leftovers_fraction_one_third():
    """Kiểm tra bỏ lại 1/3 bánh phở (tỷ lệ giữ lại = 2/3 ≈ 0.67, khối lượng > 0g)."""
    dishes = [{"dish_name": "Bánh phở", "estimated_weight_gram": 300.0}]
    transcript = "Bỏ lại 1/3 bánh phở"

    res = parse_voice_modifier(dishes, transcript)

    pho = res.adjusted_dishes[0]
    assert pho["adjusted_weight_gram"] == 201.0 or pho["adjusted_weight_gram"] == 200.0
    assert pho["eaten_ratio"] == 0.67
    assert pho["adjusted_weight_gram"] > 0


def test_06_voice_modifier_leftovers_fraction_one_fourth():
    """Kiểm tra bỏ lại 1/4 đĩa cơm (giữ lại 75%, khối lượng > 0g)."""
    dishes = [{"dish_name": "Cơm chiên", "estimated_weight_gram": 400.0}]
    transcript = "Bỏ lại 1/4 đĩa cơm chiên"

    res = parse_voice_modifier(dishes, transcript)

    rice = res.adjusted_dishes[0]
    assert rice["adjusted_weight_gram"] == 300.0
    assert rice["eaten_ratio"] == 0.75
    assert rice["adjusted_weight_gram"] > 0


def test_07_voice_modifier_exact_gram_portion():
    """Kiểm tra định lượng gram cụ thể (ăn 150g)."""
    dishes = [{"dish_name": "Thịt bò xào", "estimated_weight_gram": 250.0}]
    transcript = "Nhiều quá nên chỉ ăn 150g thịt bò"

    res = parse_voice_modifier(dishes, transcript)

    beef = res.adjusted_dishes[0]
    assert beef["adjusted_weight_gram"] == 150.0
    assert beef["adjusted_weight_gram"] > 0


def test_08_voice_modifier_removed_components():
    """Kiểm tra loại bỏ da gà và không húp nước béo của Phở bò."""
    dishes = [
        {"dish_name": "Phở bò tái", "estimated_weight_gram": 500.0},
        {"dish_name": "Gà luộc", "estimated_weight_gram": 200.0},
    ]
    transcript = "Phở bò không húp nước béo, gà luộc thì bỏ da gà nhé"

    res = parse_voice_modifier(dishes, transcript)

    assert len(res.removed_modifiers) == 2
    comp_names = [r.removed_component for r in res.removed_modifiers]
    assert "nước béo" in comp_names
    assert "da gà" in comp_names

    # Xác minh applied_modifications có chuỗi tóm tắt
    assert any("nước béo" in s for s in res.applied_modifications)
    assert any("da gà" in s for s in res.applied_modifications)


def test_09_voice_modifier_offline_deterministic_fallback():
    """Kiểm tra chế độ Fallback tất định 100% offline và wrapper re-export."""
    dishes = [{"dish_name": "Đậu hũ chiên", "estimated_weight_gram": 150.0}]
    transcript = "Thêm 1 thìa dầu ô-liu và bớt nửa phần"

    # Gọi qua src.ai.voice_modifier với force_fallback=True
    res_ai = parse_voice_modifier(dishes, transcript, force_fallback=True)
    assert res_ai.is_fallback is True

    # Gọi qua re-export wrapper src.backend.services.voice_modifier
    res_srv = service_parse_voice_modifier(dishes, transcript, force_fallback=True)
    assert res_srv.is_fallback is True
    assert len(res_srv.added_modifiers) == len(res_ai.added_modifiers)
    assert res_srv.adjusted_dishes[0]["adjusted_weight_gram"] == res_ai.adjusted_dishes[0]["adjusted_weight_gram"]


# ==============================================================================
# PHẦN 2: KIỂM THỬ CÁ NHÂN HÓA HÀNH VI (ANALYZE_PATTERNS -> ORCHESTRATOR)
# ==============================================================================


def test_10_behavioral_patterns_loaded_into_user_profile_context():
    """Xác minh fetch_user_profile_context nạp đúng các mẫu hành vi nhận diện từ CSDL."""
    user = create_w5_test_user("w5_patterns_user_1", "w5_patterns_1@example.com")
    today = get_vn_today()

    # Nạp 7 ngày dữ liệu: Bỏ bữa sáng (chỉ ăn trưa và tối) + Thiếu đạm (chỉ ăn dưa leo/cơm ít đạm)
    with Session(engine) as session:
        for i in range(7):
            d = today - timedelta(days=i)
            # Bữa trưa: Dưa leo (rất ít đạm)
            t_lunch = datetime.combine(d, time(12, 0), tzinfo=UTC)
            add_test_meal(session, user.id, "Trưa", "Rau cải luộc", 150.0, t_lunch)
            # Bữa tối: Cơm trắng (ít đạm)
            t_dinner = datetime.combine(d, time(19, 0), tzinfo=UTC)
            add_test_meal(session, user.id, "Tối", "Cơm trắng", 150.0, t_dinner)

    with Session(engine) as session:
        profile = fetch_user_profile_context(session, user.id, include_patterns=True, days_range=14)

        assert isinstance(profile, UserProfileContext)
        assert profile.has_pattern_insights is True
        assert len(profile.behavioral_patterns) >= 1

        pattern_codes = [p["pattern_code"] for p in profile.behavioral_patterns]
        # Xác minh nhận diện mẫu bỏ bữa sáng hoặc thiếu đạm
        assert "skipping_breakfast" in pattern_codes or "low_protein" in pattern_codes
        assert profile.behavioral_summary is not None


def test_11_system_instruction_injects_behavioral_patterns():
    """Xác minh build_system_instruction đưa các mẫu hành vi và hướng dẫn Smart Compensation vào System Prompt."""
    profile = UserProfileContext(
        user_id=999,
        username="TestCoachUser",
        target_calories=2000.0,
        target_protein_g=140.0,
        behavioral_patterns=[
            {
                "pattern_code": "skipping_breakfast",
                "title": "Thói quen bỏ bữa sáng",
                "recommendation": "Bạn mới ghi nhận bữa sáng trong 0/7 ngày gần đây.",
            },
            {
                "pattern_code": "low_protein",
                "title": "Lượng đạm trung bình chưa đạt mục tiêu",
                "recommendation": "Lượng đạm của bạn đạt 45g/ngày (mục tiêu 140g).",
            },
        ],
        has_pattern_insights=True,
    )

    sys_inst = build_system_instruction(profile)

    assert "MẪU HÀNH VI ĂN UỐNG 7-14 NGÀY" in sys_inst
    assert "SKIPPING_BREAKFAST" in sys_inst
    assert "LOW_PROTEIN" in sys_inst
    assert "SMART COMPENSATION" in sys_inst
    assert "không phán xét" in sys_inst


def test_12_orchestrator_advice_addresses_user_behavior_patterns():
    """Xác minh AI Assistant chủ động đưa lời khuyên bám sát mẫu hành vi thực tế khi người dùng hỏi."""
    user = create_w5_test_user("w5_patterns_user_2", "w5_patterns_2@example.com")
    today = get_vn_today()

    with Session(engine) as session:
        # Nạp 7 ngày ăn khuya sau 21:30
        for i in range(7):
            d = today - timedelta(days=i)
            t_night = datetime.combine(d, time(22, 15), tzinfo=UTC)
            add_test_meal(session, user.id, "Tối", "Phở gà", 350.0, t_night)

    with Session(engine) as session:
        resp = orchestrate_chat(
            session=session,
            user_id=user.id,
            message="Bạn có lời khuyên gì về thói quen ăn uống gần đây của mình không?",
        )

        assert resp.reply is not None
        # Xác minh phản hồi có nhắc đến thói quen hoặc nhận xét nhẹ nhàng
        assert any(
            k in resp.reply.lower()
            for k in ["thói quen", "nhật ký", "khuyên", "21:00", "ăn muộn", "dinh dưỡng"]
        )


# ==============================================================================
# PHẦN 3: KIỂM THỬ GỢI Ý THỰC ĐƠN THEO NGÂN SÁCH (RECOMMEND_MEALS INTEGRATION)
# ==============================================================================


def test_13_orchestrator_recommend_meals_budget_50k_to_80k():
    """Kiểm thử gợi ý thực đơn trong khoảng ngân sách 50.000đ - 80.000đ và calo còn lại 600 kcal."""
    user = create_w5_test_user("w5_budget_user_1", "w5_budget_1@example.com")

    with Session(engine) as session:
        resp = orchestrate_chat(
            session=session,
            user_id=user.id,
            message="Gợi ý cho mình món ăn trong tầm giá 50.000đ đến 80.000đ, còn khoảng 600 calo",
        )

        assert resp.tool_called == "recommend_meals"
        assert resp.tool_result is not None

        recs = resp.tool_result.get("recommendations", [])
        assert len(recs) > 0

        for r in recs:
            # Calo không vượt quá hạn mức còn lại
            assert r["estimated_calories"] <= 600.0
            # Giá tiền nằm trong trần ngân sách 80.000 VNĐ
            assert r["avg_price_vnd"] <= 80000

        # Lời thoại phải nhắc đến calo và ngân sách
        assert "kcal" in resp.reply
        assert "VNĐ" in resp.reply


def test_14_orchestrator_recommend_meals_strict_budget_40k():
    """Kiểm thử gợi ý thực đơn với hạn mức ngân sách chặt 40.000 VNĐ và dưới 500 calo."""
    user = create_w5_test_user("w5_budget_user_2", "w5_budget_2@example.com")

    with Session(engine) as session:
        resp = orchestrate_chat(
            session=session,
            user_id=user.id,
            message="Đề xuất món ăn ngân sách 40.000 VNĐ và dưới 500 calo",
        )

        assert resp.tool_called == "recommend_meals"
        assert resp.tool_result is not None

        recs = resp.tool_result.get("recommendations", [])
        assert len(recs) > 0

        for r in recs:
            assert r["estimated_calories"] <= 500.0
            assert r["avg_price_vnd"] <= 40000


def test_15_orchestrator_log_meal_with_voice_modifier():
    """Kiểm thử tích hợp voice_modifier vào luồng log_meal của AI Assistant."""
    user = create_w5_test_user("w5_voice_log_user", "w5_voice_log@example.com")

    with Session(engine) as session:
        resp = orchestrate_chat(
            session=session,
            user_id=user.id,
            message="Ghi nhận bữa trưa vừa ăn ức gà áp chảo bằng 1 muỗng dầu ô-liu, chỉ ăn nửa phần cơm",
            voice_transcript="Ức gà áp chảo bằng 1 muỗng dầu ô-liu, chỉ ăn nửa phần cơm",
        )

        assert resp.tool_called == "log_meal"
        assert resp.pending_confirmation is True
        assert resp.voice_modifier_result is not None
        assert len(resp.applied_modifications) >= 1

        # Xác minh thẻ action card được sinh đầy đủ
        assert resp.action_card is not None
        assert resp.action_card.get("status") == "pending_user_action"
        assert resp.pending_confirmation is True
