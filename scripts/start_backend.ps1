# scripts/start_backend.ps1
# Script PowerShell khởi chạy Backend an toàn trên Windows.
# Tự động giải phóng cổng 8000 nếu bị chiếm dụng (tránh triệt để lỗi WinError 10013).

$Port = 8000
Write-Host "🔍 Đang kiểm tra cổng $Port..." -ForegroundColor Cyan

$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    Write-Host "⚠️ Phát hiện cổng $Port đang bị chiếm bởi PID: $pids. Đang tự động giải phóng..." -ForegroundColor Yellow
    foreach ($p in $pids) {
        if ($p -gt 0) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 500
    Write-Host "✅ Đã giải phóng cổng $Port." -ForegroundColor Green
} else {
    Write-Host "✅ Cổng $Port đang trống." -ForegroundColor Green
}

Write-Host "🚀 Đang khởi động Backend FastAPI trên http://127.0.0.1:$Port..." -ForegroundColor Cyan
Write-Host "📖 Swagger UI: http://127.0.0.1:$Port/docs" -ForegroundColor Cyan

if (Test-Path ".\venv\Scripts\python.exe") {
    .\venv\Scripts\python.exe -m uvicorn src.backend.main:app --reload --host 127.0.0.1 --port $Port
} else {
    python -m uvicorn src.backend.main:app --reload --host 127.0.0.1 --port $Port
}
