import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

if (typeof window !== 'undefined') {
  if (typeof URL.createObjectURL === 'undefined') {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (typeof URL.revokeObjectURL === 'undefined') {
    URL.revokeObjectURL = vi.fn();
  }
}

afterEach(() => {
  cleanup();
});

