'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsoleEntry, RunResult, WorkerMessage } from '@/sandbox/runtime/protocol'
import type { SimulatedCall } from '@/sandbox/simulator'

export interface SandboxLogEntry extends ConsoleEntry {
  readonly id: number
}

export type RunStatus = 'idle' | 'running' | 'done' | 'failed' | 'timeout'

export interface RunnerState {
  readonly status: RunStatus
  readonly entries: readonly SandboxLogEntry[]
  readonly calls: readonly SimulatedCall[]
  readonly result: RunResult | undefined
  readonly pdfUrls: Readonly<Record<string, string>>
  readonly startedAt: number | undefined
}

const RUN_TIMEOUT_MS = 20_000

function withEntry(
  entries: readonly SandboxLogEntry[],
  entry: ConsoleEntry,
): readonly SandboxLogEntry[] {
  return [...entries, { ...entry, id: entries.length + 1 }]
}

const initialState: RunnerState = {
  status: 'idle',
  entries: [],
  calls: [],
  result: undefined,
  pdfUrls: {},
  startedAt: undefined,
}

export function useSandboxRunner(runnerUrl: string) {
  const [state, setState] = useState<RunnerState>(initialState)
  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const runIdRef = useRef(0)
  const urlsRef = useRef<string[]>([])

  const releaseUrls = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
    urlsRef.current = []
  }, [])

  const stop = useCallback(() => {
    clearTimeout(timerRef.current)
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  useEffect(
    () => () => {
      stop()
      releaseUrls()
    },
    [stop, releaseUrls],
  )

  const run = useCallback(
    (code: string) => {
      stop()
      releaseUrls()
      runIdRef.current += 1
      const runId = runIdRef.current
      setState({ ...initialState, status: 'running', startedAt: performance.now() })

      let worker: Worker
      try {
        worker = new Worker(runnerUrl, { type: 'module', name: 'kassza-sandbox' })
      } catch (error) {
        setState((current) => ({
          ...current,
          status: 'failed',
          entries: withEntry(current.entries, {
            level: 'error',
            time: 0,
            args: [
              {
                t: 'string',
                v: `A sandbox futtatókörnyezete nem indult el: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          }),
        }))
        return
      }
      workerRef.current = worker

      worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
        const message = event.data
        if (message.type === 'ready') {
          worker.postMessage({ type: 'run', runId, code })
          return
        }
        if (message.runId !== runId) return
        if (message.type === 'console') {
          setState((current) => ({
            ...current,
            entries: withEntry(current.entries, message.entry),
          }))
        } else if (message.type === 'call') {
          setState((current) => ({ ...current, calls: [...current.calls, message.call] }))
        } else if (message.type === 'bytes') {
          const url = URL.createObjectURL(new Blob([message.buffer], { type: 'application/pdf' }))
          urlsRef.current.push(url)
          setState((current) => ({
            ...current,
            pdfUrls: { ...current.pdfUrls, [message.ref]: url },
          }))
        } else if (message.type === 'done') {
          stop()
          setState((current) => ({
            ...current,
            status: message.result.ok ? 'done' : 'failed',
            result: message.result,
          }))
        }
      })

      worker.addEventListener('error', (event) => {
        stop()
        setState((current) => ({
          ...current,
          status: 'failed',
          entries: withEntry(current.entries, {
            level: 'error',
            time: 0,
            args: [{ t: 'string', v: `Váratlan hiba a sandboxban: ${event.message}` }],
          }),
        }))
      })

      timerRef.current = setTimeout(() => {
        stop()
        setState((current) => ({ ...current, status: 'timeout' }))
      }, RUN_TIMEOUT_MS)
    },
    [runnerUrl, stop, releaseUrls],
  )

  const cancel = useCallback(() => {
    if (!workerRef.current) return
    stop()
    setState((current) => ({
      ...current,
      status: 'failed',
      entries: withEntry(current.entries, {
        level: 'warn',
        time: 0,
        args: [{ t: 'string', v: 'A futást leállítottad.' }],
      }),
    }))
  }, [stop])

  return { state, run, cancel }
}
