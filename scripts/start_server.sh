#!/usr/bin/env bash
# Khởi động backend trên Render: chuẩn bị CSDL rồi chạy API.
set -e
python scripts/bootstrap_server.py
exec python -m uvicorn src.backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
