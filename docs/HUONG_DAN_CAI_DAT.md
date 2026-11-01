# Hướng dẫn cài đặt NutriSnap sau khi clone từ GitHub

Tài liệu này dành cho người vừa clone repo về máy và muốn chạy app (web + Android).
Làm lần lượt từ trên xuống, mỗi bước chỉ cần làm **một lần** (trừ mục 7 – chạy hằng ngày).

> Nếu bạn chỉ muốn **dùng thử app** mà không cần cài gì, hãy tải file APK ở mục **Releases** của repo
> (nếu tác giả đã deploy server công khai). Tài liệu này dành cho người muốn tự chạy từ mã nguồn.

---

## 1. Cài phần mềm cần thiết

| Phần mềm | Phiên bản | Dùng để | Tải tại |
|---|---|---|---|
| Git | bất kỳ | clone repo | https://git-scm.com/downloads |
| Python | **3.11** (3.12 cũng chạy) | chạy backend FastAPI | https://www.python.org/downloads/ – khi cài nhớ tick **"Add Python to PATH"** |
| Node.js | **20 LTS** trở lên | chạy frontend React/Vite | https://nodejs.org/ |
| Android Studio | bản mới nhất | chỉ cần nếu muốn chạy app Android | https://developer.android.com/studio |
| JDK 21 | 21 | Gradle build APK | Android Studio → *Settings → Build Tools → Gradle → Gradle JDK* → chọn/tải **JetBrains Runtime 21** |

Kiểm tra nhanh trong terminal:

```bash
git --version
python --version
node --version
npm --version
```

> ⚠️ **JDK 25 (mặc định của Android Studio mới) không build được** – sẽ báo lỗi `Unsupported class file major version 69`.
> Bắt buộc chọn JDK 21 cho Gradle như bảng trên.

---

## 2. Clone repo

```bash
git clone https://github.com/<ten-tai-khoan>/assistant-nutrisnap.git
cd assistant-nutrisnap
```

Mọi lệnh bên dưới đều chạy **tại thư mục gốc `assistant-nutrisnap`** trừ khi ghi rõ khác.

---

## 3. Lấy API key Gemini cá nhân (miễn phí)

App dùng Google Gemini cho **chatbot AI coach** và **nhận diện món ăn từ ảnh**. Mỗi người phải dùng key của riêng mình
(key của tác giả không được đưa lên GitHub vì lý do bảo mật).

1. Mở https://aistudio.google.com/ và đăng nhập bằng tài khoản Google.
2. Bấm **Get API key** (góc trái) → **Create API key**.
3. Chọn *Create API key in new project* (hoặc chọn project có sẵn).
4. Sao chép chuỗi key (bắt đầu bằng `AIza...`). **Không chia sẻ key này cho ai, không dán vào code, không commit lên Git.**

Gói miễn phí (free tier) đủ dùng cho đồ án/thử nghiệm, không cần thẻ thanh toán.

> Không có key vẫn chạy được app: đăng nhập, ghi bữa ăn thủ công, tra CSDL món ăn, mục tiêu, thói quen, báo cáo đều hoạt động.
> Chỉ chatbot AI và nhận diện ảnh sẽ báo chưa cấu hình AI.

---

## 4. Tạo file cấu hình `.env` (đây là nơi gắn API key)

### 4.1. Backend – file `.env` ở thư mục gốc

```bash
# Windows (PowerShell hoặc CMD)
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Mở file `.env` vừa tạo bằng VS Code / Notepad và sửa **2 dòng**:

```env
GEMINI_API_KEY=AIza...dán_key_của_bạn_vào_đây...
JWT_SECRET_KEY=chuỗi_ngẫu_nhiên_64_ký_tự
```

Tạo chuỗi ngẫu nhiên cho `JWT_SECRET_KEY` bằng lệnh:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Các dòng còn lại giữ nguyên mặc định. Giải thích các biến quan trọng:

| Biến | Ý nghĩa | Giá trị mặc định nên dùng |
|---|---|---|
| `GEMINI_API_KEY` | key Gemini cá nhân (mục 3) | **bắt buộc điền** |
| `JWT_SECRET_KEY` | khóa ký phiên đăng nhập | **bắt buộc đổi** |
| `DATABASE_URL` | nơi lưu CSDL | `sqlite:///./nutrisnap.db` |
| `APP_ENV` | môi trường | `development` |
| `GEMINI_MODEL` / `GEMINI_MODEL_NAME` | model chat | `gemini-2.5-flash` |
| `USE_LLM` | bật/tắt AI | `true` |

> File `.env` đã nằm trong `.gitignore` nên sẽ **không** bị đẩy lên GitHub. Đừng xoá dòng đó khỏi `.gitignore`.

### 4.2. Frontend – file `src/frontend/.env.local`

```bash
# Windows
copy src\frontend\.env.example src\frontend\.env.local

# macOS / Linux
cp src/frontend/.env.example src/frontend/.env.local
```

Nội dung mặc định đã đúng cho chạy web trên máy:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_CONTRACT_MODE=warn
```

Frontend **không** chứa API key Gemini – mọi lời gọi AI đi qua backend.

---

## 5. Cài thư viện

### 5.1. Backend (Python)

```bash
python -m venv .venv
```

Kích hoạt môi trường ảo:

```bash
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Windows CMD
.venv\Scripts\activate.bat

# macOS / Linux
source .venv/bin/activate
```

> PowerShell báo lỗi *running scripts is disabled*? Chạy một lần: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Cài thư viện:

```bash
pip install -r requirements.txt
```

### 5.2. Frontend (Node)

```bash
cd src/frontend
npm install
cd ../..
```

---

## 6. Khởi tạo cơ sở dữ liệu (chỉ làm lần đầu)

Chạy lần lượt (đã kích hoạt `.venv`):

```bash
python scripts/init_db.py               # tạo file nutrisnap.db và các bảng
python scripts/seed_food_references.py  # nạp ~500 món ăn Việt từ data/vn_foods.csv
python scripts/import_usda.py           # (tuỳ chọn) nạp món quốc tế USDA – xem ghi chú dưới
python scripts/seed_demo_accounts.py    # (tuỳ chọn) tạo 3 tài khoản demo có sẵn 30 ngày dữ liệu
```

Về dữ liệu USDA (không bắt buộc, có thể bỏ qua lệnh `import_usda.py`): nếu `data/usda/fndds/` và `data/usda/sr_legacy/` đang trống, tải miễn phí
tại https://fdc.nal.usda.gov/download-datasets – chọn **FNDDS (JSON)** và **SR Legacy (CSV)**, đặt nguyên file `.zip` vào hai thư mục trên rồi chạy lệnh.
Không có USDA thì món nước ngoài sẽ dùng số liệu AI ước tính.

Tài khoản demo (sau khi chạy `seed_demo_accounts.py`): `student_user`, `office_user`, `gym_user` – mật khẩu chung `NutriSnap123`.

---

## 7. Chạy app (làm mỗi lần muốn dùng)

### 7.1. Chạy trên trình duyệt (web)

Mở **2 terminal**.

Terminal 1 – backend (tại thư mục gốc, đã kích hoạt `.venv`):

```bash
python run_backend.py
```

Thấy dòng `Uvicorn running on http://127.0.0.1:8000` là được. Kiểm tra: mở http://localhost:8000/docs.

Terminal 2 – frontend:

```bash
cd src/frontend
npm run dev
```

Mở http://localhost:5173 → đăng ký tài khoản mới hoặc đăng nhập tài khoản demo.

### 7.2. Chạy trên Android Emulator

Lần đầu:

1. Mở Android Studio → **More Actions → Virtual Device Manager → Create device** (ví dụ Pixel 7, Android 14+) → bấm ▶ để bật emulator.
2. Chọn JDK 21 cho Gradle (xem mục 1).

Mỗi lần chạy, mở PowerShell tại thư mục gốc:

```powershell
.\scripts\dev_android.ps1
```

Script sẽ tự bật backend, build frontend, sync sang Android và mở Android Studio. Trong Android Studio bấm **Run ▶** (Shift+F10).

Cách thủ công (mọi hệ điều hành):

```bash
# Terminal 1 – backend phải lắng nghe mọi địa chỉ để emulator truy cập được
python -m uvicorn src.backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2
cd src/frontend
npm run android:open
```

Emulator gọi máy tính qua địa chỉ `10.0.2.2:8000` (đã cấu hình sẵn trong script).

**Điện thoại thật** (cùng Wi-Fi với máy tính): đặt `VITE_API_BASE_URL=http://<IP-LAN-máy-tính>:8000/api/v1`
(xem IP bằng `ipconfig` / `ifconfig`), mở cổng 8000 trên tường lửa, bật *USB debugging* trên điện thoại rồi Run.

**Gõ tiếng Việt trên emulator:** Settings → System → Keyboard → Gboard → Languages → thêm *Tiếng Việt (Telex)*.

---

## 8. Chạy test (tuỳ chọn)

```bash
pytest                       # backend (thư mục gốc, đã bật .venv)
cd src/frontend && npm test  # frontend
```

Test backend **không** gọi Gemini thật (key bị tắt tự động trong test) nên không tốn quota.

---

## 9. Lỗi thường gặp

| Hiện tượng | Nguyên nhân & cách sửa |
|---|---|
| App báo **"Không thể kết nối máy chủ"** | Backend chưa chạy, hoặc trên emulator backend chạy với `127.0.0.1` thay vì `0.0.0.0`. Kiểm tra http://localhost:8000/docs. |
| `[WinError 10013]` / cổng 8000 bị chiếm | `python scripts/free_port.py` rồi chạy lại. |
| Chatbot/nhận diện ảnh không hoạt động, badge AI báo lỗi | Chưa điền `GEMINI_API_KEY` trong `.env`, hoặc điền xong chưa khởi động lại backend. |
| Lỗi `429 RESOURCE_EXHAUSTED` | Hết quota miễn phí trong phút/ngày – đợi một lúc. App tự chuyển model dự phòng. |
| Lỗi `API key not valid` | Key sai/đã bị xoá – tạo key mới ở mục 3. |
| Gradle: `Unsupported class file major version 69` | Đang dùng JDK 25 – đổi Gradle JDK sang 21. |
| Chụp ảnh không ra món | Ảnh không phải món ăn (app sẽ báo chụp lại), hoặc thiếu key Gemini. |
| `ModuleNotFoundError` | Chưa kích hoạt `.venv` hoặc chưa `pip install -r requirements.txt`. |
| `npm` báo lỗi khi `npm install` | Kiểm tra Node ≥ 20; xoá `src/frontend/node_modules` rồi cài lại. |

---

## 10. Tóm tắt nhanh (checklist)

- [ ] Cài Git, Python 3.11, Node 20, (Android Studio + JDK 21)
- [ ] `git clone` repo
- [ ] Lấy key Gemini tại aistudio.google.com
- [ ] `copy .env.example .env` → điền `GEMINI_API_KEY`, `JWT_SECRET_KEY`
- [ ] `copy src\frontend\.env.example src\frontend\.env.local`
- [ ] Tạo `.venv`, `pip install -r requirements.txt`, `npm install` trong `src/frontend`
- [ ] Chạy 4 script khởi tạo dữ liệu (mục 6)
- [ ] `python run_backend.py` + `npm run dev` → mở http://localhost:5173
