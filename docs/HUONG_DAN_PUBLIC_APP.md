# Hướng dẫn chi tiết: Public NutriSnap để ai cũng dùng được (không cần API key)

Mục tiêu: người khác **chỉ cần tải file APK về cài là dùng được ngay**, không cần clone, không cần cài Python,
không cần API key. API key Gemini của bạn **nằm trên server**, không bao giờ xuất hiện trên GitHub hay trong APK.

```
 Điện thoại người dùng (APK)  ──HTTPS──▶  Server backend (Render)  ──▶  Google Gemini
   không chứa key                          GEMINI_API_KEY ở đây          (dùng key của bạn)
```

Tổng thời gian: khoảng 1–2 giờ cho lần đầu. Tất cả dịch vụ dùng **gói miễn phí**.

---

## Phần 0. Hiểu trước các giới hạn của gói miễn phí

| Vấn đề | Ảnh hưởng | Cách xử lý trong hướng dẫn này |
|---|---|---|
| Render Free "ngủ" sau 15 phút không có ai dùng | Lần mở app đầu tiên chờ ~30–60 giây | Chấp nhận, hoặc dùng UptimeRobot ping (Phần 8) |
| Ổ đĩa Render Free bị xoá mỗi lần server khởi động lại/deploy | Tài khoản người dùng tự đăng ký sẽ mất | Mỗi lần khởi động tự nạp lại món ăn + tài khoản demo; muốn giữ lâu dài xem Phần 9 |
| Quota Gemini free (theo phút/ngày) dùng chung cho mọi người dùng | Nhiều người dùng cùng lúc có thể gặp lỗi 429 | Đủ cho demo đồ án; app đã tự chuyển model dự phòng |

Với đồ án môn học/demo, các giới hạn này chấp nhận được.

---

## Phần 1. Dọn dẹp bảo mật TRƯỚC khi public repo (bắt buộc)

### 1.1. Kiểm tra key đã từng bị commit chưa

Trong thư mục gốc dự án chạy:

```bash
git log --all -p -S "AIza" --oneline
```

Lệnh này liệt kê mọi commit từng chứa chuỗi `AIza` (đầu của API key Google).

> ⚠️ **Lịch sử repo hiện tại có chứa 1 API key Google** (commit `119fc18`, file test vision – dòng `get_gemini_vision_model(api_key="AIzaSyDu...")`).
> Key này **khác** key bạn đang dùng trong `.env`, nhưng vẫn phải xử lý:
> 1. Vào https://aistudio.google.com/apikey (hoặc https://console.cloud.google.com/apis/credentials) → tìm key bắt đầu bằng `AIzaSyDu` → **Delete**.
>    Nếu không thấy trong tài khoản của bạn thì có thể là key của thành viên khác – báo họ xoá.
> 2. Khi key đã bị xoá thì để nó nằm trong lịch sử cũng vô hại – **không cần** viết lại lịch sử git.

### 1.2. Kiểm tra các file không được đưa lên

```bash
git check-ignore -v .env nutrisnap.db src/frontend/.env.local
```

Cả 3 file phải hiện ra (nghĩa là đã bị bỏ qua). Nếu thiếu dòng nào, thêm tên file đó vào `.gitignore`.

```bash
git ls-files | grep -iE "\.env$|\.db$|\.jks$|\.keystore$"
```

Lệnh này **không được in ra gì**. Nếu có file nào, gỡ khỏi git (file vẫn giữ trên máy):

```bash
git rm --cached <ten-file>
git commit -m "chore: stop tracking secret/local files"
```

### 1.3. Tạo key Gemini riêng cho server

Nên dùng **key mới** chỉ dành cho server (để nếu lộ thì xoá key đó mà không ảnh hưởng máy bạn):
https://aistudio.google.com/apikey → **Create API key** → lưu tạm vào Notepad (lát dán vào Render).

### 1.4. Chuyển repo sang Public

GitHub → repo → **Settings → General** → kéo xuống cuối **Danger Zone → Change repository visibility → Make public**.

> Render cũng deploy được repo **Private**, nên bạn có thể làm Phần 2–7 trước rồi mới public.

---

## Phần 2. Sửa code để chạy được trên server thật

> ✅ **Đã làm sẵn trong code** (biến `CORS_ORIGINS`, `scripts/start_server.sh`, hỗ trợ Postgres). Cách deploy miễn phí có lưu
> người dùng vĩnh viễn và trang Quản trị: xem [HUONG_DAN_DEPLOY_MIEN_PHI.md](HUONG_DAN_DEPLOY_MIEN_PHI.md). Phần dưới chỉ để tham khảo.

Có 3 chỗ phải sửa.

### 2.1. Cho phép app Android/web gọi server (CORS)

Hiện `src/backend/main.py` chỉ cho phép `localhost:5173`. App Android (Capacitor) gửi request từ origin `https://localhost`,
nên server thật sẽ chặn. Sửa đoạn `allow_origins` để đọc thêm danh sách từ biến môi trường:

```python
import os  # đầu file, nếu chưa có

EXTRA_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *settings.mobile_dev_origins,
        *EXTRA_ORIGINS,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Trên server sẽ đặt `CORS_ORIGINS=https://localhost,capacitor://localhost` (Phần 4).

### 2.2. Cookie đăng nhập hoạt động qua HTTPS khác domain

App ở `https://localhost`, server ở `https://xxx.onrender.com` → khác site, nên cookie phải là `SameSite=None; Secure`.
Không cần sửa code – chỉ đặt biến môi trường trên server (Phần 4):

```
AUTH_COOKIE_SECURE=True
AUTH_COOKIE_SAMESITE=none
```

### 2.3. Script khởi động server

Tạo file `scripts/start_server.sh` ở repo:

```bash
#!/usr/bin/env bash
# Khởi động backend trên Render: tạo bảng, nạp dữ liệu món ăn + demo, rồi chạy API.
set -e
python scripts/init_db.py
python scripts/seed_food_references.py
python scripts/import_usda.py || echo "Bỏ qua USDA (không có dữ liệu)"
python scripts/seed_demo_accounts.py || echo "Bỏ qua tài khoản demo"
exec python -m uvicorn src.backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
```

Sau đó:

```bash
git add scripts/start_server.sh src/backend/main.py
git commit -m "feat(deploy): production CORS and start script"
git push
```

### 2.4. (Tuỳ chọn) Đưa dữ liệu USDA lên repo

Các file zip USDA (~10MB) đang bị `.gitignore` bỏ qua nên server sẽ không có. Muốn server nhận diện món quốc tế chuẩn hơn:

```bash
git add -f data/usda/fndds/*.zip data/usda/sr_legacy/*.zip
git commit -m "data: add USDA datasets for deployment"
git push
```

(Dữ liệu USDA là public domain, được phép đưa lên.)

---

## Phần 3. Tạo tài khoản Render

1. Vào https://render.com → **Get Started for Free**.
2. Chọn **Sign up with GitHub** → cho phép Render truy cập.
3. Khi được hỏi quyền repo: chọn **Only select repositories** → chọn `assistant-nutrisnap` → **Install**.

Không cần thẻ thanh toán cho gói Free.

---

## Phần 4. Deploy backend lên Render

1. Trong Dashboard Render bấm **+ New → Web Service**.
2. Chọn repo `assistant-nutrisnap` → **Connect**.
3. Điền cấu hình:

| Ô | Giá trị |
|---|---|
| Name | `nutrisnap-api` (sẽ thành `https://nutrisnap-api.onrender.com`; nếu trùng tên Render thêm đuôi ngẫu nhiên) |
| Region | **Singapore** (gần Việt Nam nhất) |
| Branch | `main` |
| Root Directory | *(để trống)* |
| Runtime / Language | **Python 3** |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `bash scripts/start_server.sh` |
| Instance Type | **Free** |

4. Kéo xuống **Environment Variables** → bấm **Add Environment Variable** và thêm từng dòng:

| Key | Value |
|---|---|
| `PYTHON_VERSION` | `3.11.9` |
| `GEMINI_API_KEY` | *key tạo ở bước 1.3* |
| `JWT_SECRET_KEY` | *chạy `python -c "import secrets; print(secrets.token_hex(32))"` trên máy rồi dán kết quả* |
| `APP_ENV` | `production` |
| `DEBUG` | `False` |
| `DATABASE_URL` | `sqlite:///./nutrisnap.db` |
| `AUTH_COOKIE_SECURE` | `True` |
| `AUTH_COOKIE_SAMESITE` | `none` |
| `CORS_ORIGINS` | `https://localhost,capacitor://localhost` |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` |
| `GEMINI_MODEL_NAME` | `gemini-flash-lite-latest` |
| `USE_LLM` | `true` |

   > Đây chính là nơi API key "sống". Render mã hoá và không hiển thị công khai. **Không** đặt key vào file nào trong repo.

5. Bấm **Deploy Web Service**. Màn hình log hiện quá trình cài đặt (3–8 phút).
6. Thành công khi log có dòng `Uvicorn running on http://0.0.0.0:10000` và trạng thái chuyển **Live** (chấm xanh).
7. Sao chép URL ở đầu trang, ví dụ `https://nutrisnap-api.onrender.com`.

### Kiểm tra server

Mở trình duyệt:

- `https://nutrisnap-api.onrender.com/docs` → phải thấy trang Swagger của NutriSnap.
- Thử `POST /api/v1/auth/login` trong Swagger với `gym_user` / `NutriSnap123` → trả về 200.

Deploy lỗi? Xem tab **Logs**. Lỗi thường gặp ở Phần 10.

---

## Phần 5. Build APK trỏ tới server thật

Làm trên máy của bạn, tại thư mục `src/frontend`.

### 5.1. Tạo file cấu hình production

Tạo file `src/frontend/.env.production.local` (file này bị gitignore, không lên GitHub – mà cũng không chứa bí mật):

```env
VITE_API_BASE_URL=https://nutrisnap-api.onrender.com/api/v1
VITE_CONTRACT_MODE=warn
```

(Thay bằng URL thật của bạn ở Phần 4, nhớ có `/api/v1` ở cuối, **không** có `/` thừa.)

### 5.2. Build và sync

**Không** đặt `NUTRISNAP_ANDROID_LAN_DEV` (đó là chế độ HTTP cho emulator). Chạy:

```bash
cd src/frontend
npm run build
npx cap sync android
```

### 5.3. Tạo khoá ký (keystore) – chỉ làm 1 lần

Android chỉ cài APK đã ký. Trong Android Studio:

1. **File → Open** → chọn thư mục `src/frontend/android` → chờ Gradle sync xong.
2. Menu **Build → Generate Signed App Bundle / APK…** → chọn **APK** → **Next**.
3. Ở *Key store path* bấm **Create new…**:
   - Key store path: chọn chỗ **ngoài repo**, ví dụ `D:\keys\nutrisnap-release.jks`
   - Password: đặt mật khẩu và **ghi lại cẩn thận**
   - Alias: `nutrisnap`, Password của key (có thể giống trên), Validity: `25` năm
   - Certificate: điền First and Last Name (tên bạn), các ô khác tuỳ ý
   - **OK**

> ⚠️ Mất file `.jks` hoặc quên mật khẩu = không thể phát hành bản cập nhật cho người đã cài (họ phải gỡ app cũ).
> **Không bao giờ commit file `.jks` lên GitHub.** Sao lưu nó vào Google Drive riêng.

### 5.4. Build APK release

1. Vẫn trong hộp thoại, chọn keystore vừa tạo, nhập mật khẩu → **Next**.
2. Build Variants: chọn **release** → **Create**.
3. Xong sẽ có thông báo *locate* → file APK nằm ở `src/frontend/android/app/release/app-release.apk`.

> Gradle báo `Unsupported class file major version 69`? **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** → chọn JDK 21.

### 5.5. Thử APK trên điện thoại thật

1. Copy `app-release.apk` sang điện thoại (Zalo/Drive/cáp USB).
2. Mở file → cho phép *Cài ứng dụng không rõ nguồn gốc* → **Cài đặt**.
3. Tắt Wi-Fi, dùng 4G để chắc chắn app gọi server thật (không phải máy tính) → đăng nhập `gym_user` / `NutriSnap123`.
4. Thử: xem Dashboard, chụp ảnh món ăn, hỏi chatbot.

Lần đầu mở có thể chờ ~1 phút vì server Render đang "thức dậy".

---

## Phần 6. Phát hành APK trên GitHub Releases

1. Đổi tên file cho dễ nhận: `NutriSnap-v1.0.0.apk`.
2. Vào repo trên GitHub → cột phải **Releases → Create a new release** (hoặc `https://github.com/<user>/assistant-nutrisnap/releases/new`).
3. **Choose a tag** → gõ `v1.0.0` → **Create new tag**.
4. Release title: `NutriSnap v1.0.0`.
5. Mô tả, ví dụ:

   ```markdown
   ## Cài đặt
   1. Tải file **NutriSnap-v1.0.0.apk** bên dưới về điện thoại Android (8.0+).
   2. Mở file, cho phép cài từ nguồn không xác định, bấm Cài đặt.
   3. Đăng ký tài khoản mới hoặc dùng thử: `gym_user` / `NutriSnap123`.

   Lưu ý: lần mở đầu có thể chờ ~1 phút (server miễn phí đang khởi động).
   Dữ liệu tài khoản tự tạo có thể bị đặt lại khi server khởi động lại.
   ```

6. Kéo thả file `.apk` vào ô **Attach binaries**, chờ upload xong.
7. Bấm **Publish release**.

Link tải cố định để gửi mọi người: `https://github.com/<user>/assistant-nutrisnap/releases/latest`

---

## Phần 7. Cập nhật README

Thêm lên đầu `README.md` để khách vào repo thấy ngay:

```markdown
## 📱 Dùng thử ngay
Tải APK: [NutriSnap mới nhất](https://github.com/<user>/assistant-nutrisnap/releases/latest) – không cần cài đặt gì thêm.

## 🛠️ Tự chạy từ mã nguồn
Xem [docs/HUONG_DAN_CAI_DAT.md](docs/HUONG_DAN_CAI_DAT.md) (cần API key Gemini cá nhân miễn phí).
```

Commit và push.

---

## Phần 8. (Tuỳ chọn) Giữ server không "ngủ"

1. Đăng ký https://uptimerobot.com (miễn phí).
2. **Add New Monitor** → Type: **HTTP(s)** → URL: `https://nutrisnap-api.onrender.com/docs` → Interval: **5 minutes** → **Create**.

Server sẽ luôn thức nên app mở nhanh. (Gói Free của Render có 750 giờ/tháng – đủ chạy 1 service liên tục.)

---

## Phần 9. (Tuỳ chọn) Giữ dữ liệu người dùng lâu dài

Gói Free xoá file `nutrisnap.db` mỗi lần server khởi động lại. Các lựa chọn:

| Cách | Chi phí | Ghi chú |
|---|---|---|
| Render **Starter** + **Persistent Disk** 1GB | ~7–8 USD/tháng | Đơn giản nhất: Settings → Disks → Mount path `/var/data`, đặt `DATABASE_URL=sqlite:////var/data/nutrisnap.db` |
| Fly.io + Volume | Có phần miễn phí, cần thẻ | Cấu hình bằng CLI `fly launch` |
| Postgres miễn phí (Neon/Supabase) | 0 đ | Cần sửa code: thêm `psycopg[binary]` và thay các câu SQL UPSERT riêng của SQLite trong script seed |

Với đồ án/demo, giữ gói Free + tài khoản demo tự nạp lại là đủ.

---

## Phần 10. Lỗi thường gặp khi deploy

| Hiện tượng | Cách sửa |
|---|---|
| Render build lỗi `No matching distribution` | Kiểm tra biến `PYTHON_VERSION=3.11.9` |
| Log: `ValidationError ... JWT_SECRET_KEY` | Thiếu biến môi trường – xem lại bảng Phần 4 |
| App báo **"Không thể kết nối máy chủ"** | Sai `VITE_API_BASE_URL` (thiếu `/api/v1`, có `http` thay vì `https`), hoặc quên `npm run build` + `npx cap sync` trước khi build APK. Mở `<URL>/docs` trên trình duyệt điện thoại để chắc server sống |
| Đăng nhập thành công nhưng màn hình sau báo 401 | Cookie bị chặn: kiểm tra `AUTH_COOKIE_SECURE=True`, `AUTH_COOKIE_SAMESITE=none` |
| Lỗi CORS trong log/console | Thiếu `CORS_ORIGINS` hoặc chưa làm bước 2.1 |
| Chatbot báo lỗi 429 | Hết quota Gemini miễn phí – chờ hoặc tạo key ở project Google khác |
| Chatbot báo key không hợp lệ | Sửa `GEMINI_API_KEY` trong Render → **Environment → Save Changes** (Render tự deploy lại) |
| Không cài được APK ("App not installed") | Đang có bản debug cài sẵn với chữ ký khác → gỡ app cũ rồi cài lại |
| Lần đầu mở app chờ rất lâu | Server Free đang thức dậy (~1 phút) – xem Phần 8 |

---

## Phần 11. Khi sửa code và muốn phát hành bản mới

1. Sửa code → `git push` lên `main` → Render **tự deploy lại** backend.
2. Nếu có thay đổi giao diện/app: tăng `versionCode` và `versionName` trong `src/frontend/android/app/build.gradle`
   (ví dụ `versionCode 2`, `versionName "1.0.1"`).
3. `npm run build && npx cap sync android` → Build Signed APK **bằng đúng keystore cũ**.
4. Tạo Release mới `v1.0.1` và đính kèm APK. Người dùng tải về cài đè, không mất dữ liệu trên máy.

---

## Checklist tổng

- [ ] Xoá key `AIzaSyDu...` trong lịch sử (1.1), kiểm tra `.env`/`.db` không bị track (1.2)
- [ ] Tạo key Gemini riêng cho server (1.3)
- [ ] Sửa CORS + thêm `scripts/start_server.sh`, push (Phần 2)
- [ ] Deploy Render, điền biến môi trường, `/docs` mở được (Phần 3–4)
- [ ] `.env.production.local` → build → sync → APK ký release (Phần 5)
- [ ] Test APK bằng 4G trên điện thoại thật
- [ ] Tạo GitHub Release đính kèm APK (Phần 6), cập nhật README (Phần 7)
- [ ] Chuyển repo sang Public (1.4)
