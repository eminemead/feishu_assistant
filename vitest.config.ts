import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Setup file for environment variables
    setupFiles: ['./test/setup.ts'],
    // Use threads for better isolation
    pool: 'threads',
    // Timeout for slow tests
    testTimeout: 30000,
    // Include only vitest-based test files
    include: [
      'test/rules-engine.test.ts',
      'test/doc-snapshots.test.ts',
      'test/doc-supabase-migration.test.ts',
      'test/doc-commands-enhanced.test.ts',
      'test/rules-integration.test.ts',
      'test/doc-snapshot-integration.test.ts',
    ],
  },
});
