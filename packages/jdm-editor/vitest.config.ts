import react from '@vitejs/plugin-react-swc';
import { playwright } from '@vitest/browser-playwright';
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), wasm()],
  test: {
    globals: true,
    setupFiles: ['./src/setupTests.js'],
    css: true,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
