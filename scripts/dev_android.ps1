# scripts/dev_android.ps1
# Start everything needed to run the NutriSnap Android app for daily development:
#   1. Backend API (new PowerShell window, keep it open while using the app)
#   2. Build web app + sync into Android (LAN/emulator mode)
#   3. Open Android Studio (then press Run)
#
# Usage (from the project root):  .\scripts\dev_android.ps1
# Real phone instead of emulator: .\scripts\dev_android.ps1 -Lan
#   (needs src/frontend/.env.local VITE_API_BASE_URL=http://<PC-LAN-IP>:8000/api/v1
#    and DEV_MOBILE_ORIGIN=http://<PC-LAN-IP> in .env)

param([switch]$Lan)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apiHost = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }

Write-Host "[1/3] Starting backend on http://${apiHost}:8000 (new window)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "Set-Location '$root'; `$host.UI.RawUI.WindowTitle = 'NutriSnap backend'; python run_backend.py --host $apiHost --port 8000"
)

# Wait until the API answers so the app does not show "Khong the ket noi may chu"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/v1/assistant/health' -TimeoutSec 2 | Out-Null
    $ready = $true; break
  } catch { Start-Sleep -Seconds 1 }
}
if ($ready) { Write-Host '      Backend is ready.' -ForegroundColor Green }
else { Write-Host '      Backend not answering yet - check the "NutriSnap backend" window for errors.' -ForegroundColor Yellow }

Write-Host '[2/3] Building web app and syncing to Android...' -ForegroundColor Cyan
Set-Location (Join-Path $root 'src\frontend')
npm run android:lan
if ($LASTEXITCODE -ne 0) { throw 'Build/sync failed (see output above).' }

Write-Host '[3/3] Opening Android Studio...' -ForegroundColor Cyan
npx cap open android
Write-Host ''
Write-Host 'In Android Studio: wait for Gradle Sync, pick the emulator/phone, press Run (green triangle).' -ForegroundColor Green
Write-Host 'Keep the "NutriSnap backend" window open while using the app.' -ForegroundColor Green
