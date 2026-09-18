import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  },
]

const sandboxRuntimeHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'; worker-src 'none'",
  },
  { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
]

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
  serverExternalPackages: ['typescript', 'shiki'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sandbox-runtime/:file*', headers: sandboxRuntimeHeaders },
    ]
  },
}

const withMDX = createMDX()

export default withMDX(config)
