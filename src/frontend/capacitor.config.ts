import type { CapacitorConfig } from '@capacitor/cli';
import { loadEnv } from 'vite';

// Explicit opt-in for a debug APK using an HTTP API on the LAN.
// Match the API's site (scheme + host), not its port. Assets remain bundled.
const lanDev = process.env.NUTRISNAP_ANDROID_LAN_DEV === '1';
const apiUrl = lanDev
  ? new URL(loadEnv('production', __dirname, 'VITE_').VITE_API_BASE_URL)
  : undefined;
if (apiUrl && (apiUrl.protocol !== 'http:' || apiUrl.username || apiUrl.password)) {
  throw new Error('LAN debug requires an HTTP VITE_API_BASE_URL without credentials.');
}

const config: CapacitorConfig = {
  appId: 'com.nutrisnap.app',
  appName: 'Nutrisnap',
  webDir: 'dist',
  android: { backgroundColor: '#07152F' },
  ...(apiUrl ? { server: { hostname: apiUrl.hostname, androidScheme: 'http' } } : {}),
};

export default config;
