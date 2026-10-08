import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/e2e/live.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
})
