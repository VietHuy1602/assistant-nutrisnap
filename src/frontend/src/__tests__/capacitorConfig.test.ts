import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vite', () => ({ loadEnv: () => ({ VITE_API_BASE_URL: 'http://192.168.50.20:8000/api/v1' }) }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Capacitor LAN debug configuration', () => {
  it('keeps the default secure WebView origin without explicit opt-in', async () => {
    vi.stubEnv('NUTRISNAP_ANDROID_LAN_DEV', '');
    const { default: config } = await import('../../capacitor.config');
    expect(config.server).toBeUndefined();
  });

  it('uses the HTTP API site with bundled assets, without the backend port', async () => {
    vi.stubEnv('NUTRISNAP_ANDROID_LAN_DEV', '1');
    const { default: config } = await import('../../capacitor.config');
    expect(config.server).toEqual({ hostname: '192.168.50.20', androidScheme: 'http' });
    expect(config.webDir).toBe('dist');
  });
});
