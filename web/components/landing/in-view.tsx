'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

type MotionState = 'idle' | 'armed' | 'play'

const VISIBLE_SHARE = 0.3

export function InView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<MotionState>('idle')

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setState('armed')
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setState('play')
        observer.disconnect()
      },
      { threshold: VISIBLE_SHARE },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} data-motion={state} className={className}>
      {children}
    </div>
  )
}
