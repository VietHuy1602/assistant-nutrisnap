# Hướng dẫn deploy NutriSnap MIỄN PHÍ – lưu người dùng vĩnh viễn & quản trị

Làm theo tài liệu này bạn sẽ có:

- **Backend chạy 24/7 trên Render** (miễn phí), giữ API key Gemini bí mật trên server.
- **Cơ sở dữ liệu Postgres trên Neon** (miễn phí, 0,5GB): tài khoản và dữ liệu người dùng **không bao giờ mất** khi server khởi động lại.
- **Trang Quản trị** trong app: xem thống kê, tìm, khoá/mở khoá, cấp quyền, xoá người dùng.
- **File APK** trên GitHub Releases: người khác tải về cài là dùng, không cần cài đặt gì.

```
 Điện thoại (APK) ──HTTPS──▶ Render (FastAPI) ──▶ Neon (Postgres: users, bữa ăn, cân nặng…)
                                   │
                                   └──▶ Google Gemini (GEMINI_API_KEY chỉ nằm ở Render)
```

Chi phí: **0 đồng**, không cần thẻ thanh toán. Thời gian: khoảng 1–1,5 giờ.

> Tài liệu này thay thế các Phần 2, 4 và 9 của [HUONG_DAN_PUBLIC_APP.md](HUONG_DAN_PUBLIC_APP.md).
> Code đã được sửa sẵn: hỗ trợ Postgres, biến `CORS_ORIGINS`, trang/API quản trị, script `scripts/start_server.sh`.

---

## Bước 0. Chuẩn bị (5 phút)

1. Làm **Phần 1** (dọn bảo mật) trong [HUONG_DAN_PUBLIC_APP.md](HUONG_DAN_PUBLIC_APP.md): xoá key cũ `AIzaSyDu...`, kiểm tra `.env` và `nutrisnap.db` không bị đưa lên Git.
2. Push code mới nhất lên GitHub:

   ```bash
   git add .
   git commit -m "feat: deploy-ready (Postgres, admin, CORS)"
   git push
   ```

3. Chuẩn bị sẵn trong Notepad:
   - Một **API key Gemini mới** dành riêng cho server: https://aistudio.google.com/apikey → *Create API key*.
   - Một **JWT secret**: chạy `python -c "import secrets; print(secrets.token_hex(32))"` rồi copy kết quả.
   - **Tài khoản admin** bạn muốn dùng: tên đăng nhập, email, mật khẩu mạnh (≥ 8 ký tự, khác mật khẩu demo).

---

## Bước 1. Tạo cơ sở dữ liệu Postgres miễn phí trên Neon (10 phút)

1. Vào https://neon.tech → **Sign up** → chọn **Continue with GitHub** (hoặc Google).
2. Màn hình *Create project*:
   - **Project name**: `nutrisnap`
   - **Postgres version**: để mặc định (16 hoặc 17)
   - **Cloud provider**: AWS
   - **Region**: **AWS Asia Pacific 1 (Singapore)** – gần Việt Nam và cùng vùng với Render ở bước 2
   - Bấm **Create project**.
3. Xuất hiện hộp **Connect to your database**:
   - **Branch**: `main`, **Database**: `neondb`, **Role**: `neondb_owner`
   - Bật **Connection pooling** (Pooled connection).
   - Ở ô chuỗi kết nối, chọn dạng **Connection string**, bấm **Copy**. Chuỗi có dạng:

     ```
     postgresql://neondb_owner:MẬT_KHẨU@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
     ```

4. Dán chuỗi này vào Notepad. **Đây là bí mật** (chứa mật khẩu DB) – không đưa lên GitHub, không gửi cho ai.

> Mất chuỗi? Neon Dashboard → project `nutrisnap` → nút **Connect** ở trang Overview.

### (Tuỳ chọn) Thử kết nối từ máy bạn

Trong thư mục dự án (đã bật `.venv` và `pip install -r requirements.txt`):

```powershell
# PowerShell
$env:DATABASE_URL="postgresql://...chuỗi_của_bạn..."
python scripts/bootstrap_server.py
```

```bash
# macOS / Linux / Git Bash
DATABASE_URL="postgresql://...chuỗi_của_bạn..." python scripts/bootstrap_server.py
```

Thấy `✅ THÀNH CÔNG: Đã đồng bộ an toàn 504 món ăn` là Neon đã hoạt động. Vào Neon → **Tables** sẽ thấy các bảng `users`, `food_references`…
Đóng terminal sau khi thử để biến `DATABASE_URL` không ảnh hưởng lần chạy local sau.

---

## Bước 2. Deploy backend lên Render (15 phút)

1. Vào https://render.com → **Get Started** → **Sign up with GitHub**.
   Khi GitHub hỏi quyền: **Only select repositories** → chọn `assistant-nutrisnap` → **Install**.
2. Dashboard → **+ New** → **Web Service** → chọn repo `assistant-nutrisnap` → **Connect**.
3. Điền:

| Ô | Giá trị |
|---|---|
| Name | `nutrisnap-api` |
| Region | **Singapore (Southeast Asia)** |
| Branch | `main` |
| Root Directory | *(để trống)* |
| Language | **Python 3** |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `bash scripts/start_server.sh` |
| Instance Type | **Free** |

4. Mục **Environment Variables** → **Add Environment Variable**, thêm đủ các dòng sau:

| Key | Value | Ghi chú |
|---|---|---|
| `PYTHON_VERSION` | `3.11.9` | |
| `DATABASE_URL` | *chuỗi Neon ở Bước 1* | dữ liệu người dùng lưu tại đây |
| `GEMINI_API_KEY` | *key Gemini mới* | |
| `JWT_SECRET_KEY` | *chuỗi 64 ký tự* | **đừng đổi sau này**, đổi = mọi người bị đăng xuất |
| `APP_ENV` | `production` | |
| `DEBUG` | `False` | |
| `AUTH_COOKIE_SECURE` | `True` | cookie chỉ gửi qua HTTPS |
| `AUTH_COOKIE_SAMESITE` | `none` | cho phép app Android gửi cookie tới server |
| `CORS_ORIGINS` | `https://localhost,capacitor://localhost` | origin của app Android/iOS |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `GEMINI_MODEL_NAME` | `gemini-2.5-flash` | |
| `USE_LLM` | `true` | |
| `SEED_DEMO_ACCOUNTS` | `true` | tạo 3 tài khoản demo **một lần** (đặt `false` nếu không muốn) |
| `ADMIN_USERNAME` | *tên admin của bạn* | ví dụ `admin` |
| `ADMIN_EMAIL` | *email admin* | |
| `ADMIN_PASSWORD` | *mật khẩu admin mạnh* | |

5. Bấm **Deploy Web Service**. Theo dõi tab **Logs** (3–8 phút lần đầu). Thành công khi thấy:

   ```
   ✅ THÀNH CÔNG: Đã đồng bộ an toàn 504 món ăn ...
   ✅ Đã cấp quyền quản trị cho 'admin' (...)
   Uvicorn running on http://0.0.0.0:10000
   ```

   và trạng thái **Live** (chấm xanh).

6. Copy URL ở đầu trang, ví dụ `https://nutrisnap-api.onrender.com`.

**Mỗi lần khởi động, server làm gì?** (`scripts/bootstrap_server.py`)
tạo bảng/cột còn thiếu → cập nhật danh sách món Việt (không đụng dữ liệu người dùng) → nạp USDA nếu bảng còn trống →
tạo tài khoản demo nếu **chưa có** → đảm bảo tài khoản admin có quyền. Chạy lặp lại bao nhiêu lần cũng an toàn.

### Kiểm tra

- Mở `https://nutrisnap-api.onrender.com/docs` → thấy trang API.
- Trong Swagger mở `POST /api/v1/auth/login` → *Try it out* → nhập admin của bạn → phải trả `200` và `"is_admin": true`.
- Vào Neon → **Tables → users** → thấy tài khoản admin (+ 3 tài khoản demo).

> **Bảo mật:** sau lần deploy đầu tiên thành công, bạn có thể xoá biến `ADMIN_PASSWORD` trên Render
> (Environment → biểu tượng thùng rác → Save). Tài khoản admin đã nằm trong DB nên không mất.

---

## Bước 3. (Tuỳ chọn) Đưa dữ liệu USDA lên server

Dữ liệu USDA giúp nhận diện món quốc tế chính xác hơn. Các file zip đang bị `.gitignore` nên server chưa có. Cách nhanh nhất:

```bash
git add -f data/usda/fndds/*.zip data/usda/sr_legacy/*.zip
git commit -m "data: add USDA datasets"
git push
```

Render tự deploy lại và nạp USDA (vì bảng còn trống). Không có USDA app vẫn chạy, món nước ngoài dùng số liệu AI ước tính.

---

## Bước 4. Không cho server "ngủ" (5 phút, khuyên làm)

Render Free tắt server sau 15 phút không có request → lần mở app đầu chờ ~1 phút. Khắc phục miễn phí:

1. https://uptimerobot.com → **Register for FREE**.
2. **+ New monitor** → Monitor type **HTTP(s)** → URL: `https://nutrisnap-api.onrender.com/docs` → Interval **5 minutes** → **Create monitor**.

(750 giờ miễn phí/tháng của Render đủ chạy 1 service liên tục.)

---

## Bước 5. Build APK trỏ tới server (20 phút)

1. Tạo file `src/frontend/.env.production.local`:

   ```env
   VITE_API_BASE_URL=https://nutrisnap-api.onrender.com/api/v1
   VITE_CONTRACT_MODE=warn
   ```

2. Build (không đặt `NUTRISNAP_ANDROID_LAN_DEV`):

   ```bash
   cd src/frontend
   npm run build
   npx cap sync android
   ```

3. Android Studio → **File → Open** → `src/frontend/android` → chờ sync → **Build → Generate Signed App Bundle / APK… → APK**
   → **Create new…** keystore (lưu **ngoài repo**, ví dụ `D:\keys\nutrisnap-release.jks`, ghi lại mật khẩu) → chọn **release** → **Create**.
4. APK ở `src/frontend/android/app/release/app-release.apk`.

Chi tiết từng ô và lỗi thường gặp: xem **Phần 5** của [HUONG_DAN_PUBLIC_APP.md](HUONG_DAN_PUBLIC_APP.md).

### Kiểm tra trên điện thoại thật (dùng 4G, tắt Wi-Fi)

- [ ] Đăng ký tài khoản mới → vào được Dashboard
- [ ] Vào Neon → bảng `users` thấy tài khoản vừa tạo
- [ ] Chụp món ăn, hỏi chatbot hoạt động
- [ ] Render → **Manual Deploy → Restart service** → mở lại app → **vẫn đăng nhập được, dữ liệu còn nguyên** ✅

---

## Bước 6. Phát hành trên GitHub Releases

GitHub repo → **Releases → Draft a new release** → tag `v1.0.0` → kéo thả `NutriSnap-v1.0.0.apk` → **Publish release**.
Link chia sẻ: `https://github.com/<user>/assistant-nutrisnap/releases/latest`.
(Chi tiết: **Phần 6–7** của [HUONG_DAN_PUBLIC_APP.md](HUONG_DAN_PUBLIC_APP.md).)

---

## Bước 7. Quản lý người dùng

### 7.1. Trang Quản trị trong app (cách chính)

1. Đăng nhập bằng tài khoản admin.
2. Bấm **avatar** góc trên bên phải → **Quản trị** (mục này chỉ hiện với admin).
3. Trên trang bạn có:

| Chức năng | Mô tả |
|---|---|
| Thẻ thống kê | Tổng người dùng, đăng ký mới 7 ngày, số người ghi bữa ăn 7 ngày, số bữa ăn, số người đã đặt mục tiêu, số tài khoản bị khoá |
| Tìm kiếm | Theo tên đăng nhập, email, họ tên |
| Bộ lọc | Tất cả / Đang hoạt động / Đã khoá / Quản trị viên |
| **Khoá / Mở khoá** | Người bị khoá bị đăng xuất ngay (kể cả phiên đang mở) và không đăng nhập lại được |
| **Cấp / Gỡ admin** | Thêm người cùng quản trị |
| **Xoá** | Xoá vĩnh viễn tài khoản + mục tiêu, cân nặng, bữa ăn, lịch sử chat (có hộp xác nhận) |

Quy tắc an toàn đã cài sẵn: admin **không thể tự khoá, tự xoá, tự gỡ quyền** của chính mình; người dùng thường gọi API quản trị bị từ chối (403);
trang chỉ hiện **số liệu tổng hợp**, không hiển thị nội dung bữa ăn/tin nhắn riêng tư.

Trên web/emulator khi chạy local cũng dùng được: cấp quyền bằng lệnh ở 7.3 rồi vào `http://localhost:5173/admin`.

### 7.2. Xem dữ liệu thô trên Neon (khi cần)

Neon Dashboard → project `nutrisnap` → **Tables** → chọn bảng (`users`, `meals`, `weight_logs`…).
Hoặc **SQL Editor**, ví dụ:

```sql
-- 20 người đăng ký gần nhất
SELECT id, username, email, is_active, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 20;

-- Số người đăng ký theo ngày
SELECT DATE(created_at) AS ngay, COUNT(*) FROM users GROUP BY 1 ORDER BY 1 DESC;
```

> Hạn chế sửa/xoá trực tiếp ở đây – dùng trang Quản trị để tránh sai sót.

### 7.3. Cấp quyền admin bằng lệnh

```bash
# Cấp quyền cho tài khoản đã đăng ký trong app
python scripts/create_admin.py ten_dang_nhap

# Tạo mới tài khoản admin
python scripts/create_admin.py admin --email admin@example.com --password "MatKhauManh123"

# Gỡ quyền
python scripts/create_admin.py ten_dang_nhap --revoke
```

Mặc định lệnh tác động lên `nutrisnap.db` trên máy. Muốn tác động lên Neon, đặt `DATABASE_URL` như Bước 1 trước khi chạy.
Hoặc đơn giản: đổi `ADMIN_USERNAME` trên Render → Save → server tự cấp quyền khi khởi động lại.

---

## Bước 8. Sao lưu và giới hạn gói miễn phí

| Dịch vụ | Giới hạn Free | Cần làm gì |
|---|---|---|
| Neon | 0,5GB dữ liệu (đủ cho hàng nghìn người dùng), DB tạm ngủ khi rảnh và tự thức (~1 giây) | Không cần làm gì |
| Neon – khôi phục | Có **Point-in-time restore** trong vài giờ gần nhất | Sửa nhầm dữ liệu: Neon → **Restore** |
| Render | 750 giờ/tháng, ngủ sau 15 phút | UptimeRobot (Bước 4) |
| Gemini Free | Giới hạn số request/phút và /ngày cho **cả hệ thống** | Nhiều người dùng → có thể gặp 429; tạo key ở project khác hoặc nâng cấp sau |

**Sao lưu thủ công định kỳ** (khuyên làm mỗi tuần): cài PostgreSQL client rồi chạy

```bash
pg_dump "postgresql://...chuỗi_Neon..." > backup_nutrisnap_2026-11-01.sql
```

Lưu file vào Google Drive cá nhân (file chứa dữ liệu người dùng – **không** đưa lên GitHub).

---

## Bước 9. Quyền riêng tư (nên có khi có người dùng thật)

Dữ liệu cân nặng/ăn uống là dữ liệu sức khỏe nhạy cảm. Trước khi chia sẻ rộng:

- Viết một trang **Chính sách quyền riêng tư** ngắn (ví dụ `PRIVACY.md` trên repo và dán link vào mô tả Release): lưu những gì,
  ảnh món ăn được gửi tới Google Gemini để nhận diện, dữ liệu lưu ở Neon (Singapore), cách yêu cầu xoá tài khoản (liên hệ email của bạn).
- Khi có yêu cầu xoá: dùng nút **Xoá** ở trang Quản trị.
- Không chia sẻ chuỗi `DATABASE_URL`, không xuất dữ liệu người dùng ra ngoài.

---

## Lỗi thường gặp

| Hiện tượng | Cách sửa |
|---|---|
| Render log: `connection ... failed` / `password authentication failed` | Copy lại chuỗi Neon (Bước 1), nhớ có `?sslmode=require` ở cuối |
| Render log: `No module named 'psycopg'` | Kiểm tra `requirements.txt` có dòng `psycopg[binary]>=3.2` và đã push |
| Log: `JWT_SECRET_KEY ... ngắn hơn 32 ký tự` | Tạo lại secret 64 ký tự |
| App: "Không thể kết nối máy chủ" | `VITE_API_BASE_URL` sai (thiếu `/api/v1` hoặc dùng `http`), hoặc chưa `npm run build && npx cap sync android` trước khi build APK |
| Đăng nhập xong lại bị đẩy ra màn hình đăng nhập | Thiếu `AUTH_COOKIE_SECURE=True` / `AUTH_COOKIE_SAMESITE=none` |
| POST bị `403` "nguồn gốc không hợp lệ" | Thiếu/sai `CORS_ORIGINS` (phải đúng `https://localhost,capacitor://localhost`, không có `/` ở cuối) |
| Không thấy mục **Quản trị** trong menu | Tài khoản chưa là admin → 7.3; đăng xuất rồi đăng nhập lại |
| Restart xong mất dữ liệu | `DATABASE_URL` trên Render chưa trỏ tới Neon (vẫn là SQLite) |

---

## Checklist

- [ ] Dọn bảo mật, push code (Bước 0)
- [ ] Tạo Neon, copy chuỗi kết nối (Bước 1)
- [ ] Render: Start Command `bash scripts/start_server.sh`, đủ biến môi trường, trạng thái Live (Bước 2)
- [ ] `/docs` mở được, đăng nhập admin trả `is_admin: true`
- [ ] UptimeRobot (Bước 4)
- [ ] Build APK release với `VITE_API_BASE_URL` của Render (Bước 5)
- [ ] Test 4G + restart server vẫn còn dữ liệu
- [ ] GitHub Release (Bước 6)
- [ ] Vào **Quản trị** thử khoá/mở khoá một tài khoản demo (Bước 7)
