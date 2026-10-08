import type { AgentAction } from './actions'

export type KasszaWarningKind =
  | 'session'
  | 'ledger'
  | 'hook'
  | 'document'
  | 'lock'
  | 'dedupe'
  | 'cache'

export interface KasszaWarning {
  readonly kind: KasszaWarningKind
  readonly message: string
  readonly error: unknown
  readonly action?: AgentAction | undefined
  readonly operation?: string | undefined
}

export type WarningHook = (warning: KasszaWarning) => void

export function emitWarning(
  hook: WarningHook | undefined,
  warning: KasszaWarning,
  fallback: 'silent' | 'console' = 'silent',
): void {
  if (!hook) {
    if (fallback === 'console') console.warn(`[szamlazz] ${warning.message}`, warning.error)
    return
  }
  try {
    const result: unknown = hook(warning)
    if (result instanceof Promise) result.catch(() => undefined)
  } catch {
    return
  }
}
