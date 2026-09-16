import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'money/index': 'src/money/index.ts',
    'validators/index': 'src/validators/index.ts',
    'ipn/index': 'src/ipn/index.ts',
    'storage/index': 'src/storage/index.ts',
    'storage/fs': 'src/storage/fs.ts',
    'cookie-stores/index': 'src/cookie-stores/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'neutral',
  target: 'es2023',
  clean: true,
  sourcemap: false,
  deps: { neverBundle: [/^node:/] },
})
