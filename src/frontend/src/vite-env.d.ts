/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CONTRACT_MODE?: 'warn' | 'strict';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
