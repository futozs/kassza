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
    'delegation/index': 'src/delegation/index.ts',
    'reports/index': 'src/reports/index.ts',
    'payments/index': 'src/payments/index.ts',
    'payments/stripe': 'src/payments/stripe.ts',
    'payments/simplepay': 'src/payments/simplepay.ts',
    'payments/barion': 'src/payments/barion.ts',
    'payments/revolut': 'src/payments/revolut.ts',
    'payments/paypal': 'src/payments/paypal.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'neutral',
  target: 'es2023',
  clean: true,
  sourcemap: false,
  deps: { neverBundle: [/^node:/] },
})
