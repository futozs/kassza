'use client'

import { Bot, Check, Unplug, User } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { EASE_OUT_EXPO } from './reveal'

export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.16, delayChildren: 0.25 } },
}

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: EASE_OUT_EXPO },
  },
}

export interface FeatureData {
  readonly orderNumber: string
  readonly invoiceNumber: string
  readonly netUnitPrice: string
  readonly quantity: number
  readonly net: string
  readonly vatLabel: string
  readonly vat: string
  readonly gross: string
  readonly errorCode: number
  readonly errorCount: number
  readonly errorMessage: string
  readonly errorHint: string
}

type Tone = 'neutral' | 'danger' | 'ok'

function FlowRow({ label, status, tone }: { label: string; status: ReactNode; tone: Tone }) {
  return (
    <motion.li variants={itemVariants} className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn('fv-node', `fv-node--${tone}`)} />
        <code className="truncate font-mono text-[0.8rem] text-ink">{label}</code>
      </span>
      <span className={cn('fv-badge', `fv-badge--${tone}`)}>{status}</span>
    </motion.li>
  )
}

export function DuplicateVisual({ data }: { data: FeatureData }) {
  return (
    <motion.ol variants={listVariants} className="fv-flow flex flex-col gap-4">
      <FlowRow tone="neutral" label={`invoices.create('${data.orderNumber}')`} status="elküldve" />
      <FlowRow
        tone="danger"
        label="válasz"
        status={
          <>
            <Unplug className="size-3" />
            megszakadt
          </>
        }
      />
      <FlowRow tone="neutral" label={`lekérdezés: ${data.orderNumber}`} status="megvan" />
      <FlowRow
        tone="ok"
        label={data.invoiceNumber}
        status={
          <>
            <Check className="size-3" strokeWidth={3} />
            már kész
          </>
        }
      />
      <motion.li variants={itemVariants} className="fv-verdict">
        1 számla. <span className="text-muted">Nem kettő.</span>
      </motion.li>
    </motion.ol>
  )
}

export function RoundingVisual({ data }: { data: FeatureData }) {
  const rows = [
    { op: '', label: 'nettó egységár', value: data.netUnitPrice },
    { op: '×', label: `${data.quantity} db`, value: data.net },
    { op: '+', label: data.vatLabel, value: data.vat },
  ]
  return (
    <motion.dl variants={listVariants} className="flex flex-col font-mono text-[0.82rem]">
      {rows.map((row) => (
        <motion.div
          key={row.label}
          variants={itemVariants}
          className="flex items-baseline justify-between gap-3 py-1.5"
        >
          <dt className="flex gap-2 text-muted">
            <span className="w-3 text-accent">{row.op}</span>
            {row.label}
          </dt>
          <dd className="tnum text-ink">{row.value}</dd>
        </motion.div>
      ))}
      <motion.div
        variants={itemVariants}
        className="mt-2 flex items-baseline justify-between border-t border-rule-strong pt-3"
      >
        <dt className="flex gap-2 text-muted">
          <span className="w-3 text-accent">=</span>
          bruttó
        </dt>
        <dd className="tnum font-display text-[1.6rem] font-bold tracking-[-0.01em] text-accent">
          {data.gross}
        </dd>
      </motion.div>
    </motion.dl>
  )
}

export function TimezoneVisual() {
  return (
    <motion.div variants={listVariants} className="flex flex-col gap-3">
      <motion.div variants={itemVariants} className="fv-clock">
        <span className="fv-clock-zone">UTC</span>
        <span className="tnum font-mono text-[1.05rem] text-muted line-through decoration-rule-strong">
          2026-10-07
        </span>
        <span className="tnum font-mono text-[0.8rem] text-muted">22:30</span>
      </motion.div>
      <motion.div variants={itemVariants} className="fv-clock fv-clock--active">
        <span className="fv-clock-zone text-accent">Budapest</span>
        <span className="tnum font-mono text-[1.05rem] font-semibold text-ink">2026-10-08</span>
        <span className="tnum font-mono text-[0.8rem] text-ink-2">00:30</span>
      </motion.div>
    </motion.div>
  )
}

export function ErrorVisual({ data }: { data: FeatureData }) {
  return (
    <motion.div variants={listVariants} className="fv-error">
      <motion.div variants={itemVariants} className="flex items-center gap-2">
        <span className="tnum rounded-[var(--radius-sm)] bg-danger-bg px-1.5 py-0.5 font-mono text-[0.75rem] font-semibold text-danger-ink">
          {data.errorCode}
        </span>
        <span className="font-mono text-[0.75rem] text-muted">SzamlazzError</span>
      </motion.div>
      <motion.p variants={itemVariants} className="mt-3 text-[0.95rem] font-semibold text-ink">
        {data.errorMessage}
      </motion.p>
      <motion.p variants={itemVariants} className="mt-2 text-[0.85rem] leading-relaxed text-ink-2">
        {data.errorHint}
      </motion.p>
    </motion.div>
  )
}

function Bubble({ who, children }: { who: 'user' | 'bot'; children: ReactNode }) {
  const Icon = who === 'user' ? User : Bot
  return (
    <motion.li
      variants={itemVariants}
      className={cn('fv-bubble', who === 'user' ? 'fv-bubble--user' : 'fv-bubble--bot')}
    >
      <span className="fv-avatar">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">{children}</span>
    </motion.li>
  )
}

export function AgentVisual({ data }: { data: FeatureData }) {
  return (
    <motion.ul variants={listVariants} className="flex flex-col gap-3">
      <Bubble who="user">Állíts ki számlát Nagy Péternek, 3 póló.</Bubble>
      <Bubble who="bot">
        <code className="fv-tool">preview_invoice</code>
        <span className="mt-1 block text-ink-2">
          Bruttó <strong className="tnum text-ink">{data.gross}</strong>, megerősítésre vár.
        </span>
      </Bubble>
      <Bubble who="user">Mehet.</Bubble>
      <Bubble who="bot">
        <code className="fv-tool">create_invoice</code>
        <span className="mt-1 flex items-center gap-1.5 font-semibold text-ink">
          <Check className="size-3.5 text-accent" strokeWidth={3} />
          {data.invoiceNumber} kiállítva
        </span>
      </Bubble>
    </motion.ul>
  )
}
