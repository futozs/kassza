'use client'

import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { LogoMark } from '@/components/site/logo'
import { site } from '@/lib/site'
import { InstallCommand } from './install-command'
import { LandingContainer } from './landing-container'
import { EASE_OUT_EXPO, REVEAL_SECONDS } from './reveal'
import { Wave } from './wave'

const INSTALL_COMMAND = 'npm i kassza'

function useReveal(delay: number) {
  const reduce = useReducedMotion()
  if (reduce) return {}
  return {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: REVEAL_SECONDS, delay, ease: EASE_OUT_EXPO },
  }
}

export function ClosingSection() {
  const logo = useReveal(0)
  const title = useReveal(0.06)
  const install = useReveal(0.12)
  const actions = useReveal(0.18)

  return (
    <section aria-labelledby="kezdd-el">
      <Wave className="text-brand-deep" />
      <div className="bg-brand-deep pt-12 pb-28 sm:pt-16 lg:pb-36">
        <LandingContainer className="flex flex-col items-center text-center">
          <motion.div {...logo}>
            <LogoMark className="closing-logo size-16 sm:size-20" />
          </motion.div>
          <motion.h2 id="kezdd-el" className="closing-title mt-10" {...title}>
            Kezdd el <span className="text-amber">most.</span>
          </motion.h2>
          <motion.div className="mt-10 flex w-full justify-center" {...install}>
            <InstallCommand command={INSTALL_COMMAND} className="install-dark" />
          </motion.div>
          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            {...actions}
          >
            <Link href="/docs/alapok/telepites" className="pill-button pill-button--amber group">
              Dokumentáció
              <ArrowRight
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer"
              className="pill-button pill-button--ghost"
            >
              GitHub
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </motion.div>
        </LandingContainer>
      </div>
      <Wave flip className="bg-surface text-brand-deep" />
    </section>
  )
}
