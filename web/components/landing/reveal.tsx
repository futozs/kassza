'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 1, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  )
}
