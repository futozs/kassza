'use client'

import {
  Calculator,
  Check,
  Clock,
  type LucideIcon,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { LogoMark } from '@/components/site/logo'
import {
  DONE_AT_MS,
  PRINT_AT_MS,
  PRINT_MS,
  SEND_AT_MS,
  SEND_MS,
  TIMED_CODE,
  type TimedLine,
} from './hero-code'

export interface HeroInvoice {
  readonly number: string
  readonly buyerName: string
  readonly itemName: string
  readonly itemLine: string
  readonly vatLabel: string
  readonly vat: string
  readonly gross: string
  readonly grossValue: number
}

interface Perk {
  readonly id: string
  readonly icon: LucideIcon
  readonly label: string
}

const PERKS: readonly Perk[] = [
  { id: 'time', icon: Clock, label: 'Magyar idő' },
  { id: 'round', icon: Calculator, label: 'Fillérre pontos' },
  { id: 'once', icon: ShieldCheck, label: 'Nincs dupla számla' },
  { id: 'errors', icon: MessageSquareText, label: 'Magyar hibaüzenetek' },
]

const VISIBLE_SHARE = 0.08
const COUNT_DELAY_MS = 120
const COUNT_MS = 450
const PRINT_ANIMATION = 'hs-print'

const huf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0, useGrouping: 'always' })

const timeline = {
  '--t-send': `${SEND_AT_MS}ms`,
  '--t-print': `${PRINT_AT_MS}ms`,
  '--t-done': `${DONE_AT_MS}ms`,
  '--send-ms': `${SEND_MS}ms`,
  '--print-ms': `${PRINT_MS}ms`,
} as CSSProperties

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function findAnimation(root: HTMLElement, name: string): CSSAnimation | undefined {
  return root
    .getAnimations({ subtree: true })
    .find(
      (animation): animation is CSSAnimation =>
        animation instanceof CSSAnimation && animation.animationName === name,
    )
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

function useCountUp(
  scene: HTMLElement | null,
  target: HTMLElement | null,
  value: number,
  playing: boolean,
) {
  useEffect(() => {
    if (!playing || !scene || !target || prefersReducedMotion()) return
    const animation = findAnimation(scene, PRINT_ANIMATION)
    if (!animation) return
    const final = `${huf.format(value)} Ft`
    let frame = 0
    const tick = () => {
      const elapsed = Number(animation.currentTime ?? 0) - PRINT_AT_MS - COUNT_DELAY_MS
      const progress = Math.min(1, Math.max(0, elapsed / COUNT_MS))
      target.textContent =
        progress >= 1 ? final : `${huf.format(Math.round(value * easeOutCubic(progress)))} Ft`
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(frame)
      target.textContent = final
    }
  }, [scene, target, value, playing])
}

function usePlayWhenVisible(node: HTMLElement | null): boolean {
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setPlaying(true)
        observer.disconnect()
      },
      { threshold: VISIBLE_SHARE },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return playing
}

function CodeLine({ line }: { line: TimedLine }) {
  if (line.chars === 0) return <span className="hs-line hs-line--blank">{' '}</span>
  return (
    <span
      className="hs-line"
      style={
        {
          '--delay': `${line.delay}ms`,
          '--dur': `${line.duration}ms`,
          '--n': line.chars,
        } as CSSProperties
      }
    >
      {line.tokens.map((token) => (
        <span key={token.id} className={`hs-tok hs-tok--${token.kind}`}>
          {token.text}
        </span>
      ))}
    </span>
  )
}

function CodeWindow({ invoiceNumber }: { invoiceNumber: string }) {
  return (
    <div className="hs-code">
      <div className="hs-code-bar">
        <span className="hs-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="hs-file">szamla.ts</span>
        <span className="hs-status">
          <span className="hs-status-item hs-status-idle">
            <span className="hs-status-dot" />
            TypeScript
          </span>
          <span className="hs-status-item hs-status-send">
            <span className="hs-spinner" />
            Küldés…
          </span>
          <span className="hs-status-item hs-status-done">
            <Check className="size-3.5" strokeWidth={2.6} />
            {invoiceNumber}
          </span>
        </span>
      </div>
      <pre className="hs-pre">
        <code>
          {TIMED_CODE.map((line) => (
            <CodeLine key={line.id} line={line} />
          ))}
        </code>
      </pre>
    </div>
  )
}

function Paper({
  invoice,
  totalRef,
}: {
  invoice: HeroInvoice
  totalRef: (node: HTMLElement | null) => void
}) {
  return (
    <div className="hs-paper">
      <div className="hs-paper-body">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="hs-kicker">Számla</p>
            <p className="hs-number">{invoice.number}</p>
          </div>
          <LogoMark className="size-7 drop-shadow-none" />
        </div>
        <p className="hs-label mt-5">Vevő</p>
        <p className="hs-buyer">{invoice.buyerName}</p>
        <div className="hs-rule" />
        <div className="hs-row hs-row--item">
          <span>{invoice.itemName}</span>
          <span className="tnum">{invoice.gross}</span>
        </div>
        <p className="hs-small tnum">{invoice.itemLine}</p>
        <div className="hs-rule" />
        <div className="hs-row">
          <span>{invoice.vatLabel}</span>
          <span className="tnum">{invoice.vat}</span>
        </div>
        <div className="hs-row hs-row--total">
          <span>Összesen</span>
          <span ref={totalRef} className="tnum">
            {invoice.gross}
          </span>
        </div>
        <span className="hs-stamp">Kiállítva</span>
      </div>
    </div>
  )
}

function PerkChip({ perk, index }: { perk: Perk; index: number }) {
  const Icon = perk.icon
  return (
    <li className={`hs-perk hs-perk--${perk.id}`} style={{ '--k': index } as CSSProperties}>
      <span className="hs-perk-chip">
        <Icon className="size-4 text-accent" strokeWidth={2} />
        {perk.label}
      </span>
    </li>
  )
}

export function HeroStage({ invoice }: { invoice: HeroInvoice }) {
  const [scene, setScene] = useState<HTMLDivElement | null>(null)
  const [total, setTotal] = useState<HTMLElement | null>(null)
  const playing = usePlayWhenVisible(scene)
  useCountUp(scene, total, invoice.grossValue, playing)

  return (
    <div className="hero-stage">
      <p className="sr-only">
        Példa: a kódrészlet egy {invoice.gross} összegű számlát állít ki {invoice.buyerName} részére
        a Számlázz.hu-n. Fillérre pontos összegek, magyar idő, védelem a dupla számla ellen és
        magyar hibaüzenetek.
      </p>
      <div
        ref={setScene}
        className="hs-scene"
        style={timeline}
        data-play={playing || undefined}
        aria-hidden="true"
      >
        <CodeWindow invoiceNumber={invoice.number} />
        <div className="hs-device">
          <div className="hs-printer">
            <span className="hs-led" />
            <span className="hs-slot" />
          </div>
          <div className="hs-paper-clip">
            <Paper invoice={invoice} totalRef={setTotal} />
          </div>
        </div>
        <ul className="hs-perks">
          {PERKS.map((perk, index) => (
            <PerkChip key={perk.id} perk={perk} index={index} />
          ))}
        </ul>
      </div>
    </div>
  )
}
