import { createAgentContext, type RequestOptions, type SzamlazzOptions } from '../core/context'
import { isSzamlazzError, SzamlazzError } from '../core/errors'
import { getInvoicePdf } from '../invoices/pdf'

export type DelegationState =
  | 'active'
  | 'awaiting-approval'
  | 'awaiting-owner-registration'
  | 'multi-account-user'

export interface DelegationProbeResult {
  readonly state: DelegationState
  readonly message: string
  readonly error?: SzamlazzError | undefined
}

export interface ProbeDelegationOptions extends SzamlazzOptions, RequestOptions {}

export const DELEGATION_PROBE_INVOICE_NUMBER = 'KASSZA-DELEGATION-PROBE-0'

const MESSAGES: Readonly<Record<DelegationState, string>> = {
  active: 'A megbízotti kapcsolat él: a dedikált felhasználó be tud lépni a megbízó fiókjába.',
  'awaiting-approval':
    'A belépés sikertelen (3): a megbízó még nem fogadta el a csatlakozási kérelmet, vagy hibás a felhasználónév vagy a jelszó.',
  'awaiting-owner-registration':
    'A megbízó még nem vette birtokba az új fiókot (250). A Számlázz.hu minden ilyen hívásnál újraküldi neki a fiókgazdai meghívót, ezért ne ellenőrizd ciklusban.',
  'multi-account-user':
    'A dedikált felhasználó több fiókhoz fér hozzá (164), így Számla Agenttel nem használható. Vedd le a hozzáférését a többi fiókról, vagy használj új dedikált felhasználót.',
}

const STATES_BY_CODE: ReadonlyMap<number, DelegationState> = new Map([
  [3, 'awaiting-approval'],
  [250, 'awaiting-owner-registration'],
  [164, 'multi-account-user'],
])

function configuration(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'configuration' })
}

export async function probeDelegation(
  options: ProbeDelegationOptions,
): Promise<DelegationProbeResult> {
  const { signal, agentKey, ...rest } = options
  if (agentKey !== undefined) {
    throw configuration(
      'A megbízotti kapcsolat ellenőrzéséhez a dedikált felhasználó felhasználónevét és jelszavát add meg. Az Agent kulcs a fiókhoz tartozik, nem hordozza a megbízotti kapcsolatot.',
    )
  }
  if (!rest.username?.trim() || !rest.password) {
    throw configuration('Add meg a dedikált (usrMb) felhasználó felhasználónevét és jelszavát.')
  }
  const ctx = createAgentContext(rest)
  try {
    await getInvoicePdf(ctx, DELEGATION_PROBE_INVOICE_NUMBER, { signal })
    return { state: 'active', message: MESSAGES.active }
  } catch (error) {
    if (!isSzamlazzError(error)) throw error
    if (error.isNotFound || error.code === 7) return { state: 'active', message: MESSAGES.active }
    const state = error.code === undefined ? undefined : STATES_BY_CODE.get(error.code)
    if (state === undefined) throw error
    return { state, message: MESSAGES[state], error }
  }
}
