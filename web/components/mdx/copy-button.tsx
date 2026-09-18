'use client'

import { Check, Copy } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'

function readCode(button: HTMLElement): string {
  const pre = button.closest('.codeblock')?.querySelector('pre')
  if (!pre) return ''
  const lines = [...pre.querySelectorAll<HTMLElement>('.line')]
  if (lines.length === 0) return pre.innerText
  return lines
    .filter((line) => !line.classList.contains('remove'))
    .map((line) => line.textContent ?? '')
    .join('\n')
}

export function CopyButton() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function onClick(event: MouseEvent<HTMLButtonElement>) {
    const text = readCode(event.currentTarget)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="codeblock-copy"
      data-copied={copied}
      aria-label={copied ? 'Kimásolva' : 'Kód másolása'}
      title={copied ? 'Kimásolva' : 'Kód másolása'}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Kimásolva a vágólapra' : ''}
      </span>
    </button>
  )
}
