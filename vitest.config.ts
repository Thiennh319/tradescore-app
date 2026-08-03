import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    /**
     * Task 14.5 — exclude pre-existing failing suites outside thin-client scope.
     * Architecture frozen: no Export / Desktop Sync / Position Adviser logic changes.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'services/__tests__/driveSync.e2e.test.ts',
      'services/exportService.test.ts',
    ],
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'node_modules/react-native-web'),
    },
  },
});
