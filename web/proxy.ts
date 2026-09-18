import { type NextRequest, NextResponse } from 'next/server'

const MARKDOWN_PATH = /^\/docs\/(.+)\.md$/

export function proxy(request: NextRequest) {
  const match = MARKDOWN_PATH.exec(request.nextUrl.pathname)
  if (!match) return NextResponse.next()
  return NextResponse.rewrite(new URL(`/docs-md/${match[1]}`, request.url))
}

export const config = {
  matcher: '/docs/:path+.md',
}
