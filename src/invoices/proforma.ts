import type { AgentContext, RequestOptions } from '../core/context'
import { SzamlazzError } from '../core/errors'
import {
  type AgentResponse,
  parseResponseXml,
  throwIfHeaderError,
  throwIfHttpError,
  throwIfTextError,
  throwIfXmlFailure,
  unexpectedResponse,
} from '../core/response'
import { childText } from '../core/xml/parse'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import { requireText, validationError } from './reference'

export type ProformaReference =
  | string
  | { readonly proformaNumber: string }
  | { readonly orderNumber: string }

export const PROFORMA_NOT_FOUND_CODE = 335

const RESPONSE_ROOTS: ReadonlySet<string> = new Set(['xmlszamladbkdelvalasz', 'xmlszamlavalasz'])

const REFERENCE_HINT =
  'Add meg a díjbekérő számát szövegként, vagy pontosan egyet ezek közül: { proformaNumber }, { orderNumber }.'

interface ResolvedProformaReference {
  readonly proformaNumber?: string | undefined
  readonly orderNumber?: string | undefined
}

function resolveProformaReference(reference: ProformaReference): ResolvedProformaReference {
  if (typeof reference === 'string') {
    return { proformaNumber: requireText(reference, `Üres díjbekérőszám. ${REFERENCE_HINT}`) }
  }
  if (typeof reference !== 'object' || reference === null) {
    throw validationError(`Érvénytelen díjbekérő-hivatkozás. ${REFERENCE_HINT}`)
  }
  const record = reference as Readonly<Record<string, unknown>>
  const hasNumber = record.proformaNumber !== undefined
  const hasOrder = record.orderNumber !== undefined
  if (hasNumber === hasOrder) {
    throw validationError(`Érvénytelen díjbekérő-hivatkozás. ${REFERENCE_HINT}`)
  }
  return hasNumber
    ? {
        proformaNumber: requireText(
          record.proformaNumber,
          `Üres proformaNumber. ${REFERENCE_HINT}`,
        ),
      }
    : { orderNumber: requireText(record.orderNumber, `Üres orderNumber. ${REFERENCE_HINT}`) }
}

export function buildDeleteProformaXml(
  credentials: readonly XmlNode[],
  reference: ProformaReference,
): string {
  const resolved = resolveProformaReference(reference)
  return buildXmlDocument({
    root: 'xmlszamladbkdel',
    namespace: 'http://www.szamlazz.hu/xmlszamladbkdel',
    schemaLocation: 'http://www.szamlazz.hu/docs/xsds/szamladbkdel/xmlszamladbkdel.xsd',
    children: [
      el('beallitasok', [...credentials]),
      el('fejlec', [
        optionalEl('szamlaszam', resolved.proformaNumber),
        optionalEl('rendelesszam', resolved.orderNumber),
      ]),
    ],
  })
}

function withProformaCategory(error: unknown): unknown {
  if (!(error instanceof SzamlazzError) || error.code !== PROFORMA_NOT_FOUND_CODE) return error
  return new SzamlazzError(error.message, {
    category: 'not_found',
    code: error.code,
    hint: 'A díjbekérő nem létezik, vagy már törölték.',
    action: error.action,
    httpStatus: error.httpStatus,
    rawResponse: error.rawResponse,
    cause: error,
  })
}

export function parseDeleteProformaResponse(response: AgentResponse): void {
  try {
    throwIfHeaderError(response)
    throwIfTextError(response)
    throwIfHttpError(response)
    const root = parseResponseXml(response)
    throwIfXmlFailure(root, response)
    if (!RESPONSE_ROOTS.has(root.name) || childText(root, 'sikeres')?.toLowerCase() !== 'true') {
      throw unexpectedResponse(response, 'xmlszamladbkdelvalasz XML választ vártunk.')
    }
  } catch (error) {
    throw withProformaCategory(error)
  }
}

export async function deleteProforma(
  ctx: AgentContext,
  reference: ProformaReference,
  options: RequestOptions = {},
): Promise<void> {
  const xml = buildDeleteProformaXml(ctx.credentials, reference)
  await ctx.execute(
    { action: 'deleteProforma', xml, signal: options.signal },
    parseDeleteProformaResponse,
  )
}
