import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': import.meta.dirname },
  },
  test: {
    include: ['sandbox/**/*.test.ts', 'lib/**/*.test.ts'],
    environment: 'node',
  },
})
