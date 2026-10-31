// Build + sync the debug Android app against an HTTP backend on the emulator host or LAN.
// Usage: npm run android:lan            (build + cap sync)
//        npm run android:open           (build + cap sync + open Android Studio)
// Reads VITE_API_BASE_URL from .env.local / .env (same files Vite uses for `npm run build`).
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openStudio = process.argv.includes('--open');

function fail(message) {
  console.error(`\n[android-lan] ${message}\n`);
  process.exit(1);
}

const raw = loadEnv('production', root, 'VITE_').VITE_API_BASE_URL;
if (!raw) fail('Thiếu VITE_API_BASE_URL trong src/frontend/.env.local (ví dụ: http://10.0.2.2:8000/api/v1).');

let api;
try { api = new URL(raw); } catch { fail(`VITE_API_BASE_URL không hợp lệ: ${raw}`); }
if (api.protocol !== 'http:') fail('Chế độ LAN debug cần VITE_API_BASE_URL dạng http://.');
if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(api.hostname)) {
  fail(
    `VITE_API_BASE_URL đang trỏ tới ${api.hostname}: trên Android đó là chính điện thoại/emulator, không phải PC.\n` +
    '  - Emulator: dùng http://10.0.2.2:8000/api/v1\n' +
    '  - Điện thoại thật: dùng http://<IP-LAN-của-PC>:8000/api/v1 (xem bằng lệnh ipconfig)',
  );
}

const env = { ...process.env, NUTRISNAP_ANDROID_LAN_DEV: '1' };
function run(command) {
  console.log(`\n[android-lan] > ${command}`);
  const res = spawnSync(command, { cwd: root, env, stdio: 'inherit', shell: true });
  if (res.status !== 0) fail(`Lệnh thất bại: ${command}`);
}

run('npm run build');
run('npx cap sync android');

const origin = `http://${api.hostname}`;
console.log(`
[android-lan] Xong. App sẽ gọi API tại ${api.origin}${api.pathname}
  Backend (.env ở thư mục gốc) cần:  APP_ENV=development  và  DEV_MOBILE_ORIGIN=${origin}
  Chạy backend:  python run_backend.py --host ${api.hostname === '10.0.2.2' ? '127.0.0.1' : '0.0.0.0'} --port ${api.port || 80}`);

if (openStudio) run('npx cap open android');
