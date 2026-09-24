import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15000,
    // Les écrans sont couverts par les parcours Playwright (e2e/) ; ici, la logique pure.
    coverage: { include: ['src/lib/**'], exclude: ['src/lib/api.ts', 'src/lib/partner.tsx', 'src/lib/config.ts'], thresholds: { lines: 80, functions: 80, branches: 70 } },
  },
});
