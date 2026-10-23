"""
src/backend/api/v1/router.py
Bộ định tuyến tập trung cho toàn bộ API phiên bản 1 (/api/v1).
"""

from fastapi import APIRouter

from src.backend.api.v1.endpoints.auth import router as auth_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])
