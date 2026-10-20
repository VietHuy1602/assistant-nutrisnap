# KIẾN TRÚC BẢO MẬT JWT, SƠ ĐỒ ERD 8 BẢNG & QUY TẮC KIỂM SOÁT TRUY CẬP
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 - Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Tài liệu bàn giao:** Tuần 1 - Đặc tả Kiến trúc Bảo mật & Cơ sở Dữ liệu

---

## 1. Sơ đồ Quan hệ Thực thể Thống nhất 8 Bảng (ERD 8 Tables)

Hệ thống cơ sở dữ liệu SQLite (`nutrisnap.db`) được chuẩn hóa gồm đúng **8 bảng** với cờ kích hoạt khóa ngoại bắt buộc `PRAGMA foreign_keys = ON;`:

```text
       ┌────────────────────────────────────────┐
       │                 users                  │
       │────────────────────────────────────────│
       │ id (PK), username, email,              │
       │ password_hash, created_at              │
       └───────────────────┬────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┬──────────────────────┐
    │ 1-N                  │ 1-N                  │ 1-N                  │ 1-N
    ▼                      ▼                      ▼                      ▼
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│       goals        │ │    weight_logs     │ │       meals        │ │   chat_sessions    │
│────────────────────│ │────────────────────│ │────────────────────│ │────────────────────│
│ id (PK)            │ │ id (PK)            │ │ id (PK)            │ │ id (PK)            │
│ user_id (FK)       │ │ user_id (FK)       │ │ user_id (FK)       │ │ user_id (FK)       │
│ target_weight      │ │ weight_kg          │ │ meal_type          │ │ started_at         │
│ tdee_calories      │ │ logged_date        │ │ image_path         │ └─────────┬──────────┘
│ daily_budget_vnd   │ └────────────────────┘ │ logged_at          │           │ 1-N
└────────────────────┘                        └─────────┬──────────┘           ▼
                                                        │ 1-N        ┌────────────────────┐
┌────────────────────────┐                    ┌─────────▼──────────┐ │   chat_messages    │
│    food_references     │                    │     meal_items     │ │────────────────────│
│────────────────────────│                    │────────────────────│ │ id (PK)            │
│ id (PK), food_name     │◄────────1-N────────┤ id (PK)            │ │ session_id (FK)    │
│ calories_per_100g      │                    │ meal_id (FK)       │ │ sender_role        │
│ protein, carbs, fat    │                    │ food_id (FK)       │ │ content, tool_name │
│ avg_price_vnd          │                    │ estimated_gram     │ │ created_at         │
└────────────────────────┘                    │ estimated_calories │ └────────────────────┘
                                              └────────────────────┘