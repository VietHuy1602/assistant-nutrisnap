# KIẾN TRÚC HỆ THỐNG & PHÂN ĐỊNH RANH GIỚI LLM - BACKEND
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Học phần:** CSC10014 – Tư duy tính toán (Computational Thinking)  
> **Tài liệu bàn giao:** Milestone 1 (M1) - Phân định ranh giới kiến trúc kỹ thuật

---

## 1. Tổng quan Kiến trúc Hệ thống (System Overview)
NutriSnap được thiết kế theo mô hình đa tầng phân lập trách nhiệm (Separation of Concerns), bảo đảm Trợ lý ảo AI hoạt động an toàn, chính xác và nhất quán:

```text
[ Người dùng ] 
      │ (Tương tác UI / WebRTC Camera / Voice / Chat)
      ▼
[ Presentation Layer (Frontend - React/Tailwind) ]
      │ (Giao tiếp REST API kèm HttpOnly JWT Cookie)
      ▼
[ Application & Routing Layer (Backend - FastAPI) ]
      │
      ├───────────────────────────────┬───────────────────────────────┐
      ▼                               ▼                               ▼
[ AI Orchestrator & LLM ]    [ Deterministic Engine ]       [ Persistence Layer ]
- NLU / Intent Recognition   - Tính calo/macro đại số       - SQLite (8 bảng chuẩn)
- Slot Filling & Tool Calls  - BMR / TDEE Calculator       - PRAGMA foreign_keys=ON
- Diễn đạt ngôn ngữ tự nhiên - Lọc nhiễu cân nặng EMA       - Dữ liệu USDA & VN Foods