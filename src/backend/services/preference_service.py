"""
src/backend/services/preference_service.py
Bộ câu hỏi khảo sát khi tạo tài khoản (11 câu). AI tổng hợp câu trả lời thành hồ sơ ăn uống
(tóm tắt + danh sách thực phẩm cần tránh), lưu vào bảng user_preferences để Thực đơn và AI Coach dùng.
"""

from __future__ import annotations

import json
import logging
import os
import unicodedata
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import UserPreference, utc_now

logger = logging.getLogger(__name__)

QUESTIONS: dict[str, dict[str, str]] = {
    "age_group": {"A": "Dưới 18 tuổi", "B": "18–24 tuổi", "C": "25–34 tuổi", "D": "Từ 35 tuổi trở lên"},
    "activity": {"A": "Ít vận động", "B": "Vận động nhẹ (1–3 ngày/tuần)", "C": "Vận động vừa phải (3–5 ngày/tuần)", "D": "Vận động nhiều (6–7 ngày/tuần)"},
    "goal": {"A": "Giảm cân", "B": "Duy trì vóc dáng", "C": "Tăng cơ", "D": "Ăn uống lành mạnh hơn"},
    "pace": {"A": "0,25 kg/tuần", "B": "0,50 kg/tuần", "C": "0,75 kg/tuần", "D": "Giữ nguyên cân nặng"},
    "diet": {"A": "Cơm nhà truyền thống", "B": "Eat Clean", "C": "Low-Carb", "D": "Ăn chay / thực vật"},
    "taste": {"A": "Thanh đạm, ít gia vị", "B": "Đậm đà, cay nồng", "C": "Ngọt dịu, hài hòa", "D": "Linh hoạt, dễ ăn"},
    "protein": {"A": "Gia cầm và trứng", "B": "Thịt đỏ", "C": "Thủy hải sản", "D": "Đạm thực vật"},
    "cooking": {"A": "Tự nấu tại nhà", "B": "Ăn hàng quán / cơm văn phòng", "C": "Tự nấu sáng/tối, trưa ăn ngoài", "D": "Mua đồ ăn nhanh ở siêu thị / cửa hàng tiện lợi"},
    "meals": {"A": "3 bữa chính, không ăn vặt", "B": "3 bữa chính + 1–2 bữa phụ", "C": "2 bữa chính (bỏ bữa sáng)", "D": "Chia nhỏ 4–5 bữa"},
}
PROTEIN_GROUPS = {"A": {"ga", "vit", "trung"}, "B": {"heo", "bo"}, "C": {"ca", "hai_san"}, "D": {"dau_hu"}}
MEAT_GROUPS = {"ga", "vit", "heo", "bo", "ca", "hai_san"}
GROUP_WORDS = {
    "hai_san": ("tom", "cua", "muc", "hai san", "ngheu", "so", "oc", "ghe", "hen", "bach tuoc"),
    "ca": ("ca",),
    "bo": ("bo",),
    "heo": ("heo", "lon"),
    "ga": ("ga",),
    "vit": ("vit",),
    "trung": ("trung",),
    "dau_hu": ("dau hu", "dau phu"),
}
NONE_WORDS = ("khong", "khong co", "khong di ung", "khong di ung gi", "an duoc moi thu")


def norm(text: str) -> str:
    t = unicodedata.normalize("NFD", text or "").replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower().strip()


def _rule_extract(allergies: str) -> tuple[list[str], list[str]]:
    """Tách thực phẩm cần tránh khi không gọi được AI: mỗi cụm cách nhau bởi dấu phẩy/“và”."""
    text = norm(allergies)
    if not text or text in NONE_WORDS:
        return [], []
    for w in (" va ", ";", ".", "\n", "/"):
        text = text.replace(w, ",")
    keywords, groups = [], set()
    for part in (p.strip() for p in text.split(",")):
        for lead in ("di ung", "khong an duoc", "khong an", "khong thich", "tranh", "kieng"):
            if part.startswith(lead):
                part = part[len(lead):].strip()
        if not part or part in NONE_WORDS:
            continue
        if part in ("do cay", "cay", "an cay"):
            keywords.append("cay")
            continue
        words = " ".join(part.split())
        if words.startswith("thit "):
            words = words[5:]
        known = [t for t in words.split() if any(t in ws for ws in GROUP_WORDS.values())]
        if len(known) > 1:  # "tom cua" → tránh cả "tom" lẫn "cua"
            keywords.extend(known)
        for g, ws in GROUP_WORDS.items():
            if any(words == w or words.startswith(w + " ") or w in known for w in ws):
                groups.add(g)
        keywords.append(words)
    return sorted(set(keywords)), sorted(groups)


AI_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "avoid_keywords": {"type": "ARRAY", "items": {"type": "STRING"}},
        "avoid_groups": {"type": "ARRAY", "items": {"type": "STRING", "enum": sorted(GROUP_WORDS)}},
    },
    "required": ["summary", "avoid_keywords", "avoid_groups"],
}
AI_PROMPT = (
    "Bạn là chuyên gia dinh dưỡng của app NutriSnap. Dưới đây là câu trả lời khảo sát của một người dùng mới.\n"
    "{answers}\n\n"
    "Trả JSON:\n"
    "- summary: 3–5 câu tiếng Việt tóm tắt hồ sơ ăn uống (mục tiêu, chế độ ăn, khẩu vị, nguồn đạm ưu tiên, "
    "thực phẩm phải tránh, cách chuẩn bị bữa, số bữa, ngân sách) và định hướng gợi ý món phù hợp.\n"
    "- avoid_keywords: tên thực phẩm/nguyên liệu phải tránh, viết tiếng Việt KHÔNG DẤU, chữ thường, "
    "dạng xuất hiện trong tên món (ví dụ 'tom', 'cua', 'dau phong', 'hanh la', 'cay'). Rỗng nếu không dị ứng.\n"
    "- avoid_groups: nhóm đạm phải loại hoàn toàn do dị ứng/ăn chay (chỉ chọn trong: {groups})."
)


def _answers_text(p: UserPreference) -> str:
    lines = [f"- {k}: {QUESTIONS[k].get(getattr(p, k) or '', 'chưa trả lời')}" for k in QUESTIONS]
    lines.append(f"- Dị ứng / tránh: {p.allergies or 'Không dị ứng gì'}")
    lines.append(f"- Ngân sách mỗi ngày: {p.daily_budget_vnd or 0:,} đ".replace(",", "."))
    return "\n".join(lines)


def _ai_profile(p: UserPreference) -> dict[str, Any] | None:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key or key.startswith("YOUR_"):
        return None
    try:
        from google import genai
        from google.genai import types

        import time

        # Tổng thời gian tối đa ~15 giây (Gemini yêu cầu timeout ≥ 10 giây) để màn hình khảo sát không bị treo; quá hạn thì dùng tóm tắt theo quy tắc
        client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=12_000, retry_options=types.HttpRetryOptions(attempts=1)))
        deadline = time.monotonic() + 15
        config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=AI_SCHEMA, temperature=0.2)
        for model in ("gemini-3.5-flash-lite", "gemini-flash-latest"):
            if time.monotonic() > deadline:
                break
            try:
                res = client.models.generate_content(
                    model=model, contents=AI_PROMPT.format(answers=_answers_text(p), groups=", ".join(sorted(GROUP_WORDS))), config=config)
                data = json.loads(res.text or "{}")
                if data.get("summary"):
                    return data
            except Exception as exc:  # model bận / hết hạn mức: thử model khác
                logger.info("Tổng hợp hồ sơ bằng %s lỗi: %s", model, exc)
    except Exception as exc:
        logger.info("Không gọi được AI tổng hợp hồ sơ: %s", exc)
    return None


def _rule_summary(p: UserPreference) -> str:
    q = lambda k: QUESTIONS[k].get(getattr(p, k) or "", "").lower()
    parts = [f"Mục tiêu: {q('goal')} ({q('pace')}), {q('activity')}.",
             f"Chế độ ăn {q('diet')}, khẩu vị {q('taste')}, ưu tiên đạm từ {q('protein')}.",
             f"Thường {q('cooking')}, {q('meals')}."]
    if p.allergies and norm(p.allergies) not in NONE_WORDS:
        parts.append(f"Cần tránh: {p.allergies}.")
    if p.daily_budget_vnd:
        parts.append(f"Ngân sách khoảng {p.daily_budget_vnd:,} đ/ngày.".replace(",", "."))
    return " ".join(parts)


def save_preferences(session: Session, user_id: int, answers: dict[str, Any]) -> UserPreference:
    row = session.exec(select(UserPreference).where(UserPreference.user_id == user_id)).first() or UserPreference(user_id=user_id)
    for k in QUESTIONS:
        v = answers.get(k)
        setattr(row, k, v if v in QUESTIONS[k] else None)
    row.allergies = (answers.get("allergies") or "").strip()[:300] or None
    budget = answers.get("daily_budget_vnd")
    row.daily_budget_vnd = int(budget) if isinstance(budget, (int, float)) and 0 <= budget <= 10_000_000 else None

    keywords, groups = _rule_extract(row.allergies or "")
    ai = _ai_profile(row)
    if ai:
        keywords = sorted({norm(k) for k in ai.get("avoid_keywords", []) if norm(k)} | set(keywords))
        groups = sorted({g for g in ai.get("avoid_groups", []) if g in GROUP_WORDS} | set(groups))
        row.summary, row.summary_source = ai["summary"].strip()[:1500], "ai"
    else:
        row.summary, row.summary_source = _rule_summary(row), "rule"
    if row.diet == "D":  # ăn chay: bỏ mọi loại thịt cá
        groups = sorted(set(groups) | MEAT_GROUPS)
    row.avoid_keywords = json.dumps(keywords, ensure_ascii=False)
    row.avoid_groups = json.dumps(groups)
    row.updated_at = utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def refresh_ai_summary(user_id: int) -> None:
    """Chạy nền sau khi lưu: nếu lúc lưu AI bận (đang dùng tóm tắt theo quy tắc) thì thử lại AI."""
    from src.backend.models.database import engine

    with Session(engine) as session:
        row = get_preferences(session, user_id)
        if not row or row.summary_source == "ai":
            return
        ai = _ai_profile(row)
        if not ai:
            return
        keywords = sorted({norm(k) for k in ai.get("avoid_keywords", []) if norm(k)} | set(json.loads(row.avoid_keywords or "[]")))
        groups = sorted({g for g in ai.get("avoid_groups", []) if g in GROUP_WORDS} | set(json.loads(row.avoid_groups or "[]")))
        row.summary, row.summary_source = ai["summary"].strip()[:1500], "ai"
        row.avoid_keywords, row.avoid_groups = json.dumps(keywords, ensure_ascii=False), json.dumps(groups)
        session.add(row)
        session.commit()


def get_preferences(session: Session, user_id: int) -> UserPreference | None:
    return session.exec(select(UserPreference).where(UserPreference.user_id == user_id)).first()


def to_dict(p: UserPreference | None) -> dict[str, Any] | None:
    if p is None:
        return None
    d = {k: getattr(p, k) for k in QUESTIONS}
    d.update(allergies=p.allergies, daily_budget_vnd=p.daily_budget_vnd, summary=p.summary, summary_source=p.summary_source,
             avoid_keywords=json.loads(p.avoid_keywords or "[]"), avoid_groups=json.loads(p.avoid_groups or "[]"),
             updated_at=p.updated_at.isoformat() if p.updated_at else None)
    return d


def planner_rules(p: UserPreference | None) -> dict[str, Any]:
    """Quy tắc cho bộ tạo thực đơn rút ra từ hồ sơ."""
    if p is None:
        return {}
    return {
        "diet": p.diet, "taste": p.taste, "cooking": p.cooking, "meals": p.meals,
        "protein_groups": PROTEIN_GROUPS.get(p.protein or "", set()),
        "avoid_keywords": json.loads(p.avoid_keywords or "[]"),
        "avoid_groups": set(json.loads(p.avoid_groups or "[]")),
        "budget": p.daily_budget_vnd or 0,
    }


# ---------------------------------------------------------------------------
# Phân tích nhu cầu: kết hợp khảo sát ban đầu + mục tiêu cá nhân (trang Mục tiêu)
# ---------------------------------------------------------------------------

ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "headline": {"type": "STRING"},
        "needs": {"type": "ARRAY", "items": {"type": "STRING"}},
        "recommendations": {"type": "ARRAY", "items": {"type": "STRING"}},
        "sample_day": {"type": "ARRAY", "items": {"type": "STRING"}},
        "cautions": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["headline", "needs", "recommendations", "sample_day", "cautions"],
}
ANALYSIS_PROMPT = (
    "Bạn là chuyên gia dinh dưỡng của app NutriSnap. Hãy phân tích nhu cầu của người dùng dựa trên khảo sát ban đầu "
    "và mục tiêu cá nhân họ vừa thiết lập, rồi đưa ra đề xuất cụ thể bằng tiếng Việt.\n\n"
    "KHẢO SÁT BAN ĐẦU:\n{answers}\n\nMỤC TIÊU CÁ NHÂN (số liệu do app tính, giữ nguyên, không tự tính lại):\n{goal}\n\n"
    "Trả JSON:\n"
    "- headline: 1 câu tóm tắt nhu cầu chính.\n"
    "- needs: 3–4 ý về nhu cầu năng lượng/đạm/chất dinh dưỡng, nêu đúng các con số mục tiêu ở trên.\n"
    "- recommendations: 3–5 đề xuất ăn uống phù hợp chế độ ăn, khẩu vị, nguồn đạm ưu tiên, cách chuẩn bị bữa, số bữa và ngân sách CẢ NGÀY.\n"
    "- sample_day: 3–5 dòng gợi ý một ngày ăn mẫu theo đúng số bữa họ chọn, mỗi dòng 'Bữa ...: món ...' bằng món Việt dễ mua/dễ nấu.\n"
    "- cautions: lưu ý an toàn; BẮT BUỘC nhắc thực phẩm phải tránh nếu có dị ứng; không khuyên dưới 1.200 kcal, không chẩn đoán y khoa.\n"
    "Tuyệt đối không gợi ý món chứa thực phẩm người dùng phải tránh."
)
GOAL_VN = {"lose_weight": "Giảm cân", "maintain": "Duy trì", "gain_muscle": "Tăng cơ"}
ACTIVITY_VN = {"sedentary": "ít vận động", "light": "vận động nhẹ", "moderate": "vận động vừa", "active": "vận động nhiều", "very_active": "vận động rất nhiều"}


def _goal_text(goal: Any) -> str:
    return "\n".join([
        f"- Giới tính: {goal.gender}, tuổi {goal.age}, cao {goal.height_cm:.0f} cm, nặng {goal.current_weight_kg:.1f} kg → mục tiêu {goal.target_weight:.1f} kg",
        f"- Mục tiêu: {GOAL_VN.get(goal.goal_type, goal.goal_type)}, tốc độ {goal.weekly_pace_kg} kg/tuần, {ACTIVITY_VN.get(goal.activity_level, goal.activity_level)}",
        f"- Năng lượng: TDEE {goal.tdee_calories:.0f} kcal, mục tiêu {goal.target_calories:.0f} kcal/ngày",
        f"- Đạm {goal.target_protein_g:.0f} g · Tinh bột {goal.target_carbs_g:.0f} g · Chất béo {goal.target_fat_g:.0f} g mỗi ngày",
        f"- Ngân sách cả ngày: {goal.daily_budget_vnd:,} đ".replace(",", "."),
    ])


def _rule_analysis(p: UserPreference, goal: Any) -> dict[str, Any]:
    q = lambda k: QUESTIONS[k].get(getattr(p, k) or "", "").lower()
    per_meal = {"A": 3, "B": 4, "C": 2, "D": 5}.get(p.meals or "", 4)
    avoid = p.allergies if p.allergies and norm(p.allergies) not in NONE_WORDS else ""
    return {
        "headline": f"{GOAL_VN.get(goal.goal_type, 'Duy trì')} với khoảng {goal.target_calories:.0f} kcal và {goal.target_protein_g:.0f} g đạm mỗi ngày.",
        "needs": [
            f"Năng lượng mục tiêu {goal.target_calories:.0f} kcal/ngày (TDEE {goal.tdee_calories:.0f} kcal).",
            f"Đạm {goal.target_protein_g:.0f} g, tinh bột {goal.target_carbs_g:.0f} g, chất béo {goal.target_fat_g:.0f} g mỗi ngày.",
            f"Chia thành {per_meal} bữa: trung bình khoảng {goal.target_calories / per_meal:.0f} kcal mỗi bữa.",
        ],
        "recommendations": [
            f"Theo chế độ {q('diet')}, khẩu vị {q('taste')}.",
            f"Ưu tiên nguồn đạm từ {q('protein')}.",
            f"Hình thức chuẩn bị: {q('cooking')}.",
            f"Giữ tổng chi phí cả ngày trong khoảng {goal.daily_budget_vnd:,} đ.".replace(",", "."),
        ],
        "sample_day": [],
        "cautions": ([f"Tránh tuyệt đối: {avoid}."] if avoid else []) + ["Số liệu chỉ mang tính tham khảo, không thay thế tư vấn y khoa."],
    }


def analyze_needs(session: Session, user_id: int) -> dict[str, Any]:
    """Tạo (và lưu) phân tích nhu cầu từ khảo sát + mục tiêu. Cần có cả hai."""
    from src.backend.models.schema import Goal

    p = get_preferences(session, user_id)
    goal = session.exec(select(Goal).where(Goal.user_id == user_id)).first()
    if not p or not goal:
        raise LookupError("Cần hoàn thành khảo sát và thiết lập mục tiêu trước.")
    data, source = None, "rule"
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if key and not key.startswith("YOUR_"):
        try:
            import time

            from google import genai
            from google.genai import types

            client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=15_000, retry_options=types.HttpRetryOptions(attempts=1)))
            config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=ANALYSIS_SCHEMA, temperature=0.3)
            prompt = ANALYSIS_PROMPT.format(answers=_answers_text(p), goal=_goal_text(goal))
            deadline = time.monotonic() + 25
            for model in ("gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"):
                if time.monotonic() > deadline:
                    break
                try:
                    res = client.models.generate_content(model=model, contents=prompt, config=config)
                    got = json.loads(res.text or "{}")
                    if got.get("headline") and got.get("recommendations"):
                        data, source = got, "ai"
                        break
                except Exception as exc:  # model bận / hết hạn mức: thử model khác
                    logger.info("Phân tích nhu cầu bằng %s lỗi: %s", model, exc)
        except Exception as exc:
            logger.info("Không gọi được AI phân tích nhu cầu: %s", exc)
    if data is None:
        data = _rule_analysis(p, goal)
    data = {k: data.get(k) or ([] if k != "headline" else "") for k in ("headline", "needs", "recommendations", "sample_day", "cautions")}
    data.update(source=source, target_calories=round(goal.target_calories), generated_at=utc_now().isoformat())
    p.analysis_json = json.dumps(data, ensure_ascii=False)
    session.add(p)
    session.commit()
    return data


def get_analysis(p: UserPreference | None) -> dict[str, Any] | None:
    return json.loads(p.analysis_json) if p and p.analysis_json else None
