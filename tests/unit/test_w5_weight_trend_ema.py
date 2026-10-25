"""
tests/unit/test_w5_weight_trend_ema.py
Bộ kiểm thử đơn vị & tích hợp toàn diện thuật toán Xu hướng Cân nặng EMA (Tuần 5).
Tuân thủ đầy đủ mục 5 README_05_WEIGHT_TREND_EMA.md và các quyết định thiết kế:
1. calculate_ema_points là hàm lõi thuần túy (pure function), không tác dụng phụ, không sửa input.
2. Kiểm tra biên alpha trong (0, 1.0], alpha = 1.0 thì trend == weight.
3. Độ chính xác float trong vòng lặp, chỉ làm tròn 2 chữ số thập phân khi đóng gói.
4. Gộp cùng ngày: giữ bản ghi có id lớn nhất (lần ghi nhận muộn nhất).
5. Lọc cân nặng ngoài ngưỡng an toàn [MIN_VALID_WEIGHT_KG, MAX_VALID_WEIGHT_KG] (25.0 - 300.0 kg), NaN, <= 0.
6. Sắp xếp thứ tự thời gian tự động.
7. Chỉ số tóm tắt: current_trend_kg, weekly_change_kg, weekly_change_status ("ok", "insufficient_span", "no_data").
8. Bảo mật Zero-Trust API: cách ly User A & User B, không cookie trả 401, tham số user_id giả từ client bị bỏ qua.
9. Hiệu năng: 365 điểm tính toán tuyến tính < 50ms.
"""

import time
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import User, WeightLog, get_vn_today
from src.backend.services.auth_service import (
    create_access_token,
    register_with_initial_goal,
)
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.weight_trend import (
    MAX_VALID_WEIGHT_KG,
    MIN_VALID_WEIGHT_KG,
    calculate_ema_points,
    calculate_ema_series,
    calculate_ema_weight_trend,
)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL phục vụ kiểm thử."""
    init_db()


def create_test_client_and_user(username: str, email: str) -> tuple[TestClient, User]:
    """Helper tạo TestClient có HttpOnly Cookie JWT của người dùng đã xác thực."""
    with Session(engine) as session:
        existing = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()
        if existing:
            # Xóa các liên kết và dữ liệu cũ của user
            session.delete(existing)
            session.commit()

        user, _ = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="Password123",
            initial_goal=GoalPlanInput(
                gender="male",
                age=25,
                height_cm=175.0,
                current_weight_kg=70.0,
                target_weight_kg=65.0,
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                activity_level="moderate",
                daily_budget_vnd=60000,
            ),
        )

    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    client = TestClient(app)
    client.cookies.set("access_token", token)
    return client, user


def clear_user_weight_logs(session: Session, user_id: int) -> None:
    """Helper dọn dẹp nhật ký cân nặng của user."""
    old_logs = session.exec(select(WeightLog).where(WeightLog.user_id == user_id)).all()
    for ol in old_logs:
        session.delete(ol)
    session.commit()


# ==============================================================================
# 1. TEST ĐƠN VỊ: DANH SÁCH RỖNG VÀ MỘT ĐIỂM
# ==============================================================================


def test_01_empty_and_single_point():
    """Danh sách rỗng trả về [] (không lỗi).

    Một điểm duy nhất: trend_kg == weight_kg.
    """
    # 1. Danh sách rỗng
    assert calculate_ema_points([]) == []

    # 2. Một điểm duy nhất
    single_point = [("2026-10-01", 70.0)]
    res = calculate_ema_points(single_point, alpha=0.1)
    assert len(res) == 1
    assert res[0]["date"] == "2026-10-01"
    assert res[0]["weight_kg"] == 70.0
    assert res[0]["trend_kg"] == 70.0
    assert res[0]["raw_weight_kg"] == 70.0
    assert res[0]["ema_weight_kg"] == 70.0


# ==============================================================================
# 2. TEST ĐƠN VỊ: DÃY NGẮN CÓ GIÁ TRỊ TÍNH TAY KHỚP VỚI COMMENT CỤ THỂ
# ==============================================================================


def test_02_short_sequence_hand_calculated():
    """Kiểm tra độ chính xác đại số theo giá trị tính tay với alpha = 0.1.

    Trường hợp 1: Dãy 3 điểm [70.0, 71.0, 70.0]
    Phép tính tay không làm tròn trung gian:
      - t=0: W_0 = 70.0 => EMA_0 = 70.0
      - t=1: W_1 = 71.0 => EMA_1 = 0.1 * 71.0 + 0.9 * 70.0 = 7.1 + 63.0 = 70.1
      - t=2: W_2 = 70.0 => EMA_2 = 0.1 * 70.0 + 0.9 * 70.1 = 7.0 + 63.09 = 70.09
      => trend_kg = [70.0, 70.1, 70.09]

    Trường hợp 2: Dãy 5 điểm [70.0, 71.0, 70.5, 69.8, 69.5] (khớp test_07 cũ)
    Phép tính tay:
      - t=0: EMA_0 = 70.0
      - t=1: EMA_1 = 0.1 * 71.0 + 0.9 * 70.0 = 70.1
      - t=2: EMA_2 = 0.1 * 70.5 + 0.9 * 70.1 = 7.05 + 63.09 = 70.14
      - t=3: EMA_3 = 0.1 * 69.8 + 0.9 * 70.14 = 6.98 + 63.126 = 70.106 => round(2) = 70.11
      - t=4: EMA_4 = 0.1 * 69.5 + 0.9 * 70.106 = 6.95 + 63.0954 = 70.0454 => round(2) = 70.05
      => trend_kg = [70.0, 70.1, 70.14, 70.11, 70.05]
    """
    # Trường hợp 1: 3 điểm
    input_3 = [
        ("2026-10-01", 70.0),
        ("2026-10-02", 71.0),
        ("2026-10-03", 70.0),
    ]
    res_3 = calculate_ema_points(input_3, alpha=0.1)
    trends_3 = [p["trend_kg"] for p in res_3]
    assert trends_3 == [70.0, 70.1, 70.09]

    # Trường hợp 2: 5 điểm
    input_5 = [
        ("2026-10-01", 70.0),
        ("2026-10-02", 71.0),
        ("2026-10-03", 70.5),
        ("2026-10-04", 69.8),
        ("2026-10-05", 69.5),
    ]
    res_5 = calculate_ema_points(input_5, alpha=0.1)
    trends_5 = [p["trend_kg"] for p in res_5]
    assert trends_5 == [70.0, 70.1, 70.14, 70.11, 70.05]


# ==============================================================================
# 3. TEST ĐƠN VỊ: DÃY HẰNG SỐ
# ==============================================================================


def test_03_constant_sequence():
    """Dãy cân nặng hằng số [68.5, 68.5, 68.5, 68.5] thì trend luôn bằng 68.5 ở mọi bước."""
    weights = [68.5, 68.5, 68.5, 68.5]
    inputs = [(f"2026-10-0{i+1}", w) for i, w in enumerate(weights)]
    res = calculate_ema_points(inputs, alpha=0.1)
    assert len(res) == 4
    for point in res:
        assert point["trend_kg"] == 68.5
        assert point["weight_kg"] == 68.5


# ==============================================================================
# 4. TEST ĐƠN VỊ: TÍNH CHẤT NẰM TRONG MIỀN GIÁ TRỊ (BOUNDEDNESS)
# ==============================================================================


def test_04_ema_boundedness():
    """Giá trị EMA luôn nằm chặt chẽ trong khoảng [min(W), max(W)] của các điểm đã thấy."""
    inputs = [
        ("2026-10-01", 65.0),
        ("2026-10-02", 75.0),
        ("2026-10-03", 68.0),
        ("2026-10-04", 72.0),
        ("2026-10-05", 66.0),
    ]
    res = calculate_ema_points(inputs, alpha=0.1)
    min_w = min(p[1] for p in inputs)
    max_w = max(p[1] for p in inputs)

    for point in res:
        assert min_w <= point["trend_kg"] <= max_w


# ==============================================================================
# 5. TEST ĐƠN VỊ: TÁC DỤNG LÀM MỊN (SMOOTHING EFFECT)
# ==============================================================================


def test_05_smoothing_effect_reduces_amplitude():
    """Dao động ngắn hạn (+1 kg rồi -1 kg) bị làm mịn: biên độ trend < biên độ dữ liệu thô."""
    inputs = [
        ("2026-10-01", 70.0),
        ("2026-10-02", 71.0),
        ("2026-10-03", 70.0),
    ]
    res = calculate_ema_points(inputs, alpha=0.1)

    raw_amp = max(p["weight_kg"] for p in res) - min(p["weight_kg"] for p in res)
    trend_amp = max(p["trend_kg"] for p in res) - min(p["trend_kg"] for p in res)

    assert raw_amp == 1.0
    assert pytest.approx(trend_amp, abs=1e-4) == 0.1
    assert trend_amp < raw_amp


# ==============================================================================
# 6. TEST ĐƠN VỊ: ĐẦU VÀO KHÔNG THEO THỨ TỰ (AUTO-SORT)
# ==============================================================================


def test_06_unordered_input_sorting():
    """Đầu vào không theo thứ tự thời gian phải tự động sắp xếp theo ngày tăng dần."""
    sorted_input = [
        ("2026-10-01", 70.0),
        ("2026-10-02", 71.0),
        ("2026-10-03", 70.5),
        ("2026-10-04", 69.8),
    ]
    # Xáo trộn thứ tự
    shuffled_input = [
        ("2026-10-03", 70.5),
        ("2026-10-01", 70.0),
        ("2026-10-04", 69.8),
        ("2026-10-02", 71.0),
    ]

    res_sorted = calculate_ema_points(sorted_input, alpha=0.1)
    res_shuffled = calculate_ema_points(shuffled_input, alpha=0.1)

    assert res_sorted == res_shuffled
    assert [p["date"] for p in res_shuffled] == [
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
        "2026-10-04",
    ]


# ==============================================================================
# 7. TEST ĐƠN VỊ: NHIỀU LẦN CÂN TRONG CÙNG MỘT NGÀY (GIỮ ID LỚN NHẤT)
# ==============================================================================


def test_07_multiple_entries_same_day_keeps_highest_id():
    """Nếu cùng một ngày có nhiều lần cân, giữ bản ghi có id lớn nhất (lần ghi muộn nhất).

    Số điểm points_count đại diện đúng cho số ngày duy nhất.
    """
    entries = [
        # Ngày 1: có 3 lần cân với id 1, 3, 2
        {"date": "2026-10-01", "weight_kg": 70.5, "id": 1},
        {"date": "2026-10-01", "weight_kg": 70.0, "id": 3},  # id lớn nhất => chọn 70.0
        {"date": "2026-10-01", "weight_kg": 70.2, "id": 2},
        # Ngày 2: có 2 lần cân
        {"date": "2026-10-02", "weight_kg": 71.5, "id": 4},
        {"date": "2026-10-02", "weight_kg": 71.0, "id": 10},  # id lớn nhất => chọn 71.0
    ]

    res = calculate_ema_points(entries, alpha=0.1)
    assert len(res) == 2  # Đúng 2 ngày
    assert res[0]["date"] == "2026-10-01"
    assert res[0]["weight_kg"] == 70.0
    assert res[0]["trend_kg"] == 70.0

    assert res[1]["date"] == "2026-10-02"
    assert res[1]["weight_kg"] == 71.0
    assert res[1]["trend_kg"] == 70.1  # 0.1 * 71.0 + 0.9 * 70.0 = 70.1


# ==============================================================================
# 8. TEST ĐƠN VỊ: XỬ LÝ KHOẢNG TRỐNG NGÀY (CÁCH A - BƯỚC ĐO THỰC TẾ)
# ==============================================================================


def test_08_day_gaps_handling_method_a():
    """Khoảng trống ngày: áp dụng Phương thức A (tính theo từng bước đo thực tế)."""
    # Ngày 01 và ngày 05 cách nhau 4 ngày
    inputs = [
        ("2026-10-01", 70.0),
        ("2026-10-05", 72.0),
    ]
    res = calculate_ema_points(inputs, alpha=0.1)
    assert len(res) == 2
    assert res[0]["trend_kg"] == 70.0
    # EMA bước 2 = 0.1 * 72.0 + 0.9 * 70.0 = 7.2 + 63.0 = 70.2
    assert res[1]["trend_kg"] == 70.2


# ==============================================================================
# 9. TEST ĐƠN VỊ: KIỂM TRA BIÊN THAM SỐ ALPHA
# ==============================================================================


def test_09_alpha_boundary_validation():
    """alpha phải nằm trong (0, 1.0].

    Ngoài khoảng ném ValueError. Khi alpha = 1.0 thì trend == weight.
    """
    sample = [("2026-10-01", 70.0), ("2026-10-02", 71.0)]

    # 1. alpha <= 0
    with pytest.raises(ValueError, match="alpha phải nằm trong khoảng"):
        calculate_ema_points(sample, alpha=0.0)
    with pytest.raises(ValueError, match="alpha phải nằm trong khoảng"):
        calculate_ema_points(sample, alpha=-0.1)

    # 2. alpha > 1.0
    with pytest.raises(ValueError, match="alpha phải nằm trong khoảng"):
        calculate_ema_points(sample, alpha=1.0001)

    # 3. alpha = 1.0 => trend_kg == weight_kg
    res_one = calculate_ema_points(sample, alpha=1.0)
    for p in res_one:
        assert p["trend_kg"] == p["weight_kg"]


# ==============================================================================
# 10. TEST ĐƠN VỊ: LỌC BỎ CÁC GIÁ TRỊ KHÔNG HỢP LỆ
# ==============================================================================


def test_10_invalid_weight_filtering():
    """Các giá trị NaN, Inf, <= 0, hoặc ngoài [MIN_VALID_WEIGHT_KG, MAX_VALID_WEIGHT_KG]

    (25.0 - 300.0 kg) bị loại bỏ sạch sẽ mà không làm hỏng chuỗi điểm hợp lệ.
    """
    assert MIN_VALID_WEIGHT_KG == 25.0
    assert MAX_VALID_WEIGHT_KG == 300.0

    dirty_data = [
        ("2026-10-01", 70.0),
        ("2026-10-02", float("nan")),  # NaN
        ("2026-10-03", float("inf")),  # Inf
        ("2026-10-04", 0.0),  # <= 0
        ("2026-10-05", -5.0),  # âm
        ("2026-10-06", 15.0),  # < 25.0 kg
        ("2026-10-07", 450.0),  # > 300.0 kg
        ("2026-10-08", 71.0),  # hợp lệ
    ]

    res = calculate_ema_points(dirty_data, alpha=0.1)
    assert len(res) == 2
    assert res[0]["date"] == "2026-10-01"
    assert res[0]["weight_kg"] == 70.0
    assert res[0]["trend_kg"] == 70.0

    assert res[1]["date"] == "2026-10-08"
    assert res[1]["weight_kg"] == 71.0
    assert res[1]["trend_kg"] == 70.1

    # Toàn bộ danh sách không hợp lệ trả về []
    only_invalid = [("2026-10-01", float("nan")), ("2026-10-02", -10.0)]
    assert calculate_ema_points(only_invalid) == []


# ==============================================================================
# 11. TEST ĐƠN VỊ: TÍNH BẤT BIẾN / HÀM THUẦN TÚY (IMMUTABILITY)
# ==============================================================================


def test_11_pure_function_immutability():
    """calculate_ema_points không sửa đổi danh sách hoặc dict trong đầu vào."""
    original_input = [
        {"date": "2026-10-02", "weight_kg": 71.0, "id": 2},
        {"date": "2026-10-01", "weight_kg": 70.0, "id": 1},
    ]
    # Lưu bản sao đối chiếu
    snapshot = [dict(item) for item in original_input]

    res = calculate_ema_points(original_input, alpha=0.1)
    assert len(res) == 2

    # Danh sách gốc vẫn giữ nguyên thứ tự và nội dung ban đầu
    assert original_input == snapshot
    assert original_input[0]["date"] == "2026-10-02"
    assert original_input[1]["date"] == "2026-10-01"


# ==============================================================================
# 12. TEST ĐƠN VỊ: CHỈ SỐ WEEKLY CHANGE VÀ CURRENT TREND
# ==============================================================================


def test_12_weekly_change_and_current_trend_metrics():
    """Kiểm tra logic tính toán weekly_change_kg, weekly_change_status và current_trend_kg:

    - span_days >= 7: tính tỷ lệ quy đổi 7 ngày, status = "ok".
    - span_days < 7: weekly_change_kg = None, status = "insufficient_span".
    - 0 bản ghi: weekly_change_kg = None, status = "no_data".
    - current_trend_kg luôn là alias của latest_ema_kg.
    """
    _, user = create_test_client_and_user("w5_weekly_test", "w5_weekly_test@example.com")
    today = get_vn_today()

    with Session(engine) as session:
        clear_user_weight_logs(session, user.id)  # type: ignore

        # 1. Trường hợp 0 điểm
        res_empty = calculate_ema_weight_trend(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            days_range=14,
        )
        assert res_empty["points_count"] == 0
        assert res_empty["current_trend_kg"] is None
        assert res_empty["weekly_change_kg"] is None
        assert res_empty["weekly_change_status"] == "no_data"

        # 2. Trường hợp span < 7 ngày (ví dụ 3 ngày: ngày 0, 1, 2)
        session.add(WeightLog(user_id=user.id, weight_kg=70.0, logged_date=today - timedelta(days=2)))  # type: ignore
        session.add(WeightLog(user_id=user.id, weight_kg=71.0, logged_date=today))  # type: ignore
        session.commit()

        res_short = calculate_ema_weight_trend(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            days_range=14,
        )
        assert res_short["points_count"] == 2
        assert res_short["current_trend_kg"] == res_short["latest_ema_kg"]
        assert res_short["weekly_change_kg"] is None
        assert res_short["weekly_change_status"] == "insufficient_span"

        # 3. Trường hợp span >= 7 ngày (ví dụ cách nhau 10 ngày: 70.0 kg -> 72.0 kg)
        clear_user_weight_logs(session, user.id)  # type: ignore
        session.add(WeightLog(user_id=user.id, weight_kg=70.0, logged_date=today - timedelta(days=10)))  # type: ignore
        session.add(WeightLog(user_id=user.id, weight_kg=72.0, logged_date=today))  # type: ignore
        session.commit()

        res_span = calculate_ema_weight_trend(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            days_range=14,
            alpha=0.1,
        )
        assert res_span["points_count"] == 2
        # start_ema = 70.0, latest_ema = 0.1 * 72.0 + 0.9 * 70.0 = 70.2
        # span_days = 10
        # weekly_change_kg = round(((70.2 - 70.0) / 10) * 7.0, 2) = round(0.2 / 10 * 7, 2) = round(0.14, 2) = 0.14
        assert res_span["weekly_change_status"] == "ok"
        assert res_span["weekly_change_kg"] == 0.14
        assert res_span["current_trend_kg"] == 70.2


# ==============================================================================
# 13. TEST TÍCH HỢP: BẢO MẬT ZERO-TRUST & XÁC THỰC API
# ==============================================================================


def test_13_zero_trust_user_isolation_and_api_auth():
    """Kiểm tra cách ly người dùng A và B, xác thực Cookie HttpOnly và chống giả mạo user_id:

    - User A và User B có dữ liệu cân nặng khác nhau.
    - User A chỉ nhìn thấy dữ liệu của A, User B chỉ nhìn thấy dữ liệu của B.
    - Yêu cầu không có cookie trả về 401 Unauthorized.
    - Client gửi user_id giả trong query params (?user_id=9999) hoàn toàn bị bỏ qua.
    """
    client_a, user_a = create_test_client_and_user("w5_iso_user_a", "w5_iso_user_a@example.com")
    client_b, user_b = create_test_client_and_user("w5_iso_user_b", "w5_iso_user_b@example.com")
    today = get_vn_today()

    with Session(engine) as session:
        clear_user_weight_logs(session, user_a.id)  # type: ignore
        clear_user_weight_logs(session, user_b.id)  # type: ignore

        # User A: 3 bản ghi [65.0, 65.5, 66.0]
        for i, w in enumerate([65.0, 65.5, 66.0]):
            session.add(
                WeightLog(
                    user_id=user_a.id,  # type: ignore
                    weight_kg=w,
                    logged_date=today - timedelta(days=2 - i),
                )
            )

        # User B: 2 bản ghi [80.0, 80.5]
        for i, w in enumerate([80.0, 80.5]):
            session.add(
                WeightLog(
                    user_id=user_b.id,  # type: ignore
                    weight_kg=w,
                    logged_date=today - timedelta(days=1 - i),
                )
            )
        session.commit()

    # 1. User A gọi API
    resp_a = client_a.get("/api/v1/analytics/weight-trend?days_range=14")
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["user_id"] == user_a.id
    assert data_a["points_count"] == 3
    assert data_a["latest_weight_kg"] == 66.0

    # 2. User B gọi API
    resp_b = client_b.get("/api/v1/analytics/weight-trend?days_range=14")
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["user_id"] == user_b.id
    assert data_b["points_count"] == 2
    assert data_b["latest_weight_kg"] == 80.5

    # 3. Yêu cầu không có cookie xác thực trả về 401 Unauthorized
    anon_client = TestClient(app)
    resp_anon = anon_client.get("/api/v1/analytics/weight-trend?days_range=14")
    assert resp_anon.status_code == 401

    # 4. Client User B cố ý gửi user_id giả của User A qua query string (?user_id=...)
    resp_spoof = client_b.get(f"/api/v1/analytics/weight-trend?days_range=14&user_id={user_a.id}")
    assert resp_spoof.status_code == 200
    data_spoof = resp_spoof.json()
    # Hệ thống bắt buộc dùng authenticated_user_id của User B, bỏ qua hoàn toàn user_id truyền lên
    assert data_spoof["user_id"] == user_b.id
    assert data_spoof["user_id"] != user_a.id
    assert data_spoof["points_count"] == 2


# ==============================================================================
# 14. TEST HIỆU NĂNG: XỬ LÝ 365 ĐIỂM DỮ LIỆU
# ==============================================================================


def test_14_performance_365_points():
    """Kiểm tra hiệu năng: dãy 365 điểm dữ liệu xử lý tuyến tính và hoàn tất trong < 50ms."""
    start_d = date(2025, 1, 1)
    points_365 = [
        (start_d + timedelta(days=i), 70.0 + (i % 10) * 0.1)
        for i in range(365)
    ]

    t0 = time.perf_counter()
    res = calculate_ema_points(points_365, alpha=0.1)
    t1 = time.perf_counter()

    elapsed_ms = (t1 - t0) * 1000.0
    assert len(res) == 365
    assert elapsed_ms < 50.0, f"Thời gian thực thi {elapsed_ms:.2f}ms vượt quá 50ms"


# ==============================================================================
# 15. TEST HỒI QUY: HÀM CŨ calculate_ema_series VẪN NGUYÊN VẸN
# ==============================================================================


def test_15_calculate_ema_series_backward_compatibility():
    """Đảm bảo hàm cũ calculate_ema_series (habit_service đang dùng) không bị thay đổi."""
    weights = [70.0, 71.0, 70.5]
    res = calculate_ema_series(weights, alpha=0.1)
    assert res == [70.0, 70.1, 70.14]
