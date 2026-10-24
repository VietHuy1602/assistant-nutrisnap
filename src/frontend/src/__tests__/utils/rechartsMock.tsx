/**
 * src/frontend/src/__tests__/utils/rechartsMock.tsx
 * Recharts ResponsiveContainer mock for jsdom test environments.
 * Section 16.3 of NS-FE-W5-001.
 */

import React from 'react';
import { vi } from 'vitest';

export function setupRechartsMock(): void {
  vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts');
    return {
      ...actual,
      ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
        <div style={{ width: 800, height: 400 }} data-testid="responsive-container">
          {React.isValidElement(children)
            ? React.cloneElement(children, {
                // @ts-expect-error recharts SVG elements accept width/height
                width: 800,
                height: 400,
              })
            : children}
        </div>
      ),
    };
  });
}
