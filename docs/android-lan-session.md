# Phiên đăng nhập Android khi phát triển qua LAN

## Nguyên nhân và cách sửa

WebView mặc định ở `https://localhost`, API LAN ở `http://<IP>:8000`:
đây là hai site khác nhau. Cookie `SameSite=Lax` bị trình duyệt chặn trong
response/request XHR cross-site, dù Axios đã có `withCredentials: true`.
`SameSite=None` cần `Secure` và HTTPS; không sửa bằng cách bật None trên HTTP.

Chế độ opt-in `NUTRISNAP_ANDROID_LAN_DEV=1` lấy hostname từ
`src/frontend/.env.local` qua Vite, đặt origin WebView thành `http://<IP>`.
Nội dung vẫn nằm trong APK (`webDir=dist`), không tải frontend từ máy chủ LAN.
API và WebView khác port nhưng cùng site, nên cookie Lax hoạt động.
Cookie vẫn HttpOnly, host-only, Path=/ và có Max-Age theo cấu hình backend.
Không dùng bearer token hoặc localStorage để lưu phiên.

Backend chỉ thêm origin chính xác từ `DEV_MOBILE_ORIGIN` vào CORS/CSRF khi
`APP_ENV=development`. Không cho phép wildcard. Release build từ chối cấu hình
WebView HTTP. Không thay đổi AUTH_COOKIE_SECURE/SAMESITE của production.

## Build và cài APK debug

Kiểm tra `VITE_API_BASE_URL` trong `.env.local` đúng với IP hiện tại của PC.
Không đưa `.env.local` hay `.env` vào Git.

Terminal frontend (PowerShell):

```powershell
cd D:\Mobile\assistant-nutrisnap\src\frontend
$env:NUTRISNAP_ANDROID_LAN_DEV = '1'
npm run build
npx cap sync android
cd android
$env:JAVA_HOME = 'C:\Users\PC\.jdks\jbr-21.0.11'
.\gradlew.bat :app:assembleDebug --offline
$adb = 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l
& $adb -d install -r app/build/outputs/apk/debug/app-debug.apk
& $adb -d shell am start -n com.nutrisnap.app/.MainActivity
```

`-d` chọn điện thoại USB thật. Với nhiều điện thoại, dùng `-s <serial>`.
Không cần uninstall hoặc xóa dữ liệu. Lần đổi origin đầu tiên có thể cần đăng nhập lại.
LocalStorage/IndexedDB thuộc origin cũ không tự chuyển sang origin mới; không xóa
dữ liệu ứng dụng để xử lý lỗi phiên.

Terminal backend (thay IP bên dưới nếu cấu hình hiện tại đã thay đổi):

```powershell
cd D:\Mobile\assistant-nutrisnap
$env:APP_ENV = 'development'
$env:DEV_MOBILE_ORIGIN = 'http://192.168.1.4'
& 'C:\Users\PC\AppData\Local\Python\pythoncore-3.14-64\python.exe' run_backend.py --host 0.0.0.0 --port 8000
```

Origin không có `:8000` hoặc `/api/v1`. Có thể lưu DEV_MOBILE_ORIGIN trong backend
`.env` thay cho biến môi trường phiên terminal, rồi khởi động lại backend.

## Kiểm tra trên điện thoại thật

1. PC và điện thoại cùng mạng. Dùng APK debug vừa cài. Mở Chrome trên PC tại
   `chrome://inspect/#devices`, chọn Inspect cho NutriSnap.
2. Kiểm tra `location.origin` là `http://<IP>` và Network gọi API tại
   `http://<IP>:8000/api/v1`. Không đổi thành địa chỉ localhost của điện thoại.
3. Đăng nhập đúng thông tin: POST login phải 200. Trong Cookies của response,
   kiểm tra cookie `access_token` không có lý do blocked. Chỉ xem thuộc tính,
   không sao chép giá trị JWT, Cookie header hoặc Set-Cookie vào log/chat/HAR.
4. GET auth/me ngay sau đó phải 200. Request Cookies phải có tên access_token.
   Application > Cookies phải cho thấy HttpOnly, Path=/, SameSite=Lax và thời hạn.
   `document.cookie` không được lộ access_token.
5. Reload WebView trong DevTools: auth/me phải 200 mà không POST login lần nữa.
6. Đóng app, bỏ khỏi recent apps rồi mở lại; tiếp tục kiểm tra auth/me=200.
   Có thể force-stop bằng `adb -d shell am force-stop com.nutrisnap.app` rồi mở lại.
   Không xóa app data. Phiên chỉ tồn tại tới hạn JWT/Max-Age đã cấu hình.
7. Đăng xuất: auth/me phải 401. Đăng nhập sai mật khẩu: login phải 401 và không
   tạo phiên. Registration 422 là lỗi validation riêng, xem tên trường lỗi.

## Kiểm thử tự động

Frontend:

```powershell
cd D:\Mobile\assistant-nutrisnap\src\frontend
npm test -- src/__tests__/authSession.test.tsx src/__tests__/capacitorConfig.test.ts src/__tests__/AuthContext.test.tsx src/__tests__/LoginPage.test.tsx src/__tests__/apiError.test.ts
npm run build
```

Backend: chạy trong terminal riêng; dùng database bộ nhớ và khóa chỉ dành cho test.
`--noconftest` tránh fixture toàn cục seed database thật của repository.

```powershell
cd D:\Mobile\assistant-nutrisnap
$env:APP_ENV = 'development'
$env:DEV_MOBILE_ORIGIN = 'http://192.168.50.20'
$env:DATABASE_URL = 'sqlite://'
$env:JWT_SECRET_KEY = 'mobile_session_test_only_key_not_for_production_12345'
$env:AUTH_COOKIE_SECURE = 'False'
$env:AUTH_COOKIE_SAMESITE = 'lax'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
& 'C:\Users\PC\AppData\Local\Python\pythoncore-3.14-64\python.exe' -m pytest --noconftest tests/unit/test_mobile_session.py tests/unit/test_mobile_origin.py -q
```

WebView instrumentation:

```powershell
cd D:\Mobile\assistant-nutrisnap\src\frontend\android
$env:JAVA_HOME = 'C:\Users\PC\.jdks\jbr-21.0.11'
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest --offline
$adb = 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb -s emulator-5554 install -r -t app/build/outputs/apk/debug/app-debug.apk
& $adb -s emulator-5554 install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $adb -s emulator-5554 shell am instrument -w -e class com.nutrisnap.app.WebViewCookieSessionTest com.nutrisnap.app.test/androidx.test.runner.AndroidJUnitRunner
```

Test WebView dùng HTTP server nằm trên emulator và cookie giả, kiểm tra cấu hình
cross-site cũ, cấu hình same-site mới, HttpOnly và tạo lại WebView không cần login.
Nó không chứng minh phiên của tài khoản thật trên điện thoại đã hoạt động.

## Giới hạn và release

Chế độ HTTP LAN chỉ dành cho development; một số Web API cần secure context
(ví dụ getUserMedia/geolocation) không hoạt động ở origin HTTP LAN. IP thay đổi
thì cần cập nhật env, sync/build lại và origin backend. Không nới lỏng trình duyệt
hoặc đổi cookie sang None để né HTTPS.

Trước build release, bỏ biến `NUTRISNAP_ANDROID_LAN_DEV`, cấu hình API HTTPS của
deployment và sync lại. Guard Gradle sẽ chặn nếu config vẫn dùng androidScheme=http.
Origin production, CORS/CSRF và chiến lược same-site hoặc SameSite=None; Secure qua
HTTPS cần được triển khai đồng bộ theo tên miền thật; bản sửa này không tự cấp TLS
hay cấu hình production cho một domain chưa được cung cấp.
