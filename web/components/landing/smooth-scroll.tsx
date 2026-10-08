'use client'

import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useEffect } from 'react'

const LERP = 0.11

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ autoRaf: true, lerp: LERP, anchors: true })
    return () => lenis.destroy()
  }, [])
  return null
}
