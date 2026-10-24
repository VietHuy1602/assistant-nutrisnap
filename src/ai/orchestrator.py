"""
src/ai/orchestrator.py
Module AI Orchestrator (Bộ điều phối Trí tuệ Nhân tạo) cho NutriSnap.
Phân hệ phụ trách: Cặp 3 – AI Intelligence & QA/Benchmarking (Dòng 49).

Trách nhiệm cốt lõi:
1. User Profile Context Injection:
   - Truy vấn hồ sơ thể trạng và mục tiêu dinh dưỡng từ CSDL (Goal/User).
   - Nạp thông tin vào System Prompt dưới vai trò "Constructive Nutrition Coach" (thân thiện, không phán xét).
   - Bảo mật Zero-Trust: Khoá cứng `authenticated_user_id` từ phiên xác thực, cấm LLM tự ý can thiệp.
2. Tool Calling Dispatch:
   - Điều phối LLM kết nối với 4 công cụ backend:
     * get_daily_nutrition -> exec_get_daily_nutrition
     * log_meal -> exec_log_meal
     * recommend_meals -> exec_recommend_meals
     * get_progress_summary -> exec_get_progress_summary
   - Khởi tạo Gemini API với Function Declarations chuẩn và cơ chế Fallback an toàn (Zero-Crash).
3. Zero-Hallucination Math:
   - Trích xuất 100% số liệu Calo, Protein, Carbs, Fat, Giá tiền từ CSDL qua kết quả của 4 hàm backend.
   - Tuyệt đối không để LLM bịa đặt hay suy đoán số liệu dinh dưỡng.
4. Clarification Handling:
   - Phát hiện các yêu cầu ghi nhận bữa ăn hoặc gợi ý mơ hồ (thiếu tên món cụ thể, thiếu khẩu phần, hoặc số liệu phi lý).
   - Không tự ý gọi `exec_log_meal` với dữ liệu suy đoán; lịch sự hỏi lại người dùng để làm rõ.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from src.ai.intent_classifier import classify_user_intent
from src.ai.tool_definitions import get_gemini_tool_declarations
from src.backend.models.schema import Goal, User
from src.backend.services.assistant_tools import (
    dispatch_tool_call,
    exec_get_daily_nutrition,
    exec_get_progress_summary,
    exec_log_meal,
    exec_recommend_meals,
)
from src.backend.services.nutrition_service import DISCLAIMER_TEXT

logger = logging.getLogger("nutrisnap.ai.orchestrator")


# ==============================================================================
# 1. PYDANTIC SCHEMAS CHO ORCHESTRATOR
# ==============================================================================


class UserProfileContext(BaseModel):
    """Thông tin hồ sơ và mục tiêu dinh dưỡng cá nhân nạp vào ngữ cảnh AI."""

    user_id: int
    username: str = "Bạn"
    gender: str = "other"
    age: int = 25
    height_cm: float = 170.0
    current_weight_kg: float = 65.0
    target_weight_kg: float = 65.0
    goal_type: str = "maintain"
    weekly_pace_kg: float = 0.0
    activity_level: str = "moderate"
    bmr_calories: float = 1600.0
    tdee_calories: float = 2000.0
    target_calories: float = 2000.0
    target_protein_g: float = 120.0
    target_carbs_g: float = 200.0
    target_fat_g: float = 50.0
    daily_budget_vnd: int = 60000
    behavioral_patterns: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Danh sách mẫu thói quen ăn uống nhận diện từ CSDL 7-14 ngày",
    )
    behavioral_summary: Optional[dict[str, Any]] = Field(
        default=None,
        description="Chỉ số thống kê hành vi (tỷ lệ bữa sáng, ăn khuya, đạm trung bình)",
    )
    has_pattern_insights: bool = Field(
        default=False,
        description="True nếu người dùng có ít nhất một mẫu thói quen hành vi được nhận diện",
    )

    model_config = ConfigDict(extra="ignore")


class OrchestratorResponse(BaseModel):
    """Kết quả phản hồi toàn diện từ AI Orchestrator."""

    reply: str = Field(..., description="Câu trả lời thân thiện từ AI Coach")
    reply_text: str = Field(..., description="Alias tương thích ngược cho reply")
    tool_called: Optional[str] = Field(default=None, description="Tên công cụ đã thực thi")
    tool_args: Optional[dict[str, Any]] = Field(default=None, description="Tham số đã truyền vào công cụ")
    tool_result: Optional[dict[str, Any]] = Field(default=None, description="Kết quả thực thi từ CSDL")
    pending_confirmation: bool = Field(default=False, description="Cần người dùng bấm nút xác nhận Two-Step")
    action_card: Optional[dict[str, Any]] = Field(default=None, description="Thẻ hành động preview bữa ăn")
    clarification_needed: bool = Field(default=False, description="Đang yêu cầu người dùng làm rõ thông tin")
    is_fallback: bool = Field(default=False, description="Chạy qua chế độ dự phòng thông minh (Offline/Fallback)")
    voice_modifier_result: Optional[dict[str, Any]] = Field(
        default=None, description="Kết quả phân tích điều chỉnh món ăn từ giọng nói"
    )
    applied_modifications: list[str] = Field(
        default_factory=list, description="Danh sách tóm tắt các điều chỉnh từ voice modifier"
    )
    disclaimer: str = Field(default=DISCLAIMER_TEXT, description="Tuyên bố miễn trừ trách nhiệm y tế")

    model_config = ConfigDict(extra="ignore")


# ==============================================================================
# 2. USER PROFILE CONTEXT INJECTION
# ==============================================================================


def fetch_user_profile_context(
    session: Session,
    user_id: int,
    include_patterns: bool = True,
    days_range: int = 14,
) -> UserProfileContext:
    """Truy vấn hồ sơ cá nhân và mục tiêu hiện tại từ CSDL SQLite.

    Nạp thêm các mẫu thói quen hành vi 7-14 ngày từ analyze_user_patterns nếu có.
    Nếu người dùng chưa thiết lập Goal, trả về hồ sơ mặc định an toàn y khoa.
    """
    user = session.get(User, user_id)
    username = user.username if user and user.username else "Bạn"

    goal = session.exec(select(Goal).where(Goal.user_id == user_id)).first()

    # Nạp mẫu hành vi ăn uống từ tầng Analytics nếu có
    b_patterns: list[dict[str, Any]] = []
    b_summary: Optional[dict[str, Any]] = None
    if include_patterns:
        try:
            from src.backend.services.analytics_service import analyze_user_patterns

            p_data = analyze_user_patterns(
                session=session,
                authenticated_user_id=user_id,
                days_range=days_range,
            )
            if p_data.get("status") == "analyzed":
                b_patterns = p_data.get("patterns", [])
                b_summary = p_data.get("summary_metrics")
        except Exception as exc:
            logger.debug("Không thể phân tích mẫu hành vi người dùng: %s", exc)

    has_patterns = len(b_patterns) > 0

    if not goal:
        return UserProfileContext(
            user_id=user_id,
            username=username,
            behavioral_patterns=b_patterns,
            behavioral_summary=b_summary,
            has_pattern_insights=has_patterns,
        )

    target_w = getattr(goal, "target_weight", getattr(goal, "target_weight_kg", 65.0))

    return UserProfileContext(
        user_id=user_id,
        username=username,
        gender=goal.gender or "other",
        age=goal.age or 25,
        height_cm=float(goal.height_cm or 170.0),
        current_weight_kg=float(goal.current_weight_kg or 65.0),
        target_weight_kg=float(target_w),
        goal_type=goal.goal_type or "maintain",
        weekly_pace_kg=float(goal.weekly_pace_kg or 0.0),
        activity_level=goal.activity_level or "moderate",
        bmr_calories=float(goal.bmr_calories or 1600.0),
        tdee_calories=float(goal.tdee_calories or 2000.0),
        target_calories=float(goal.target_calories or 2000.0),
        target_protein_g=float(goal.target_protein_g or 120.0),
        target_carbs_g=float(goal.target_carbs_g or 200.0),
        target_fat_g=float(goal.target_fat_g or 50.0),
        daily_budget_vnd=int(goal.daily_budget_vnd or 60000),
        behavioral_patterns=b_patterns,
        behavioral_summary=b_summary,
        has_pattern_insights=has_patterns,
    )


def build_system_instruction(profile: UserProfileContext) -> str:
    """Tạo System Instruction chuẩn mực cho vai trò Constructive Nutrition Coach.

    Tích hợp hồ sơ thể trạng và rào chắn an toàn Zero-Hallucination & Clarification.
    """
    goal_vn = {
        "lose_weight": "Giảm cân khoa học",
        "gain_muscle": "Tăng cơ khỏe mạnh",
        "maintain": "Duy trì cân nặng ổn định",
    }.get(profile.goal_type, profile.goal_type)

    patterns_section = ""
    if profile.behavioral_patterns:
        patterns_section = "\n\nMẪU HÀNH VI ĂN UỐNG 7-14 NGÀY (BEHAVIORAL PATTERN INSIGHTS):\n"
        for p in profile.behavioral_patterns:
            p_code = p.get("pattern_code", "")
            p_title = p.get("title", "")
            p_rec = p.get("recommendation", "")
            patterns_section += f"- [{p_code.upper()}] {p_title}: {p_rec}\n"
        patterns_section += (
            "\nHƯỚNG DẪN SMART COMPENSATION & TƯ VẤN CÁ NHÂN HÓA:\n"
            "- Chủ động lồng ghép khéo léo và ân cần các nhận xét dựa trên mẫu hành vi thực tế của người dùng.\n"
            "- Nếu người dùng hay bỏ bữa sáng: Nhắc nhẹ nhàng một bữa sáng đủ đạm giúp năng lượng bền vững.\n"
            "- Nếu người dùng thiếu hụt protein: Khuyến khích bổ sung ức gà, cá, đậu hũ, trứng vào thực đơn.\n"
            "- Nếu người dùng hay ăn khuya sau 21h: Gợi ý các món thanh nhẹ, ít dầu mỡ để ngủ ngon hơn.\n"
            "- Luôn giữ thái độ đồng cảm, mang tính xây dựng cao và tuyệt đối không phán xét.\n"
        )

    return f"""Bạn là NutriSnap Assistant – Huấn luyện viên dinh dưỡng ảo (Constructive Nutrition Coach).
Phong cách giao tiếp của bạn: Thân thiện, ấm áp, tích cực, mang tính xây dựng cao và tuyệt đối KHÔNG phán xét hay chỉ trích người dùng dù họ ăn vượt calo mục tiêu.

HỒ SƠ NGƯỜI DÙNG HIỆN TẠI (Authenticated Context):
- Người dùng: {profile.username}
- Giới tính: {profile.gender}, Tuổi: {profile.age}
- Chiều cao: {profile.height_cm} cm, Cân nặng hiện tại: {profile.current_weight_kg} kg
- Mục tiêu cá nhân: {goal_vn} (Cân nặng mục tiêu: {profile.target_weight_kg} kg)
- TDEE ước tính: {profile.tdee_calories:.0f} kcal/ngày
- Hạn mức Calo mục tiêu: {profile.target_calories:.0f} kcal/ngày
- Hạn mức Macro: Protein {profile.target_protein_g:.0f}g | Carbs {profile.target_carbs_g:.0f}g | Fat {profile.target_fat_g:.0f}g
- Ngân sách ăn uống khuyến nghị: {profile.daily_budget_vnd:,} VNĐ/ngày{patterns_section}

CÁC NGUYÊN TẮC BẮT BUỘC (STRICT POLICIES):
1. BẢO MẬT ZERO-TRUST:
   - user_id được khoá cứng ở tầng hệ thống ({profile.user_id}). Tuyệt đối không sinh mã, tự truyền hay thay đổi user_id của bất kỳ ai.

2. ZERO-HALLUCINATION MATH (KHÔNG BỊA ĐẶT SỐ LIỆU):
   - Mọi con số về Calo, Đạm (Protein), Đường bột (Carbs), Chất béo (Fat), Giá tiền BẮT BUỘC PHẢI trích xuất 100% từ kết quả trả về của 4 công cụ backend:
     * `get_daily_nutrition`: Tra cứu dinh dưỡng trong ngày.
     * `log_meal`: Ghi nhận bữa ăn (mặc định is_confirmed=False cho bản xem trước Action Card).
     * `recommend_meals`: Gợi ý món ăn từ food_references theo calo và ngân sách.
     * `get_progress_summary`: Tổng hợp tiến độ cân nặng EMA và số ngày streak.
   - Tuyệt đối KHÔNG tự nhẩm tính hay bịa số liệu dinh dưỡng.

3. CLARIFICATION HANDLING (CƠ CHẾ HỎI LẠI KHI CHƯA RÕ):
   - Nếu người dùng muốn ghi nhận bữa ăn hoặc hỏi món ăn nhưng thông tin quá mơ hồ:
     * Ví dụ: "Tôi vừa ăn tối xong", "mới ăn trưa", "ghi bữa ăn" (chưa rõ món gì).
     * Hoặc chỉ nói chung chung: "ăn phở", "ăn cơm", "ăn bún" (chưa rõ loại phở bò/gà, cơm gì, và khẩu phần bao nhiêu).
     * Hoặc khối lượng phi lý (<= 0g hoặc > 3000g).
   - TUYỆT ĐỐI KHÔNG gọi `log_meal` với dữ liệu suy đoán!
   - Hãy lịch sự và ân cần hỏi lại để người dùng làm rõ món ăn cụ thể và ước lượng khẩu phần (ví dụ: "Bạn vừa ăn phở bò hay phở gà, khoảng 1 tô vừa (~400g) hay tô lớn nhỉ?").

4. TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM:
   - Luôn ghi nhớ số liệu dinh dưỡng mang tính ước tính tham khảo, không thay thế chẩn đoán y khoa.
"""


# ==============================================================================
# 3. CƠ CHẾ PHÁT HIỆN YÊU CẦU CẦN HỎI LẠI (CLARIFICATION ENGINE)
# ==============================================================================


def check_clarification_needed(
    message: str,
    tool_name: str | None = None,
    tool_args: dict[str, Any] | None = None,
) -> tuple[bool, str | None]:
    """Kiểm tra xem yêu cầu ghi nhận món ăn hoặc hội thoại có quá mơ hồ cần hỏi lại hay không.

    Trả về:
        (True, clarification_question): Cần hỏi lại người dùng, không được tự ý gọi log_meal.
        (False, None): Thông tin đã đầy đủ hoặc không thuộc diện cần làm rõ.
    """
    clean_msg = message.strip().lower()
    args = tool_args or {}

    # Ưu tiên 1: Tham số gọi tool log_meal bất hợp lý hoặc thiếu món
    if tool_name == "log_meal":
        items = args.get("items") or args.get("items_list") or []
        if not items:
            return True, "Bạn vui lòng cho mình biết bạn đã ăn món gì và khẩu phần ước tính khoảng bao nhiêu nhé!"

        for it in items:
            name = (it.get("food_name") or it.get("name") or "").strip().lower()

            gram = None
            for g_key in ["estimated_gram", "estimated_grams", "grams", "gram"]:
                if it.get(g_key) is not None:
                    gram = it.get(g_key)
                    break

            # Tên món quá ngắn hoặc rỗng
            if len(name) < 2:
                return True, "Tên món ăn chưa rõ ràng. Bạn có thể chia sẻ cụ thể tên món bạn vừa ăn không?"

            # Món chỉ là chữ chung chung
            if name in ["phở", "pho"]:
                return True, "Bạn vừa ăn phở bò hay phở gà, khoảng 1 tô vừa (~400g) hay tô lớn nhỉ?"
            if name in ["cơm", "com"]:
                return True, "Bạn vừa ăn cơm với món gì (ví dụ: cơm tấm sườn, cơm trắng...) và khẩu phần thế nào?"
            if name in ["bún", "bun"]:
                return True, "Bạn vừa ăn bún gì (ví dụ: bún bò Huế, bún chả, bún riêu...) nhỉ?"

            # Khối lượng phi lý
            if gram is not None:
                try:
                    f_gram = float(gram)
                    if f_gram <= 0:
                        return True, f"Khối lượng món {name} phải lớn hơn 0g. Bạn có thể ước lượng lại số gam không?"
                    if f_gram > 3000:
                        return True, (
                            f"Khối lượng {f_gram}g cho món {name} có vẻ hơi lớn cho một khẩu phần thông thường. "
                            "Bạn kiểm tra lại giúp mình nhé!"
                        )
                except (ValueError, TypeError):
                    return True, f"Khẩu phần của món {name} chưa hợp lệ. Bạn ước tính khoảng bao nhiêu gram?"

    # Trường hợp 2: Người dùng chỉ thông báo đã ăn xong một bữa mà không nêu món
    vague_meal_patterns = [
        r"^(tôi|mình|em|anh)?\s*(vừa|mới|đã)?\s*(ăn\s*(sáng|trưa|tối|bữa\s*sáng|bữa\s*trưa|bữa\s*tối|phụ|xong))\s*(rồi|xong|nha|nhé|ạ)?$",
        r"^(vừa|mới|đã)?\s*ăn\s*(xong|rồi)\s*(bữa\s*(sáng|trưa|tối))?$",
        r"^(ghi|lưu|note)\s*(giúp|cho)?\s*(tôi|mình|em)?\s*(bữa|món)?\s*(ăn|sáng|trưa|tối)?\s*(nha|nhé|ạ)?$",
    ]
    for pat in vague_meal_patterns:
        if re.search(pat, clean_msg):
            return True, (
                "Bữa ăn vừa rồi của bạn gồm những món gì và khẩu phần ước tính khoảng bao nhiêu "
                "(ví dụ: 1 tô, 1 đĩa, hoặc số gam) để mình giúp bạn ghi nhận chính xác nhé!"
            )

    # Trường hợp 3: Nêu tên món nhưng còn quá chung chung, thiếu loại cụ thể hoặc khẩu phần
    if any(k in clean_msg for k in ["ghi", "lưu", "ăn", "note"]):
        # Phở chung chung
        if re.search(r"\bphở\b", clean_msg) and not any(
            sub in clean_msg for sub in ["bò", "gà", "tái", "nạm", "gầu", "sốt vang", "xào", "cuốn"]
        ):
            return True, "Bạn vừa ăn phở bò hay phở gà, khoảng 1 tô vừa (~400g) hay tô lớn nhỉ?"

        # Cơm chung chung
        if re.search(r"\b(cơm)\b", clean_msg) and not any(
            sub in clean_msg for sub in ["tấm", "sườn", "gà", "rang", "chiên", "trắng", "cháy", "lam"]
        ):
            return True, (
                "Bạn vừa ăn cơm với món gì (ví dụ: cơm tấm sườn nướng, cơm gà, cơm trắng...) "
                "và khẩu phần khoảng bao nhiêu để mình tính toán chính xác nhé?"
            )

        # Bún chung chung
        if re.search(r"\b(bún)\b", clean_msg) and not any(
            sub in clean_msg for sub in ["bò", "chả", "riêu", "thịt nướng", "mắm", "đậu", "mọc", "thang"]
        ):
            return True, (
                "Bạn vừa ăn bún gì nhỉ (ví dụ: bún bò Huế, bún chả, bún riêu cua...) "
                "và khẩu phần khoảng 1 tô vừa (~400g) hay tô lớn?"
            )

    return False, None


# ==============================================================================
# 4. TỔNG HỢP PHẢN HỒI TẤT ĐỊNH ZERO-HALLUCINATION (OUTPUT SYNTHESIS)
# ==============================================================================


def synthesize_tool_output(
    tool_name: str,
    tool_result: dict[str, Any],
    profile: UserProfileContext,
) -> str:
    """Tổng hợp câu trả lời của Huấn luyện viên dinh dưỡng dựa trên 100% số liệu thực tế từ DB.

    Đảm bảo ngôn từ tích cực, khích lệ, chuyên nghiệp và có số liệu chính xác.
    """
    if tool_name == "get_daily_nutrition":
        consumed_cal = float(tool_result.get("consumed_calories", 0.0))
        target_cal = float(tool_result.get("target_calories", profile.target_calories))
        remaining_cal = float(tool_result.get("remaining_calories", target_cal - consumed_cal))
        percent = float(tool_result.get("calories_progress_percent", 0.0))
        macros = tool_result.get("macros", {})
        meals_count = int(tool_result.get("meals_count", 0))

        p_consumed = macros.get("protein", {}).get("consumed_g", 0.0)
        c_consumed = macros.get("carbs", {}).get("consumed_g", 0.0)
        f_consumed = macros.get("fat", {}).get("consumed_g", 0.0)

        # Lời nhận xét mang tính xây dựng (Constructive Coach)
        if remaining_cal > 300:
            coach_comment = (
                f"Bạn đang duy trì tiến độ rất tốt! Bạn còn khoảng **{remaining_cal:.0f} kcal** cho các bữa ăn tiếp theo. "
                "Hãy ưu tiên chọn món giàu đạm và rau xanh nhé!"
            )
        elif 0 <= remaining_cal <= 300:
            coach_comment = (
                f"Hôm nay bạn đã nạp gần đủ mức năng lượng mục tiêu ({percent:.0f}%). "
                "Nếu đói vào buổi tối, bạn có thể chọn một món nhẹ như sữa chua không đường hoặc trái cây ít ngọt."
            )
        else:
            over_cal = abs(remaining_cal)
            coach_comment = (
                f"Hôm nay bạn đã nạp vượt mức mục tiêu khoảng **{over_cal:.0f} kcal**. "
                "Đừng lo lắng hay tự trách mình nhé! Dinh dưỡng là hành trình dài hạn, ngày mai chúng ta chỉ cần "
                "điều chỉnh nhẹ nhàng các bữa ăn và vận động thêm là hoàn toàn cân bằng lại được."
            )

        return (
            f"Chào {profile.username}! Dưới đây là tình hình dinh dưỡng trong ngày của bạn:\n\n"
            f"- **Năng lượng đã nạp:** {consumed_cal:.0f} / {target_cal:.0f} kcal ({percent:.1f}% mục tiêu)\n"
            f"- **Số bữa ăn đã ghi:** {meals_count} bữa\n"
            f"- **Chi tiết Macros:** Protein: {p_consumed:.1f}g | Carbs: {c_consumed:.1f}g | Fat: {f_consumed:.1f}g\n\n"
            f"{coach_comment}"
        )

    if tool_name == "log_meal":
        requires_confirm = tool_result.get("requires_confirmation", False)
        nutri = tool_result.get("nutrition", {})
        total_cal = nutri.get("total_calories", 0.0)
        items = nutri.get("items", [])
        m_type = tool_result.get("meal_type", "Bữa ăn")

        dish_lines = []
        for it in items:
            f_name = it.get("food_name", "Món ăn")
            f_gram = it.get("effective_gram", it.get("estimated_gram", 0.0))
            f_cal = it.get("calories", 0.0)
            dish_lines.append(f"  • **{f_name}**: {f_gram:.0f}g (~{f_cal:.0f} kcal)")

        dish_summary = "\n".join(dish_lines) if dish_lines else "  • Món ăn ghi nhận"

        if requires_confirm:
            return (
                f"Mình đã ước tính xong dinh dưỡng cho **{m_type}** của bạn:\n\n"
                f"{dish_summary}\n\n"
                f"👉 **Tổng năng lượng:** ~**{total_cal:.0f} kcal**\n\n"
                "Bạn vui lòng kiểm tra lại khẩu phần trên Thẻ xác nhận phía dưới. "
                "Nếu đã đúng ý bạn, hãy bấm **[Xác nhận lưu]** để mình ghi vào nhật ký nhé!"
            )
        else:
            return (
                f"Tuyệt vời! Bữa **{m_type}** của bạn đã được ghi nhận thành công vào CSDL với tổng năng lượng "
                f"**{total_cal:.0f} kcal**.\n\n"
                f"{dish_summary}\n\n"
                "Thanh tiến độ dinh dưỡng hôm nay của bạn đã được cập nhật!"
            )

    if tool_name == "recommend_meals":
        recs = tool_result.get("recommendations", [])
        rem_cal = float(tool_result.get("remaining_calories", profile.target_calories))
        budget = int(tool_result.get("budget_vnd", profile.daily_budget_vnd))
        gentle_note = tool_result.get("gentle_note")

        pattern_note = ""
        if profile.behavioral_patterns:
            p_codes = [p.get("pattern_code") for p in profile.behavioral_patterns]
            if "low_protein" in p_codes:
                pattern_note = "\n\n*💡 Gợi ý bù trừ đạm (Smart Compensation): Hệ thống nhận thấy bạn có xu hướng thiếu đạm gần đây. Hãy ưu tiên các món giàu protein như ức gà, cá, đậu hũ hoặc trứng để bảo vệ cơ bắp nhé!*"
            elif "skipping_breakfast" in p_codes:
                pattern_note = "\n\n*💡 Nhắn nhủ nhẹ nhàng: Bạn hay bỏ bữa sáng vài ngày gần đây. Một bữa ăn đủ chất sẽ giúp bạn duy trì năng lượng bền bỉ suốt ngày!*"
            elif "late_night_eating" in p_codes:
                pattern_note = "\n\n*💡 Gợi ý ăn tối nhẹ nhàng: Hệ thống nhận thấy bạn có thói quen ăn sau 21:00. Bạn nên chọn các món thanh nhẹ, ít dầu mỡ để ngủ ngon hơn.*"

        if not recs:
            return (
                f"Dựa trên hạn mức còn lại ({rem_cal:.0f} kcal) và ngân sách ({budget:,} VNĐ), "
                "mình chưa tìm thấy món ăn hoàn toàn khớp trong CSDL. "
                "Bạn có thể nạp các món thanh đạm như canh rau củ thịt bằm, ức gà áp chảo hoặc trứng luộc nhé!"
                f"{pattern_note}"
            )

        lines = []
        for idx, r in enumerate(recs, 1):
            name = r.get("food_name", "Món ăn")
            gram = r.get("suggested_gram", 250.0)
            cal = r.get("estimated_calories", 0.0)
            p = r.get("protein_g", 0.0)
            price = r.get("avg_price_vnd", 0)
            lines.append(
                f"{idx}. **{name}** ({gram:.0f}g) – ~{cal:.0f} kcal | Protein: {p:.1f}g | Giá: ~{price:,} VNĐ"
            )

        recs_text = "\n".join(lines)
        note_text = f"\n\n*Lưu ý: {gentle_note}*" if gentle_note else ""

        return (
            f"Dưới đây là một số gợi ý món ăn phù hợp với hạn mức năng lượng (~{rem_cal:.0f} kcal) "
            f"và ngân sách ({budget:,} VNĐ) của bạn:\n\n"
            f"{recs_text}{note_text}{pattern_note}\n\n"
            "Bạn thích món nào nhất? Sau khi ăn xong hãy nhắn để mình giúp bạn ghi nhận nhé!"
        )

    if tool_name == "get_progress_summary":
        days = tool_result.get("days_range", 7)
        streak = tool_result.get("logged_days_count", 0)
        total_meals = tool_result.get("total_meals_logged", 0)
        avg_cal = float(tool_result.get("avg_daily_calories", 0.0))
        start_w = tool_result.get("start_weight_kg")
        latest_w = tool_result.get("latest_weight_kg")
        change_w = float(tool_result.get("weight_change_kg", 0.0))
        ema_w = tool_result.get("latest_ema_weight_kg")

        weight_msg = ""
        if latest_w is not None:
            sign = "+" if change_w > 0 else ""
            start_str = f" từ {start_w:.1f} kg" if start_w is not None else ""
            ema_str = f" (Cân nặng làm mịn xu hướng EMA: **{ema_w:.2f} kg**)" if ema_w else ""
            weight_msg = (
                f"- **Cân nặng:** Hiện tại **{latest_w:.1f} kg**{start_str} (Thay đổi: {sign}{change_w:.2f} kg so với đầu kỳ)"
                f"{ema_str}\n"
            )

        coach_encouragement = (
            f"Bạn đã duy trì ghi chép **{streak}/{days} ngày** với tổng cộng **{total_meals} bữa ăn**! "
            "Sự kiên trì chính là chìa khóa quan trọng nhất để đạt được mục tiêu sức khỏe bền vững."
        )

        return (
            f"Tổng hợp tiến độ dinh dưỡng {days} ngày gần nhất của {profile.username}:\n\n"
            f"- **Chuỗi ngày ghi chép:** {streak} ngày ({total_meals} bữa ăn)\n"
            f"- **Calo trung bình mỗi ngày:** ~{avg_cal:.0f} kcal\n"
            f"{weight_msg}\n"
            f"{coach_encouragement}"
        )

    return "Mình đã xử lý thông tin từ hệ thống thành công!"


# ==============================================================================
# 5. LỚP ĐIỀU PHỐI AI ORCHESTRATOR CHÍNH (MAIN ORCHESTRATOR CLASS)
# ==============================================================================


class AIOrchestrator:
    """Lớp điều phối trung tâm kết nối LLM, Context Injection, Zero-Trust Tool Calling,

    và cơ chế kiểm soát ảo giác (Zero-Hallucination).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gemini-1.5-flash",
        use_mock_fallback: bool = True,
    ) -> None:
        self.api_key = (api_key or os.getenv("GEMINI_API_KEY", "")).strip()
        self.model_name = model_name
        self.use_mock_fallback = use_mock_fallback
        self._gemini_model: Any = None

    def _is_api_key_valid(self) -> bool:
        """Kiểm tra API Key có tồn tại và không phải placeholder."""
        if not self.api_key:
            return False
        placeholders = {
            "YOUR_GEMINI_API_KEY_HERE",
            "your_actual_api_key_here",
            "your_gemini_api_key_here",
            "change-me",
        }
        return self.api_key not in placeholders

    def _init_gemini_model(self, system_instruction: str) -> Any:
        """Khởi tạo GenerativeModel của Google GenAI / Generative AI kèm 4 Tools."""
        if not self._is_api_key_valid():
            return None

        # 1. Thử dùng Google GenAI SDK mới (google-genai)
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            tools = get_gemini_tool_declarations()

            class GenAIModelWrapper:
                def __init__(self, client, model_name, sys_instruction, tools):
                    self.client = client
                    self.model_name = model_name
                    self.sys_instruction = sys_instruction
                    self.tools = tools

                def start_chat(self, enable_automatic_function_calling: bool = False):
                    return self.client.chats.create(
                        model=self.model_name,
                        config=types.GenerateContentConfig(
                            system_instruction=self.sys_instruction,
                            tools=self.tools,
                            temperature=0.2,
                        ),
                    )

            return GenAIModelWrapper(client, self.model_name, system_instruction, tools)
        except Exception:
            pass

        # 2. Fallback sang google.generativeai nếu cần
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.api_key)
            tools = get_gemini_tool_declarations()

            model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=system_instruction,
                tools=tools,  # type: ignore
                generation_config={"temperature": 0.2},
            )
            return model
        except Exception as exc:
            logger.warning(f"Không thể khởi tạo Gemini GenerativeModel: {exc}. Chuyển sang Fallback.")
            return None

    def get_user_context(
        self,
        session: Session,
        user_id: int,
        include_patterns: bool = True,
        days_range: int = 14,
    ) -> UserProfileContext:
        """Nạp ngữ cảnh hồ sơ người dùng từ CSDL kèm phân tích mẫu hành vi 7-14 ngày."""
        return fetch_user_profile_context(
            session=session,
            user_id=user_id,
            include_patterns=include_patterns,
            days_range=days_range,
        )

    def process_message(
        self,
        session: Session,
        user_id: int,
        message: str,
        explicit_tool_call: Optional[dict[str, Any]] = None,
        chat_history: Optional[list[dict[str, str]]] = None,
        voice_transcript: Optional[str] = None,
    ) -> OrchestratorResponse:
        """Hàm xử lý chính (Main Entrypoint) của AI Orchestrator:

        1. Nạp ngữ cảnh hồ sơ người dùng (User Profile Context Injection).
        2. Kiểm tra yêu cầu mơ hồ cần hỏi lại (Clarification Handling).
        3. Nếu explicit_tool_call được gửi kèm, ưu tiên thực thi an toàn.
        4. Thử gọi LLM Gemini với Tool Calling; nếu không khả dụng/lỗi, chuyển sang Fallback Engine.
        5. Lấy số liệu thật từ DB và tổng hợp phản hồi Constructive Nutrition Coach.
        """
        # 1. Nạp ngữ cảnh hồ sơ người dùng
        profile = self.get_user_context(session=session, user_id=user_id)
        sys_instruction = build_system_instruction(profile)

        # 2. Xử lý Explicit Tool Call nếu có (ví dụ: Frontend gửi trực tiếp lệnh gọi tool)
        if explicit_tool_call:
            t_name = explicit_tool_call.get("tool_name") or explicit_tool_call.get("name")
            t_args = explicit_tool_call.get("tool_args") or explicit_tool_call.get("args") or {}

            if t_name:
                needs_clarify, clarify_msg = check_clarification_needed(
                    message=message,
                    tool_name=str(t_name),
                    tool_args=t_args,
                )
                if needs_clarify and clarify_msg:
                    return OrchestratorResponse(
                        reply=clarify_msg,
                        reply_text=clarify_msg,
                        clarification_needed=True,
                    )

                result = dispatch_tool_call(
                    session=session,
                    authenticated_user_id=user_id,
                    tool_name=str(t_name),
                    tool_args=t_args,
                )

                reply = synthesize_tool_output(str(t_name), result, profile)
                requires_confirm = result.get("requires_confirmation", False)
                action_card = result.get("action_card")

                return OrchestratorResponse(
                    reply=reply,
                    reply_text=reply,
                    tool_called=str(t_name),
                    tool_args=t_args,
                    tool_result=result,
                    pending_confirmation=requires_confirm,
                    action_card=action_card,
                    is_fallback=False,
                )

        # 3. Kiểm tra cơ chế hỏi lại khi thông tin mơ hồ (Clarification Handling)
        needs_clarify, clarify_msg = check_clarification_needed(message=message)
        if needs_clarify and clarify_msg:
            return OrchestratorResponse(
                reply=clarify_msg,
                reply_text=clarify_msg,
                clarification_needed=True,
                is_fallback=False,
            )

        # 4. Thử điều phối qua Gemini API thực tế nếu có cấu hình
        if self._is_api_key_valid():
            try:
                gemini_resp = self._run_gemini_pipeline(
                    session=session,
                    user_id=user_id,
                    message=message,
                    profile=profile,
                    sys_instruction=sys_instruction,
                    chat_history=chat_history,
                )
                if gemini_resp is not None:
                    return gemini_resp
            except Exception as exc:
                logger.warning(f"Lỗi khi gọi Gemini Pipeline: {exc}. Chuyển sang Fallback.")
                if not self.use_mock_fallback:
                    raise

        # 5. Chạy qua Fallback NLU Engine (Deterministic, Zero-Crash)
        return self._run_deterministic_fallback(
            session=session,
            user_id=user_id,
            message=message,
            profile=profile,
            voice_transcript=voice_transcript,
        )

    def _run_gemini_pipeline(
        self,
        session: Session,
        user_id: int,
        message: str,
        profile: UserProfileContext,
        sys_instruction: str,
        chat_history: Optional[list[dict[str, str]]] = None,
    ) -> Optional[OrchestratorResponse]:
        """Thực thi luồng Tool Calling với Google Generative AI SDK."""
        model = self._init_gemini_model(sys_instruction)
        if model is None:
            return None

        # Khởi tạo phiên chat với lịch sử nếu có
        chat = model.start_chat(enable_automatic_function_calling=False)

        # Gửi tin nhắn của người dùng
        response = chat.send_message(message)

        # Kiểm tra xem LLM có gọi Function Call nào không
        candidate = response.candidates[0] if response.candidates else None
        if not candidate:
            return None

        # Trích xuất function call nếu có
        function_calls = []
        for part in candidate.content.parts:
            fn = getattr(part, "function_call", None)
            if fn:
                function_calls.append(fn)

        if not function_calls:
            raw_reply = response.text or ""
            return OrchestratorResponse(
                reply=raw_reply,
                reply_text=raw_reply,
                is_fallback=False,
            )

        # Xử lý function call đầu tiên
        first_call = function_calls[0]
        fn_name = first_call.name
        fn_args = dict(first_call.args) if hasattr(first_call, "args") else {}

        # Kiểm tra lại Clarification trước khi gọi Backend
        needs_clarify, clarify_msg = check_clarification_needed(
            message=message,
            tool_name=fn_name,
            tool_args=fn_args,
        )
        if needs_clarify and clarify_msg:
            return OrchestratorResponse(
                reply=clarify_msg,
                reply_text=clarify_msg,
                clarification_needed=True,
            )

        # Thực thi công cụ với user_id khoá cứng (Zero-Trust)
        tool_result = dispatch_tool_call(
            session=session,
            authenticated_user_id=user_id,
            tool_name=fn_name,
            tool_args=fn_args,
        )

        # Tổng hợp số liệu thật 100% từ DB (Zero Hallucination)
        synthesized_reply = synthesize_tool_output(fn_name, tool_result, profile)
        requires_confirm = tool_result.get("requires_confirmation", False)
        action_card = tool_result.get("action_card")

        return OrchestratorResponse(
            reply=synthesized_reply,
            reply_text=synthesized_reply,
            tool_called=fn_name,
            tool_args=fn_args,
            tool_result=tool_result,
            pending_confirmation=requires_confirm,
            action_card=action_card,
            is_fallback=False,
        )

    def _run_deterministic_fallback(
        self,
        session: Session,
        user_id: int,
        message: str,
        profile: UserProfileContext,
        voice_transcript: Optional[str] = None,
    ) -> OrchestratorResponse:
        """Động cơ NLU dự phòng tất định (Deterministic Fallback Engine):

        - Nhận diện ý định hội thoại chuẩn xác.
        - Gọi 4 công cụ backend với dữ liệu thực từ CSDL.
        - Đảm bảo Zero-Crash và phản hồi mang phong cách Constructive Nutrition Coach.
        """
        intent = classify_user_intent(message)
        msg_lower = message.lower()

        # Ý định 1: Tra cứu dinh dưỡng hôm nay / get_daily_nutrition
        if intent == "get_daily_nutrition":
            target_date = "today"
            if "hôm qua" in msg_lower or "hom qua" in msg_lower or "yesterday" in msg_lower:
                target_date = "yesterday"
            else:
                m_date = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", msg_lower)
                if m_date:
                    target_date = m_date.group(1)

            result = exec_get_daily_nutrition(
                session=session,
                authenticated_user_id=user_id,
                date_str=target_date,
            )
            reply = synthesize_tool_output("get_daily_nutrition", result, profile)
            return OrchestratorResponse(
                reply=reply,
                reply_text=reply,
                tool_called="get_daily_nutrition",
                tool_args={"date_str": target_date},
                tool_result=result,
                is_fallback=True,
            )

        # Ý định 2: Gợi ý món ăn / recommend_meals
        if intent == "recommend_meals":
            # Trích xuất ngân sách nếu người dùng nêu (ví dụ: 50.000đ, 80.000 VNĐ, 50k, 60000)
            budget: Optional[int] = None
            b_dot_match = re.search(r"(\d{1,3}(?:[.,]\d{3})+)\s*(?:đ|vnd|vnđ)?", msg_lower)
            if b_dot_match:
                budget = int(re.sub(r"[.,]", "", b_dot_match.group(1)))
            else:
                budget_match = re.search(r"(\d+)\s*(k|nghìn|ngàn|vnd|vnđ|đ)", msg_lower)
                if budget_match:
                    val = int(budget_match.group(1))
                    budget = val * 1000 if budget_match.group(2) in ("k", "nghìn", "ngàn") else val

            # Trích xuất hạn mức calo còn lại nếu có
            rem_cal: Optional[float] = None
            cal_match = re.search(r"(\d+)\s*(?:calo|kcal|calorie)", msg_lower)
            if cal_match:
                rem_cal = float(cal_match.group(1))

            result = exec_recommend_meals(
                session=session,
                authenticated_user_id=user_id,
                remaining_calories=rem_cal,
                budget_vnd=budget,
            )
            reply = synthesize_tool_output("recommend_meals", result, profile)
            return OrchestratorResponse(
                reply=reply,
                reply_text=reply,
                tool_called="recommend_meals",
                tool_args={"remaining_calories": rem_cal, "budget_vnd": budget},
                tool_result=result,
                is_fallback=True,
            )

        # Ý định 3: Tổng hợp tiến độ / get_progress_summary
        if intent == "get_progress_summary":
            days_range = 7
            if any(k in msg_lower for k in ("30 ngày", "30 ngay", "tháng", "thang")):
                days_range = 30
            elif any(k in msg_lower for k in ("14 ngày", "14 ngay", "2 tuần", "2 tuan")):
                days_range = 14
            else:
                days_match = re.search(r"(\d+)\s*(?:ngày|ngay)", msg_lower)
                if days_match:
                    days_range = int(days_match.group(1))

            result = exec_get_progress_summary(
                session=session,
                authenticated_user_id=user_id,
                days_range=days_range,
            )
            reply = synthesize_tool_output("get_progress_summary", result, profile)
            return OrchestratorResponse(
                reply=reply,
                reply_text=reply,
                tool_called="get_progress_summary",
                tool_args={"days_range": days_range},
                tool_result=result,
                is_fallback=True,
            )

        # Ý định 4: Ghi nhận bữa ăn cụ thể / log_meal
        if intent == "log_meal":
            dish_name = "Cơm tấm sườn nướng"
            dish_gram = 300.0
            meal_type = "lunch"

            if "phở bò" in msg_lower or "pho bo" in msg_lower:
                dish_name = "Phở bò tái"
                dish_gram = 400.0
            elif "phở gà" in msg_lower or "pho ga" in msg_lower:
                dish_name = "Phở gà"
                dish_gram = 400.0
            elif "phở" in msg_lower or "pho" in msg_lower:
                dish_name = "Phở bò tái"
                dish_gram = 400.0
            elif "bún chả" in msg_lower or "bun cha" in msg_lower:
                dish_name = "Bún chả"
                dish_gram = 350.0
            elif "bún bò" in msg_lower or "bun bo" in msg_lower:
                dish_name = "Bún bò Huế"
                dish_gram = 450.0
            elif "bún" in msg_lower or "bun" in msg_lower:
                dish_name = "Bún bò Huế"
                dish_gram = 450.0
            elif "cơm tấm" in msg_lower or "com tam" in msg_lower or "cơm sườn" in msg_lower or "com suon" in msg_lower:
                dish_name = "Cơm tấm sườn nướng"
                dish_gram = 300.0
            elif "bánh mì" in msg_lower or "banh mi" in msg_lower:
                dish_name = "Bánh mì trứng ốp la"
                dish_gram = 150.0
            elif "ức gà" in msg_lower or "uc ga" in msg_lower:
                dish_name = "Ức gà áp chảo"
                dish_gram = 200.0
            elif "sữa" in msg_lower or "sua" in msg_lower:
                dish_name = "Sữa tươi không đường"
                dish_gram = 200.0
            elif "trứng" in msg_lower or "trung" in msg_lower:
                dish_name = "Trứng gà ốp la (1 quả)"
                dish_gram = 60.0

            if any(k in msg_lower for k in ("sáng", "sang")):
                meal_type = "breakfast"
            elif any(k in msg_lower for k in ("tối", "toi")):
                meal_type = "dinner"
            elif any(k in msg_lower for k in ("phụ", "phu", "vặt", "vat")):
                meal_type = "snack"

            gram_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:g|gram|gam|ml)", msg_lower)
            if gram_match:
                dish_gram = float(gram_match.group(1))

            from src.ai.voice_modifier import parse_voice_modifier

            # Xử lý ghi chú giọng nói bổ sung nếu có (dầu ăn, nước sốt ẩn, ăn thừa)
            v_transcript = voice_transcript if voice_transcript else message
            has_mod_clues = any(
                w in v_transcript.lower()
                for w in ["dầu", "sốt", "bơ", "mỡ hành", "nửa", "bỏ lại", "chừa", "thìa", "muỗng", "áp chảo", "không húp"]
            )

            applied_mods: list[str] = []
            vm_dict: Optional[dict[str, Any]] = None
            if has_mod_clues or voice_transcript:
                vm_res = parse_voice_modifier(
                    dishes=[{"dish_name": dish_name, "estimated_weight_gram": dish_gram}],
                    transcript=v_transcript,
                )
                items_list = vm_res.to_meal_items()
                applied_mods = vm_res.applied_modifications
                vm_dict = vm_res.model_dump()
            else:
                items_list = [{"food_name": dish_name, "estimated_gram": dish_gram}]

            tool_args = {
                "meal_type": meal_type,
                "items": items_list,
                "is_confirmed": False,
            }

            result = exec_log_meal(
                session=session,
                authenticated_user_id=user_id,
                meal_type=meal_type,
                items_list=items_list,
                is_confirmed=False,
            )
            reply = synthesize_tool_output("log_meal", result, profile)

            if applied_mods:
                reply += "\n\n*📝 Ghi chú khẩu phần đã áp dụng: " + "; ".join(applied_mods) + "*"

            return OrchestratorResponse(
                reply=reply,
                reply_text=reply,
                tool_called="log_meal",
                tool_args=tool_args,
                tool_result=result,
                pending_confirmation=True,
                action_card=result.get("action_card"),
                is_fallback=True,
                voice_modifier_result=vm_dict,
                applied_modifications=applied_mods,
            )

        # Ý định 5: Tư vấn thói quen & lời khuyên cá nhân hóa (Behavioral Insights)
        if any(
            k in msg_lower
            for k in [
                "lời khuyên",
                "thói quen",
                "tư vấn",
                "hành vi",
                "nhận xét",
                "ăn uống ra sao",
                "gần đây thế nào",
                "bù trừ",
                "compensation",
                "pattern",
            ]
        ):
            if profile.behavioral_patterns:
                lines = [
                    f"Chào {profile.username}! Dựa trên phân tích nhật ký ăn uống gần đây từ CSDL, mình có vài quan sát và lời khuyên mang tính xây dựng dành cho bạn:\n"
                ]
                for p in profile.behavioral_patterns:
                    lines.append(f"• **{p.get('title')}**: {p.get('recommendation')}")
                lines.append(
                    "\nBạn muốn tìm kiếm thực đơn phù hợp hay kiểm tra calo hôm nay không?"
                )
                habit_reply = "\n".join(lines)
                return OrchestratorResponse(
                    reply=habit_reply,
                    reply_text=habit_reply,
                    is_fallback=True,
                )

        # Chào hỏi hoặc hội thoại mở thông thường
        greetings_reply = (
            f"Chào {profile.username}! Mình là NutriSnap Coach – Trợ lý dinh dưỡng cá nhân của bạn. "
            f"Hôm nay bạn muốn kiểm tra dinh dưỡng trong ngày, ghi nhận bữa ăn, tìm gợi ý món ăn ngon hay xem tiến độ cân nặng?"
        )
        if profile.behavioral_patterns:
            top_pattern = profile.behavioral_patterns[0]
            greetings_reply += f"\n\n*(Nhắn nhủ nhẹ nhàng: {top_pattern.get('recommendation')})*"

        return OrchestratorResponse(
            reply=greetings_reply,
            reply_text=greetings_reply,
            is_fallback=True,
        )


# ==============================================================================
# 6. SINGLETON VÀ TIỆN ÍCH TOP-LEVEL (CONVENIENCE ENTRYPOINTS)
# ==============================================================================

_orchestrator_instance: Optional[AIOrchestrator] = None


def get_ai_orchestrator(
    api_key: Optional[str] = None,
    model_name: str = "gemini-1.5-flash",
    use_mock_fallback: bool = True,
) -> AIOrchestrator:
    """Lấy hoặc khởi tạo instance AIOrchestrator chuẩn."""
    global _orchestrator_instance
    if _orchestrator_instance is None or api_key is not None:
        _orchestrator_instance = AIOrchestrator(
            api_key=api_key,
            model_name=model_name,
            use_mock_fallback=use_mock_fallback,
        )
    return _orchestrator_instance


def orchestrate_chat(
    session: Session,
    user_id: int,
    message: str,
    explicit_tool_call: Optional[dict[str, Any]] = None,
    chat_history: Optional[list[dict[str, str]]] = None,
    voice_transcript: Optional[str] = None,
    api_key: Optional[str] = None,
) -> OrchestratorResponse:
    """Hàm tiện ích (Convenience Function) điều phối toàn diện cho Router hoặc API handler:

    - Khởi tạo Orchestrator.
    - Xử lý tin nhắn và điều phối Tool Calling.
    - Hỗ trợ phân tích ghi chú giọng nói voice_transcript.
    - Trả về OrchestratorResponse an toàn, chuẩn xác và không ảo giác.
    """
    orchestrator = get_ai_orchestrator(api_key=api_key)
    return orchestrator.process_message(
        session=session,
        user_id=user_id,
        message=message,
        explicit_tool_call=explicit_tool_call,
        chat_history=chat_history,
        voice_transcript=voice_transcript,
    )